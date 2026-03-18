
import React, { useState, useEffect } from 'react';
import { Task, CalendarEvent, EventType, Priority } from '../types';
import { Button } from './Button';

interface TasksViewProps {
  tasks: Task[];
  events: CalendarEvent[];
  onEditTask: (task: Task) => void;
  onDeleteTask: (taskId: string) => void;
}

export const TasksView: React.FC<TasksViewProps> = ({ tasks, events, onEditTask, onDeleteTask }) => {
  // Use current time to calculate live progress
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    // Update 'now' every minute to keep progress bars fresh
    const interval = setInterval(() => {
        setNow(new Date());
    }, 60000); // 60s
    return () => clearInterval(interval);
  }, []);
  
  const getProgress = (task: Task) => {
    const taskEvents = events.filter(e => e.relatedTaskId === task.id);
    
    let totalScheduledHours = 0;
    let completedHours = 0;

    taskEvents.forEach(e => {
        const durationHours = (e.end.getTime() - e.start.getTime()) / (1000 * 60 * 60);
        totalScheduledHours += durationHours;

        // Calculate portion of event that has passed
        if (now >= e.end) {
            completedHours += durationHours;
        } else if (now > e.start) {
            // Currently in progress
            const passedMs = now.getTime() - e.start.getTime();
            completedHours += passedMs / (1000 * 60 * 60);
        }
    });

    return {
        completed: completedHours,
        scheduledFuture: Math.max(0, totalScheduledHours - completedHours),
        totalNeeded: task.totalHoursNeeded,
        // Percentages for the bar
        percentCompleted: Math.min(100, (completedHours / task.totalHoursNeeded) * 100),
        percentScheduled: Math.min(100, ((totalScheduledHours - completedHours) / task.totalHoursNeeded) * 100)
    };
  };

  const getPriorityColor = (p: Priority) => {
    switch(p) {
        case 'High': return 'text-red-700 bg-red-50 border-red-200';
        case 'Medium': return 'text-amber-700 bg-amber-50 border-amber-200';
        case 'Low': return 'text-emerald-700 bg-emerald-50 border-emerald-200';
        default: return 'text-gray-700 bg-gray-50';
    }
  };

  if (tasks.length === 0) {
      return (
          <div className="flex flex-col items-center justify-center h-full py-20 text-center">
              <div className="bg-gray-100 p-6 rounded-full mb-4">
                  <span className="text-4xl">📝</span>
              </div>
              <h3 className="text-lg font-bold text-gray-900">No Tasks Yet</h3>
              <p className="text-gray-500 max-w-sm mt-2 mb-6">Start by adding a task, project, or exam study plan. The AI will help you schedule it.</p>
          </div>
      );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {tasks.map(task => {
            const stats = getProgress(task);
            const isOverdue = now > task.deadline && stats.percentCompleted < 100;
            const totalPlanned = stats.completed + stats.scheduledFuture;
            
            return (
                <div key={task.id} className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all p-5 flex flex-col">
                    <div className="flex justify-between items-start mb-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${getPriorityColor(task.priority)}`}>
                            {task.priority}
                        </span>
                        <div className="flex gap-2">
                             <button 
                                onClick={() => onEditTask(task)}
                                className="text-gray-400 hover:text-indigo-600 transition-colors"
                             >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                </svg>
                             </button>
                             <button 
                                onClick={() => {
                                    if(confirm('Are you sure you want to delete this task? All scheduled sessions will be removed.')) {
                                        onDeleteTask(task.id);
                                    }
                                }}
                                className="text-gray-400 hover:text-red-600 transition-colors"
                             >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                             </button>
                        </div>
                    </div>

                    <h3 className="text-lg font-bold text-gray-900 mb-1 leading-tight">{task.title}</h3>
                    
                    <div className="text-xs text-gray-500 mb-4 flex items-center">
                        <span className="mr-2">📅 Deadline:</span> 
                        <span className={`font-medium ${isOverdue ? 'text-red-600' : 'text-gray-700'}`}>
                            {task.deadline.toLocaleDateString(undefined, {month:'short', day:'numeric', hour:'numeric', minute:'2-digit'})}
                        </span>
                    </div>

                    {task.description && (
                        <p className="text-xs text-gray-600 mb-4 line-clamp-2">{task.description}</p>
                    )}

                    <div className="mt-auto">
                        <div className="flex justify-between items-end mb-1">
                            <span className="text-xs font-medium text-gray-500">
                                {stats.completed.toFixed(1)} hrs done
                            </span>
                            <span className="text-xs font-bold text-gray-700">
                                {totalPlanned.toFixed(1)} / {stats.totalNeeded} hrs planned
                            </span>
                        </div>
                        
                        {/* Multi-colored Progress Bar */}
                        <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden flex">
                            {/* Completed Segment (Green) */}
                            <div 
                                className="h-full bg-emerald-500 transition-all duration-500"
                                style={{ width: `${stats.percentCompleted}%` }}
                                title="Completed"
                            ></div>
                            {/* Scheduled Future Segment (Indigo) */}
                            <div 
                                className="h-full bg-indigo-400 transition-all duration-500 opacity-60"
                                style={{ width: `${stats.percentScheduled}%` }}
                                title="Scheduled (Future)"
                            ></div>
                        </div>
                        
                        <div className="mt-4 flex gap-2">
                             {task.files.length > 0 && (
                                <div className="text-[10px] bg-gray-50 border border-gray-200 px-2 py-1 rounded text-gray-600 flex items-center">
                                    📎 {task.files.length} Materials
                                </div>
                             )}
                        </div>
                    </div>
                </div>
            );
        })}
      </div>
    </div>
  );
};
