
import React, { useState, useEffect } from 'react';
import { Task, TaskFile, Priority, TaskCategory, CalendarEvent } from '../types';
import { Button } from './Button';

interface TaskFormProps {
  initialTask?: Task | null;
  existingEvents?: CalendarEvent[];
  onSubmit: (task: Task) => Promise<void>;
  onCancel: () => void;
}

type ScheduleMode = 'AI' | 'MANUAL';

const DAYS_OF_WEEK = [
    { label: 'S', value: 'Sunday' },
    { label: 'M', value: 'Monday' },
    { label: 'T', value: 'Tuesday' },
    { label: 'W', value: 'Wednesday' },
    { label: 'T', value: 'Thursday' },
    { label: 'F', value: 'Friday' },
    { label: 'S', value: 'Saturday' },
];

export const TaskForm: React.FC<TaskFormProps> = ({ initialTask, existingEvents = [], onSubmit, onCancel }) => {
  // Mode Selection
  const [mode, setMode] = useState<ScheduleMode>('AI');

  // Common Fields
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState(""); // Added Location
  const [category, setCategory] = useState<TaskCategory>('Task');
  
  // AI Specific
  const [deadline, setDeadline] = useState("");
  const [totalHours, setTotalHours] = useState(1);
  
  // Manual Specific
  const [priority, setPriority] = useState<Priority>('Medium');
  const [files, setFiles] = useState<TaskFile[]>([]);
  
  // Manual Meeting/Habit
  const [manualDate, setManualDate] = useState("");
  const [manualRecurrenceEnd, setManualRecurrenceEnd] = useState(""); // For Habits
  const [manualStart, setManualStart] = useState("09:00");
  const [manualEnd, setManualEnd] = useState("10:00");
  const [selectedDays, setSelectedDays] = useState<string[]>(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']);

  // Manual Task
  const [manualDueTime, setManualDueTime] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [manualConflict, setManualConflict] = useState<string | null>(null);

  useEffect(() => {
    if (initialTask) {
        setCategory(initialTask.category);
        setTitle(initialTask.title);
        setDescription(initialTask.description);
        setLocation(initialTask.location || "");
        setFiles(initialTask.files);
        setPriority(initialTask.priority);

        if (initialTask.meetingDate) {
            // Manual Meeting or Habit Start
            setMode('MANUAL');
            setManualDate(initialTask.meetingDate || "");
            setManualStart(initialTask.meetingStartTime || "09:00");
            setManualEnd(initialTask.meetingEndTime || "10:00");
            
            if (initialTask.category === 'Habit') {
                setSelectedDays(initialTask.preferredDays || []);
                // If recurring end date exists, use it, otherwise leave blank (indefinite)
                if (initialTask.recurrenceEndDate) {
                    const d = new Date(initialTask.recurrenceEndDate);
                    // If it's very far in the future, treat as empty (indefinite)
                    if (d.getFullYear() < new Date().getFullYear() + 2) {
                        const pad = (n: number) => n < 10 ? '0'+n : n;
                        setManualRecurrenceEnd(`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`);
                    }
                }
            }
        } else if (initialTask.totalHoursNeeded > 0 && initialTask.isScheduled) {
            // AI Task
            setMode('AI');
            setTotalHours(initialTask.totalHoursNeeded);
            const d = new Date(initialTask.deadline);
            if (!isNaN(d.getTime())) {
                const pad = (n: number) => n < 10 ? '0'+n : n;
                setDeadline(`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
            }
        } else {
            // Manual Task
            setMode('MANUAL');
            const d = new Date(initialTask.deadline);
            if (!isNaN(d.getTime())) {
                const pad = (n: number) => n < 10 ? '0'+n : n;
                setManualDate(`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`);
                if (d.getHours() !== 23 || d.getMinutes() !== 59) {
                     setManualDueTime(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
                }
            }
        }
    } else {
        // Default
        setMode('AI');
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(23, 59, 0, 0); 
        
        const pad = (n: number) => n < 10 ? '0'+n : n;
        setDeadline(`${tomorrow.getFullYear()}-${pad(tomorrow.getMonth()+1)}-${pad(tomorrow.getDate())}T${pad(tomorrow.getHours())}:${pad(tomorrow.getMinutes())}`);
        
        const todayStr = new Date().toISOString().split('T')[0];
        setManualDate(todayStr);
    }
  }, [initialTask]);

  // Conflict Detection
  useEffect(() => {
      if (mode === 'MANUAL' && category !== 'Task' && manualDate && manualStart && manualEnd) {
          const start = new Date(`${manualDate}T${manualStart}`);
          const end = new Date(`${manualDate}T${manualEnd}`);
          
          if (start >= end) {
              setManualConflict("End time must be after start time.");
              return;
          }

          if (category === 'Meeting') {
            const hasConflict = existingEvents.some(e => {
                if (initialTask && e.relatedTaskId === initialTask.id) return false;
                return (start < e.end && end > e.start);
            });

            if (hasConflict) {
                setManualConflict("⚠ Time slot conflicts with existing event.");
            } else {
                setManualConflict(null);
            }
          } else {
             setManualConflict(null);
          }
      } else {
          setManualConflict(null);
      }
  }, [mode, category, manualDate, manualStart, manualEnd, existingEvents, initialTask]);

  const toggleDay = (day: string) => {
      if (selectedDays.includes(day)) {
          setSelectedDays(prev => prev.filter(d => d !== day));
      } else {
          setSelectedDays(prev => [...prev, day]);
      }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles: TaskFile[] = Array.from(e.target.files).map((f: File) => ({
        name: f.name,
        size: f.size,
        type: f.type,
        url: URL.createObjectURL(f) 
      }));
      setFiles(prev => [...prev, ...newFiles]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    if (mode === 'AI') {
        // For Habits in AI mode, we don't require the deadline input, we auto-set it later.
        if (category !== 'Habit' && !deadline) { alert("Date is required."); setIsSubmitting(false); return; }
        if (totalHours <= 0) { alert("Hours needed must be greater than 0."); setIsSubmitting(false); return; }
    } else {
        if (!manualDate) { alert("Date is required."); setIsSubmitting(false); return; }
        
        if (category !== 'Task') {
            if (!manualStart || !manualEnd) { alert("Start and End times required."); setIsSubmitting(false); return; }
            if (manualConflict) { alert(manualConflict); setIsSubmitting(false); return; }
            
            if (category === 'Habit') {
                // Habit End Date is now optional (Indefinite)
                if (manualRecurrenceEnd && new Date(manualRecurrenceEnd) < new Date(manualDate)) { alert("End Date must be after Start Date."); setIsSubmitting(false); return; }
                if (selectedDays.length === 0) { alert("Please select at least one day for the habit."); setIsSubmitting(false); return; }
            }
        }
    }

    let calculatedDeadline = new Date();
    if (mode === 'AI') {
        if (category === 'Habit') {
             // For AI Habits, default to 1 year out to effectively be "indefinite" in the short-term context
             calculatedDeadline = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
        } else {
             calculatedDeadline = new Date(deadline);
        }
    } else {
        if (category === 'Task') {
            if (manualDueTime) {
                calculatedDeadline = new Date(`${manualDate}T${manualDueTime}`);
            } else {
                calculatedDeadline = new Date(`${manualDate}T23:59:00`);
            }
        } else {
            calculatedDeadline = new Date(`${manualDate}T${manualEnd}`);
        }
    }

    if (calculatedDeadline < new Date()) {
         if (category === 'Task' || (mode === 'AI' && category !== 'Habit')) {
             alert("The date cannot be in the past.");
             setIsSubmitting(false);
             return;
         }
    }

    // Handle Indefinite Habit logic
    let recurrenceEnd = undefined;
    if (mode === 'MANUAL' && category === 'Habit') {
        if (manualRecurrenceEnd) {
            recurrenceEnd = new Date(manualRecurrenceEnd);
        } else {
            // Indefinite: Set to 5 years from now for backend logic
            const future = new Date();
            future.setFullYear(future.getFullYear() + 5);
            recurrenceEnd = future;
        }
    }

    const taskToSave: Task = {
      id: (initialTask && initialTask.id) ? initialTask.id : crypto.randomUUID(),
      category,
      title,
      description,
      location, // Save Location
      
      // AI Fields
      totalHoursNeeded: mode === 'AI' ? totalHours : 0,
      deadline: calculatedDeadline,
      
      // Manual Fields
      priority: mode === 'MANUAL' ? priority : 'Medium',
      files: mode === 'MANUAL' ? files : [],
      
      // Meeting/Habit Specifics
      meetingDate: (mode === 'MANUAL' && category !== 'Task') ? manualDate : undefined,
      meetingStartTime: (mode === 'MANUAL' && category !== 'Task') ? manualStart : undefined,
      meetingEndTime: (mode === 'MANUAL' && category !== 'Task') ? manualEnd : undefined,

      // Habit Specifics
      recurrenceEndDate: recurrenceEnd,
      preferredDays: (mode === 'MANUAL' && category === 'Habit') ? selectedDays : [],

      // Defaults
      difficulty: 5,
      energyLevel: 'High',
      preferredTimeStart: "00:00",
      preferredTimeEnd: "23:59",
      preferredSessionDuration: totalHours,
      
      isScheduled: mode === 'AI' || (mode === 'MANUAL' && category !== 'Task') 
    };

    try {
      await onSubmit(taskToSave);
    } catch (err) {
      console.error(err);
      alert("Failed to save.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const isEditing = initialTask && initialTask.id !== '';

  return (
    <div className="bg-white p-6 rounded-lg shadow-xl max-w-xl mx-auto border border-gray-200">
      
      <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-gray-900 flex items-center">
                {isEditing ? 'Edit Event' : 'New Event'}
              </h2>
          </div>

          <div className="grid grid-cols-2 gap-4 p-1 bg-gray-100 rounded-lg mb-6">
              <button
                type="button"
                onClick={() => setMode('AI')}
                className={`flex items-center justify-center py-3 px-4 rounded-md text-sm font-bold transition-all ${
                    mode === 'AI' 
                    ? 'bg-white text-indigo-600 shadow-sm ring-1 ring-black/5' 
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                  ✨ AI Powered
              </button>
              <button
                type="button"
                onClick={() => setMode('MANUAL')}
                className={`flex items-center justify-center py-3 px-4 rounded-md text-sm font-bold transition-all ${
                    mode === 'MANUAL' 
                    ? 'bg-white text-gray-900 shadow-sm ring-1 ring-black/5' 
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                  📅 Manual
              </button>
          </div>
          
          {/* Category Selector */}
          <div>
            <label className="block text-xs uppercase tracking-wider font-bold text-gray-500 mb-2">Category</label>
            <div className="flex gap-2">
                {(['Task', 'Meeting', 'Habit'] as TaskCategory[]).map(cat => (
                    <button
                        key={cat}
                        type="button"
                        onClick={() => setCategory(cat)}
                        className={`flex-1 py-2 px-3 text-sm font-medium rounded-lg border transition-all ${
                            category === cat 
                            ? 'bg-indigo-50 border-indigo-200 text-indigo-700 ring-1 ring-indigo-200' 
                            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                    >
                        {cat === 'Habit' ? 'Habit / Recurring' : cat}
                    </button>
                ))}
            </div>
          </div>
      </div>
      
      <form onSubmit={handleSubmit} className="space-y-6">
        
        {/* Title & Location */}
        <div className="grid grid-cols-1 gap-4">
            <div>
                <label className="block text-xs uppercase tracking-wider font-bold text-gray-500 mb-2">Title</label>
                <input 
                  required
                  type="text" 
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-base p-3 border bg-white text-gray-900"
                  placeholder={mode === 'AI' ? "e.g. Work on Project" : "e.g. Client Meeting"}
                />
            </div>
            <div>
                <label className="block text-xs uppercase tracking-wider font-bold text-gray-500 mb-2">Location (Optional)</label>
                <input 
                  type="text" 
                  value={location}
                  onChange={e => setLocation(e.target.value)}
                  className="block w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm p-3 border bg-white text-gray-900"
                  placeholder="e.g. Room 101, Zoom, Starbucks"
                />
            </div>
        </div>

        {/* AI Mode: Strictly Minimal */}
        {mode === 'AI' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-300">
                
                <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-lg">
                    <label className="block text-sm font-bold text-indigo-900 mb-2">
                        AI Instructions
                    </label>
                    <textarea 
                        value={description} 
                        onChange={e => setDescription(e.target.value)} 
                        rows={3} 
                        className="block w-full rounded-md border-indigo-200 shadow-sm p-3 border bg-white text-gray-900 text-sm placeholder-indigo-300 focus:border-indigo-500 focus:ring-indigo-500" 
                        placeholder={category === 'Habit' ? "e.g. Every day at 8am" : "e.g. Schedule this at 11pm tonight."} 
                    />
                </div>

                <div className="grid grid-cols-2 gap-4">
                    {/* Hide Date for Habits (Indefinite) */}
                    {category !== 'Habit' && (
                        <div>
                            <label className="block text-xs uppercase tracking-wider font-bold text-gray-500 mb-2">
                                Deadline
                            </label>
                            <input 
                                type="datetime-local" 
                                required 
                                value={deadline} 
                                onChange={e => setDeadline(e.target.value)} 
                                className="block w-full rounded-lg border-gray-300 shadow-sm p-2.5 border bg-white text-gray-900 text-sm" 
                            />
                        </div>
                    )}
                    <div className={category === 'Habit' ? 'col-span-2' : ''}>
                        <label className="block text-xs uppercase tracking-wider font-bold text-gray-500 mb-2">
                            {category === 'Habit' ? 'Hours Per Day' : 'Hours Needed'}
                        </label>
                        <input 
                            type="number" 
                            min="0.25" 
                            step="0.25" 
                            value={totalHours} 
                            onChange={e => setTotalHours(parseFloat(e.target.value))} 
                            className="block w-full rounded-lg border-gray-300 shadow-sm p-2.5 border bg-white text-gray-900 text-sm" 
                        />
                    </div>
                </div>
            </div>
        )}

        {/* Manual Mode: Split between Task and Meeting/Habit */}
        {mode === 'MANUAL' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-300">
                <div>
                    <label className="block text-xs uppercase tracking-wider font-bold text-gray-500 mb-2">Notes</label>
                    <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className="block w-full rounded-md border-gray-300 shadow-sm p-3 border bg-white text-gray-900 text-sm" placeholder="Details..." />
                </div>

                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    {category === 'Task' ? (
                        /* Manual Task: Date and Optional Time */
                        <div className="grid grid-cols-2 gap-4">
                             <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">Due Date</label>
                                <input type="date" required value={manualDate} onChange={e => setManualDate(e.target.value)} className="w-full text-sm p-2.5 rounded border-gray-300 bg-white text-gray-900 border shadow-sm" />
                             </div>
                             <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1">Due Time (Optional)</label>
                                <input type="time" value={manualDueTime} onChange={e => setManualDueTime(e.target.value)} className="w-full text-sm p-2.5 rounded border-gray-300 bg-white text-gray-900 border shadow-sm" />
                             </div>
                             <div className="col-span-2 text-xs text-gray-500 italic">
                                * This task will appear in your list but won't be blocked on the calendar.
                             </div>
                        </div>
                    ) : (
                        /* Manual Meeting or Habit */
                        <div className="grid grid-cols-1 gap-4">
                            {category === 'Habit' ? (
                                <div className="grid grid-cols-1 gap-4">
                                     <div>
                                        <label className="block text-xs font-bold text-gray-700 mb-1">Start Date</label>
                                        <input type="date" required value={manualDate} onChange={e => setManualDate(e.target.value)} className="w-full text-sm p-2.5 rounded border-gray-300 bg-white text-gray-900 border shadow-sm" />
                                    </div>
                                    {/* Removed End Date for Habits to allow indefinite */}
                                    
                                    <div className="col-span-1">
                                        <label className="block text-xs font-bold text-gray-700 mb-1">Repeat On</label>
                                        <div className="flex justify-between gap-1">
                                            {DAYS_OF_WEEK.map(d => (
                                                <button
                                                    key={d.value}
                                                    type="button"
                                                    onClick={() => toggleDay(d.value)}
                                                    className={`w-9 h-9 rounded-full text-xs font-bold flex items-center justify-center transition-all ${
                                                        selectedDays.includes(d.value) 
                                                        ? 'bg-indigo-600 text-white shadow-md transform scale-105' 
                                                        : 'bg-white border border-gray-200 text-gray-500 hover:bg-gray-50'
                                                    }`}
                                                >
                                                    {d.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1">Date</label>
                                    <input type="date" required value={manualDate} onChange={e => setManualDate(e.target.value)} className="w-full text-sm p-2.5 rounded border-gray-300 bg-white text-gray-900 border shadow-sm" />
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1">Start Time</label>
                                    <input type="time" required value={manualStart} onChange={e => setManualStart(e.target.value)} className="w-full text-sm p-2.5 rounded border-gray-300 bg-white text-gray-900 border shadow-sm" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1">End Time</label>
                                    <input type="time" required value={manualEnd} onChange={e => setManualEnd(e.target.value)} className="w-full text-sm p-2.5 rounded border-gray-300 bg-white text-gray-900 border shadow-sm" />
                                </div>
                            </div>
                            
                            {manualConflict && (
                                <div className="mt-2 flex items-center text-sm text-red-700 bg-red-100 p-2 rounded border border-red-200 font-medium">
                                    <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                                    {manualConflict}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-2 gap-6 border-t border-gray-200 pt-6">
                    <div>
                        <label className="block text-xs uppercase tracking-wider font-semibold text-gray-500 mb-2">Priority</label>
                        <div className="flex rounded-md shadow-sm bg-gray-50 border border-gray-200 p-1">
                            {(['High', 'Medium', 'Low'] as Priority[]).map((p) => (
                                <button
                                    key={p}
                                    type="button"
                                    onClick={() => setPriority(p)}
                                    className={`flex-1 py-2 text-xs font-medium rounded transition-all ${priority === p ? 'bg-white text-indigo-600 shadow-sm font-bold' : 'text-gray-500'}`}
                                >
                                    {p}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs uppercase tracking-wider font-semibold text-gray-500 mb-2">Materials</label>
                        <label className="flex items-center justify-center w-full p-2 border border-gray-300 border-dashed rounded cursor-pointer hover:bg-gray-50">
                            <span className="text-xs text-indigo-600">+ Upload</span>
                            <input type="file" className="hidden" multiple onChange={handleFileChange} />
                        </label>
                    </div>
                </div>
            </div>
        )}

        <div className="flex justify-end gap-3 pt-6 border-t border-gray-200">
            <Button variant="ghost" type="button" onClick={onCancel}>Cancel</Button>
            <Button type="submit" isLoading={isSubmitting} disabled={!!manualConflict && mode === 'MANUAL' && category === 'Meeting'}>
                {isEditing ? 'Save Changes' : (mode === 'AI' ? 'Auto-Schedule' : (category === 'Task' ? 'Add Task' : 'Add to Calendar'))}
            </Button>
        </div>
      </form>
    </div>
  );
};
