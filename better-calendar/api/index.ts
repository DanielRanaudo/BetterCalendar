import express from "express";
import { GoogleGenAI } from "@google/genai";

const app = express();
app.use(express.json());

// Initialize Gemini API
let ai: GoogleGenAI | null = null;
const getAIClient = () => {
  const apiKey = process.env.API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("API Key missing");
  }
  if (!ai) {
    ai = new GoogleGenAI({ apiKey });
  }
  return ai;
};

const MODEL_NAME = "gemini-3-flash-preview";

// API Routes
app.post("/api/gemini/identify-classes", async (req, res) => {
  try {
    const { events } = req.body;
    if (!events || events.length === 0) return res.json({ classTitles: [] });

    const uniqueEvents = new Map<string, { title: string; description: string }>();
    events.forEach((e: any) => {
      if (!uniqueEvents.has(e.title)) uniqueEvents.set(e.title, { title: e.title, description: e.description || "" });
    });
    const distinctEventList = Array.from(uniqueEvents.values()).slice(0, 150);
    const prompt = `Identify University Classes in list: ${JSON.stringify(distinctEventList)}. Return {"classTitles": ["Exact Title"]}.`;

    const client = getAIClient();
    const response = await client.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: { responseMimeType: "application/json", temperature: 0.1 },
    });

    const result = JSON.parse(response.text || '{}');
    res.json(result);
  } catch (error) {
    console.error("❌ Class Identification Failed:", error);
    res.status(500).json({ error: "Failed to identify classes" });
  }
});

app.post("/api/gemini/analyze-task", async (req, res) => {
  try {
    const { title, description } = req.body;
    if (!title && !description) return res.json({ energyLevel: 'High' });

    const prompt = `Classify task energy: "${title} ${description}". Return {"energyLevel": "High" or "Low"}. High=Morning/Focus, Low=Evening/Relax.`;
    const client = getAIClient();
    const response = await client.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: { responseMimeType: "application/json", temperature: 0.1 }
    });

    const result = JSON.parse(response.text || '{}');
    res.json({ energyLevel: result.energyLevel || 'High' });
  } catch (error) {
    console.error("❌ Task Analysis Failed:", error);
    res.status(500).json({ error: "Failed to analyze task" });
  }
});

app.post("/api/gemini/generate-schedule", async (req, res) => {
  try {
    const { relevantFixed, tasksContext, timeZone, localTime, contextEnd } = req.body;

    const systemPrompt = `You are a high-performance scheduling engine. 
    You DO NOT speak. You DO NOT output conversational text. 
    You ONLY output valid JSON.
    
    CRITICAL INSTRUCTION:
    Your output must be a single JSON object containing a 'sessions' array.
    This mimics a parallel function call to schedule multiple tasks at once.
    
    INPUT DATA:
    - User Timezone: ${timeZone}
    - Local Time: ${localTime}
    - Fixed Slots (Busy): Array of start/end times (includes safety buffers).
    - Tasks: Array of tasks to schedule.

    LOGIC:
    1. Find gaps in Fixed Slots between ${localTime} and ${contextEnd}.
    2. Place Tasks in gaps before their deadline.
    3. Convert User Local Time instructions (e.g. "at 5pm") to UTC ISO8601.
    4. CONSTRAINT: You MUST leave at least 15 minutes of gap between any two generated sessions. Do not schedule tasks strictly back-to-back.
    5. CRITICAL FOR HABITS: If a task category is 'Habit', you MUST schedule it REPEATEDLY (e.g. daily, or as instructed) across the ENTIRE provided context window (up to 120 days). Do not just schedule it once. Fill the calendar.
    6. Return strict JSON.
    `;

    const userContent = JSON.stringify({
      fixedSlots: relevantFixed,
      tasks: tasksContext
    });

    const client = getAIClient();
    const response = await client.models.generateContent({
      model: MODEL_NAME,
      contents: userContent,
      config: { 
        systemInstruction: systemPrompt,
        responseMimeType: "application/json", 
        temperature: 0.2 
      }
    });

    const result = JSON.parse(response.text || '{}');
    res.json(result);
  } catch (error) {
    console.error("❌ AI Scheduler Error:", error);
    res.status(500).json({ error: "Failed to generate schedule" });
  }
});

export default app;
