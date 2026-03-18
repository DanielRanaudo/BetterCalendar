
import { CalendarEvent, Task, EventType, EnergyLevel } from "../types";

const callWithTimeout = async <T>(promise: Promise<T>, ms: number): Promise<T> => {
    let timeoutId: any;
    const timeoutPromise = new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`API Request timed out after ${ms}ms`)), ms);
    });
    try {
        const result = await Promise.race([promise, timeoutPromise]);
        clearTimeout(timeoutId);
        return result;
    } catch (e) {
        clearTimeout(timeoutId);
        throw e;
    }
};

export const identifyClasses = async (events: CalendarEvent[]): Promise<string[]> => {
  if (events.length === 0) return [];
  console.log("🔍 identifying classes via API...");
  
  try {
    const apiCall = fetch('/api/gemini/identify-classes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ events })
    }).then(res => res.json());

    const result = await callWithTimeout<{ classTitles: string[] }>(apiCall, 15000);
    const classTitles = new Set(result.classTitles || []);
    return events.filter(e => classTitles.has(e.title)).map(e => e.id);
  } catch (error) { 
      console.error("❌ Class Identification Failed:", error);
      return []; 
  }
};

export const analyzeTaskSemantics = async (title: string, description: string): Promise<{ energyLevel: EnergyLevel }> => {
    if (!title && !description) return { energyLevel: 'High' };
    console.log(`⚡ Analyzing task energy: ${title}`);

    try {
        const apiCall = fetch('/api/gemini/analyze-task', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, description })
        }).then(res => res.json());

        const result = await callWithTimeout<{ energyLevel: EnergyLevel }>(apiCall, 8000);
        return { energyLevel: result.energyLevel || 'High' };
    } catch (e) { 
        console.error("❌ Task Analysis Failed:", e);
        return { energyLevel: 'High' }; 
    }
};

export const generateFullSchedule = async (fixedEvents: CalendarEvent[], tasksToSchedule: Task[]): Promise<CalendarEvent[]> => {
    if (tasksToSchedule.length === 0) return [];
    console.log(`🤖 Generating schedule for ${tasksToSchedule.length} tasks...`);

    const now = new Date();
    
    // Provide a 120-day lookahead context for scheduling
    const contextEnd = new Date(now);
    contextEnd.setDate(contextEnd.getDate() + 120);

    const relevantFixed = fixedEvents
        .filter(e => e.start >= now && e.start <= contextEnd && !e.isGhost) // Ignore ghost events for backend logic
        .map(e => {
            // APPLY BUFFER LOGIC:
            // Pad existing events by 15 minutes on both ends.
            // This forces the AI to see the adjacent time as "busy", ensuring 
            // the next task starts at least 15 minutes later.
            const bufferedStart = new Date(e.start);
            bufferedStart.setMinutes(bufferedStart.getMinutes() - 15);
            
            const bufferedEnd = new Date(e.end);
            bufferedEnd.setMinutes(bufferedEnd.getMinutes() + 15);

            return {
                title: e.title,
                start: bufferedStart.toISOString(),
                end: bufferedEnd.toISOString()
            };
        });

    const tasksContext = tasksToSchedule.map(t => ({
        id: t.id,
        category: t.category,
        title: t.title,
        instructions: t.description, 
        durationHours: t.totalHoursNeeded,
        deadline: t.deadline.toISOString()
    }));

    // Detect User Timezone Information
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const localTime = now.toLocaleString('en-US', { timeZone, hour12: false });

    try {
        const apiCall = fetch('/api/gemini/generate-schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            relevantFixed,
            tasksContext,
            timeZone,
            localTime,
            contextEnd: contextEnd.toISOString()
          })
        }).then(res => res.json());

        // Increased timeout to 120s to handle the large generation volume for 120-day schedules
        const result = await callWithTimeout<{ sessions: any[] }>(apiCall, 120000); 
        console.log("✅ API Response received");
        
        return (result.sessions || []).map(s => {
            const task = tasksToSchedule.find(t => t.id === s.taskId);
            if (!task) return null;
            return {
                id: crypto.randomUUID(),
                title: task.title,
                start: new Date(s.start),
                end: new Date(s.end),
                type: EventType.AI_WORK_SESSION,
                relatedTaskId: task.id,
                description: s.reasoning,
                location: task.location, // Pass location if available
                color: task.category === 'Habit' ? "bg-teal-50 border-teal-200 text-teal-700" : (task.category === 'Meeting' ? "bg-purple-50 border-purple-200 text-purple-700" : "bg-indigo-50 border-indigo-200 text-indigo-700"),
                priority: task.priority
            };
        }).filter(e => e !== null) as CalendarEvent[];

    } catch (e) {
        console.error("❌ API Scheduler Error:", e);
        // Throwing here so the UI knows it failed
        throw e;
    }
};
