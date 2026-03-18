
import React, { useState, useEffect } from 'react';
import { Calendar } from './components/Calendar';
import { TaskForm } from './components/TaskForm';
import { ImportModal } from './components/ImportModal';
import { EventDetailsModal } from './components/EventDetailsModal';
import { EventsView } from './components/EventsView';
import { Button } from './components/Button';
import { identifyClasses, analyzeTaskSemantics, generateFullSchedule } from './services/geminiService';
import { CalendarEvent, Task, EventType } from './types';

// --- Persistence Helpers ---
const STORAGE_EVENTS_KEY = 'better_calendar_events_v1';
const STORAGE_TASKS_KEY = 'better_calendar_tasks_v1';

const dateReviver = (key: string, value: any) => {
  // Convert date strings back to Date objects during JSON parse
  if (['start', 'end', 'deadline', 'recurrenceEndDate'].includes(key) && value) {
    return new Date(value);
  }
  return value;
};

const loadFromStorage = <T,>(key: string, defaultValue: T): T => {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item, dateReviver) : defaultValue;
  } catch (error) {
    console.error(`Error loading ${key} from storage:`, error);
    return defaultValue;
  }
};

function App() {
  const [view, setView] = useState<'calendar' | 'events' | 'newEvent' | 'editEvent'>('calendar');
  
  // Initialize state from LocalStorage
  const [events, setEvents] = useState<CalendarEvent[]>(() => loadFromStorage(STORAGE_EVENTS_KEY, []));
  const [tasks, setTasks] = useState<Task[]>(() => loadFromStorage(STORAGE_TASKS_KEY, []));
  
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const [currentDate, setCurrentDate] = useState(new Date());

  // --- Persistence Effects ---
  useEffect(() => {
    localStorage.setItem(STORAGE_EVENTS_KEY, JSON.stringify(events));
  }, [events]);

  useEffect(() => {
    localStorage.setItem(STORAGE_TASKS_KEY, JSON.stringify(tasks));
  }, [tasks]);

  const handleNavigate = (direction: 'prev' | 'next' | 'today') => {
    const newDate = new Date(currentDate);
    if (direction === 'today') {
      setCurrentDate(new Date());
    } else if (direction === 'next') {
      newDate.setDate(newDate.getDate() + 7);
      setCurrentDate(newDate);
    } else {
      newDate.setDate(newDate.getDate() - 7);
      setCurrentDate(newDate);
    }
  };

  // REPLACEMENT: Async AI Scheduler
  const runGlobalScheduler = async (currentEvents: CalendarEvent[], currentTasks: Task[]) => {
    const now = new Date();
    
    // 1. Keep non-AI events (Fixed)
    // 2. Keep AI events that have already ended (History)
    // 3. IMPORTANT: Ignore Ghost events when calculating busy slots for the backend
    const preservedEvents = currentEvents.filter(e => 
        (e.type !== EventType.AI_WORK_SESSION || e.end <= now) && !e.isGhost
    );
    
    // 3. Identify tasks that need scheduling (Not completed AND isScheduled=true AND has hours needed)
    // Removed category filter to allow AI to schedule Meetings/Habits if requested via AI mode.
    const tasksToSchedule = currentTasks.filter(t => !t.isCompleted && t.isScheduled && t.totalHoursNeeded > 0); 
    
    // 4. Generate new future sessions using AI
    let newSessions: CalendarEvent[] = [];
    if (tasksToSchedule.length > 0) {
        newSessions = await generateFullSchedule(preservedEvents, tasksToSchedule);
    }
    
    return [...preservedEvents, ...newSessions];
  };

  const handleImport = async (importedEvents: CalendarEvent[]) => {
    setIsImportModalOpen(false);
    setIsProcessing(true);
    try {
      const classIds = await identifyClasses(importedEvents);
      const taggedEvents = importedEvents.map(e => ({
        ...e,
        isClass: classIds.includes(e.id),
        // Solid Blue Block with White Text for best legibility
        color: classIds.includes(e.id) ? "bg-blue-600 border-blue-700 text-white shadow-sm" : e.color
      }));

      // Combine existing events with new imported ones, then reschedule
      const allEvents = [...events, ...taggedEvents];
      const optimizedSchedule = await runGlobalScheduler(allEvents, tasks); // Await AI
      setEvents(optimizedSchedule);
    } catch (error) {
      console.error("Import error:", error);
      alert("Error processing schedule.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCreateOrUpdateTask = async (taskInput: Task) => {
    // Note: We do NOT set isProcessing(true) here for AI tasks anymore because we use Optimistic UI
    try {
      let task = { ...taskInput };

      // AI Analysis only for flexible Tasks if not provided and in AI mode
      if (task.category === 'Task' && task.totalHoursNeeded > 0) {
          // This is fast enough to await, or we could optimistic this too, but for now we await classification
          // If we wanted true sub-second for everything, we'd skip this or mock it.
          // Let's assume this is fast enough (Flash model).
          const aiAnalysis = await analyzeTaskSemantics(task.title, task.description);
          task.energyLevel = aiAnalysis.energyLevel;
      }

      let updatedTasks;
      const isUpdate = tasks.some(t => t.id === task.id);
      
      const newManualEvents: CalendarEvent[] = [];
      
      // Check for Manual Time fields
      if (task.meetingDate && task.meetingStartTime && task.meetingEndTime) {
         // ... (Manual Habit Logic - kept same) ...
         if (task.category === 'Habit' && task.recurrenceEndDate && task.preferredDays.length > 0) {
             const [sYear, sMonth, sDay] = task.meetingDate.split('-').map(Number);
             const loopDate = new Date(sYear, sMonth - 1, sDay); 
             
             const eD = new Date(task.recurrenceEndDate);
             const finalDate = new Date(eD.getFullYear(), eD.getMonth(), eD.getDate());
             finalDate.setHours(23, 59, 59, 999);

             let safety = 0;
             while (loopDate <= finalDate && safety < 365) {
                 const dayName = loopDate.toLocaleDateString('en-US', { weekday: 'long' });
                 
                 if (task.preferredDays.includes(dayName)) {
                     const pad = (n: number) => n < 10 ? '0'+n : n;
                     const dateStr = `${loopDate.getFullYear()}-${pad(loopDate.getMonth()+1)}-${pad(loopDate.getDate())}`;
                     
                     const s = new Date(`${dateStr}T${task.meetingStartTime}`);
                     const e = new Date(`${dateStr}T${task.meetingEndTime}`);
                     
                     newManualEvents.push({
                         id: `manual-${task.id}-${dateStr}`,
                         title: task.title,
                         start: s,
                         end: e,
                         type: EventType.MANUAL,
                         relatedTaskId: task.id,
                         color: "bg-teal-50 border-teal-200 text-teal-700",
                         description: task.description,
                         location: task.location // Pass Location
                     });
                 }
                 loopDate.setDate(loopDate.getDate() + 1);
                 safety++;
             }

         } else {
             // Single Manual Meeting/Event
             const start = new Date(`${task.meetingDate}T${task.meetingStartTime}`);
             const end = new Date(`${task.meetingDate}T${task.meetingEndTime}`);
             newManualEvents.push({
                 id: `manual-${task.id}`,
                 title: task.title,
                 start,
                 end,
                 type: EventType.MANUAL,
                 relatedTaskId: task.id,
                 color: task.category === 'Meeting' 
                    ? "bg-purple-50 border-purple-200 text-purple-700" 
                    : "bg-gray-50 border-gray-200 text-gray-700",
                 description: task.description,
                 location: task.location // Pass Location
             });
         }
      }

      if (isUpdate) {
        updatedTasks = tasks.map(t => t.id === task.id ? task : t);
      } else {
        updatedTasks = [...tasks, task];
      }

      // --- OPTIMISTIC UI LOGIC ---
      
      // 1. Close Modal Immediately
      setView('calendar');
      setEditingTask(null);
      setTasks(updatedTasks);
      
      // 2. Prepare Events (remove old future AI events for this task)
      const now = new Date();
      let currentEvents = events.filter(e => {
          if (e.relatedTaskId === task.id) {
              if (e.type === EventType.AI_WORK_SESSION && e.end <= now) return true; // Keep history
              return false; // Remove future
          }
          return true;
      });
      currentEvents = [...currentEvents, ...newManualEvents];

      // 3. Inject Ghost Event if it's an AI task
      if (task.isScheduled && task.totalHoursNeeded > 0 && newManualEvents.length === 0) {
          const ghostStart = new Date();
          ghostStart.setHours(ghostStart.getHours() + 1, 0, 0, 0); // Tentative: Next hour
          const ghostEnd = new Date(ghostStart.getTime() + (task.totalHoursNeeded * 60 * 60 * 1000));
          
          const ghostEvent: CalendarEvent = {
              id: `ghost-${task.id}`,
              title: `Scheduling: ${task.title}...`,
              start: ghostStart,
              end: ghostEnd,
              type: EventType.AI_WORK_SESSION,
              relatedTaskId: task.id,
              color: "bg-gray-100",
              isGhost: true, // Triggers Skeleton UI
              location: task.location // Pass location to ghost
          };
          
          // Show ghost immediately
          setEvents([...currentEvents, ghostEvent]);
      } else {
          // Manual events are shown immediately
          setEvents(currentEvents);
      }

      // 4. Run AI Backend (Parallel/Async)
      // This will overwrite the ghost event when it returns
      runGlobalScheduler(currentEvents, updatedTasks).then((optimizedSchedule) => {
          setEvents(optimizedSchedule);
      }).catch((err) => {
          console.error("Scheduling failed", err);
          alert("Automatic scheduling failed. Please try again.");
          // Rollback ghost
          setEvents(currentEvents);
      });

    } catch (error) {
      console.error(error);
      alert("Error saving task.");
      setIsProcessing(false);
    }
  };

  const handleDeleteEvent = async (id: string) => {
    // Simply delete the event locally.
    // We do NOT trigger a full AI reschedule here anymore to avoid "ridiculous" wait times for simple deletions.
    setEvents(prev => prev.filter(e => e.id !== id));
  };

  const handleDeleteTask = async (taskId: string) => {
      // Remove task immediately
      const updatedTasks = tasks.filter(t => t.id !== taskId);
      setTasks(updatedTasks);
      
      // Remove associated events immediately
      setEvents(prev => prev.filter(e => e.relatedTaskId !== taskId));
      
      // We do NOT trigger AI rescheduling here. Gaps will simply remain empty until the next manual or AI action.
  };

  const handleUpdateEvent = (updatedEvent: CalendarEvent) => {
    const finalEvent = {
        ...updatedEvent,
        type: updatedEvent.type === EventType.AI_WORK_SESSION ? EventType.MANUAL : updatedEvent.type,
    };
    setEvents(prevEvents => {
        const otherEvents = prevEvents.filter(e => e.id !== updatedEvent.id);
        const newEventList = [...otherEvents, finalEvent];
        return newEventList;
    });
  };

  const handleToggleTaskComplete = async (taskId: string, isComplete: boolean) => {
      // Optimistic Update
      const updatedTasks = tasks.map(t => t.id === taskId ? { ...t, isCompleted: isComplete } : t);
      setTasks(updatedTasks);

      if (isComplete) {
          const now = new Date();
          setEvents(prev => prev.filter(e => {
              if (e.relatedTaskId === taskId && e.type === EventType.AI_WORK_SESSION && e.start > now) return false;
              return true;
          }));
      } else {
          // Re-schedule in background (Uncompleting a task usually implies intent to do it, so we allow rescheduling here)
          runGlobalScheduler(events, updatedTasks).then(setEvents);
      }
  };
  
  const handleCalendarSlotClick = (date: Date) => {
      const startStr = date.toTimeString().slice(0, 5); // HH:mm
      const end = new Date(date.getTime() + 60*60*1000); // +1 hour
      const endStr = end.toTimeString().slice(0, 5);
      
      const pad = (n: number) => n < 10 ? '0'+n : n;
      const dateStr = `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;

      const draftTask: Task = {
          id: '', 
          category: 'Meeting', 
          title: '',
          description: '',
          priority: 'Medium',
          files: [],
          difficulty: 5,
          totalHoursNeeded: 0, // Manual = 0 hours needed for AI
          deadline: new Date(date.getTime() + 7*24*60*60*1000), 
          energyLevel: 'High',
          meetingDate: dateStr,
          meetingStartTime: startStr,
          meetingEndTime: endStr,
          preferredDays: [],
          preferredTimeStart: '09:00',
          preferredTimeEnd: '17:00',
          preferredSessionDuration: 1,
          isScheduled: true 
      };

      setEditingTask(draftTask);
      setView('newEvent');
  };

  const selectedTask = selectedEvent?.relatedTaskId 
    ? tasks.find(t => t.id === selectedEvent.relatedTaskId) 
    : undefined;

  return (
    <div className="min-h-screen flex flex-col relative bg-gray-50 text-gray-900 font-sans">
      <nav className="border-b border-gray-200 bg-white sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <span className="bg-indigo-600 text-white p-1.5 rounded mr-3 font-bold">BC</span>
              <h1 className="text-xl font-bold tracking-tight text-gray-900 hidden sm:block">BetterCalendar</h1>
              
              <div className="ml-8 flex space-x-1">
                 <button 
                    onClick={() => setView('calendar')}
                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${view === 'calendar' ? 'bg-gray-100 text-indigo-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}`}
                 >
                    Calendar
                 </button>
                 <button 
                    onClick={() => setView('events')}
                    className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${view === 'events' ? 'bg-gray-100 text-indigo-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'}`}
                 >
                    Events
                 </button>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <Button variant="ghost" onClick={() => setIsImportModalOpen(true)}>Import</Button>
              <Button onClick={() => { setEditingTask(null); setView('newEvent'); }} disabled={view === 'newEvent'}>
                + New Event
              </Button>
            </div>
          </div>
        </div>
      </nav>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {view === 'calendar' && (
          <>
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900 tracking-tight">Dashboard</h2>
                <p className="text-sm text-gray-500 mt-1">
                  {events.filter(e => e.type === EventType.AI_WORK_SESSION && !e.isGhost).length} active work sessions.
                </p>
              </div>
              <div className="flex gap-4 text-xs font-medium text-gray-600">
                 <div className="flex items-center"><div className="w-2 h-2 bg-blue-600 rounded-full mr-2"></div> Class</div>
                 <div className="flex items-center"><div className="w-2 h-2 bg-gray-400 rounded-full mr-2"></div> Manual</div>
                 <div className="flex items-center"><div className="w-2 h-2 bg-teal-400 rounded-full mr-2"></div> Habit / Recurring</div>
                 <div className="flex items-center"><div className="w-2 h-2 bg-indigo-600 rounded-full mr-2"></div> Task</div>
              </div>
            </div>
            <div className="h-[calc(100vh-200px)]">
               <Calendar 
                  events={events} 
                  currentDate={currentDate} 
                  onEventClick={setSelectedEvent}
                  onNavigate={handleNavigate}
                  onEventUpdate={handleUpdateEvent}
                  onSlotClick={handleCalendarSlotClick}
               />
            </div>
          </>
        )}

        {view === 'events' && (
            <EventsView 
                tasks={tasks} 
                events={events}
                onEditTask={(task) => {
                    setEditingTask(task);
                    setView('editEvent');
                }}
                onDeleteTask={handleDeleteTask}
                onToggleComplete={handleToggleTaskComplete}
            />
        )}

        {(view === 'newEvent' || view === 'editEvent') && (
          <div className="py-8">
            <TaskForm 
              initialTask={editingTask}
              existingEvents={events}
              onSubmit={handleCreateOrUpdateTask} 
              onCancel={() => {
                  setEditingTask(null);
                  setView('calendar');
              }} 
            />
          </div>
        )}
      </main>

      <ImportModal 
        isOpen={isImportModalOpen} 
        onClose={() => setIsImportModalOpen(false)} 
        onImport={handleImport} 
      />

      <EventDetailsModal 
        event={selectedEvent} 
        relatedTask={selectedTask}
        onClose={() => setSelectedEvent(null)}
        onDelete={handleDeleteEvent}
        onUpdate={handleUpdateEvent}
      />

      {isProcessing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900 bg-opacity-50 backdrop-blur-sm transition-opacity">
            <div className="flex flex-col items-center p-6 bg-white rounded-lg shadow-xl">
                <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-indigo-600 mb-4"></div>
                <h3 className="text-lg font-bold text-gray-900 tracking-widest uppercase">AI Planning</h3>
                <p className="text-xs text-gray-500 mt-2">Consulting the AI for the best slots...</p>
            </div>
        </div>
      )}

    </div>
  );
}

export default App;
