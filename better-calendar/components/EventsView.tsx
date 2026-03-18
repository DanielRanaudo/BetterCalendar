
import React, { useState, useEffect } from 'react';
import { Task, CalendarEvent, Priority, TaskCategory } from '../types';

interface EventsViewProps {
  tasks: Task[];
  events: CalendarEvent[];
  onEditTask: (task: Task) => void;
  onDeleteTask: (taskId: string) => void;
  onToggleComplete: (taskId: string, isComplete: boolean) => void;
}

export const EventsView: React.FC<EventsViewProps> = ({ tasks, events, onEditTask, onDeleteTask, onToggleComplete }) => {
  const [now, setNow] = useState(new Date());
  const [filter, setFilter] = useState<TaskCategory | 'All'>('All');

  useEffect(() => {
    const interval = setInterval(() => {
        setNow(new Date());
    }, 60000); 
    return () => clearInterval(interval);
  }, []);
  
  const getProgress = (task: Task) => {
    if (task.isCompleted) {
        return {
            completed: task.totalHoursNeeded,
            scheduledFuture: 0,
            totalNeeded: task.totalHoursNeeded,
            percentCompleted: 100,
            percentScheduled: 0
        };
    }

    if (task.category === 'Meeting') {
        const start = new Date(`${task.meetingDate}T${task.meetingStartTime}`);
        const end = new Date(`${task.meetingDate}T${task.meetingEndTime}`);
        const isDone = now > end;
        return {
            completed: isDone ? 1 : 0,
            scheduledFuture: isDone ? 0 : 1,
            totalNeeded: 1,
            percentCompleted: isDone ? 100 : 0,
            percentScheduled: isDone ? 0 : 100
        };
    }

    const taskEvents = events.filter(e => e.relatedTaskId === task.id);
    let totalScheduledHours = 0;
    let completedHours = 0;

    taskEvents.forEach(e => {
        const durationHours = (e.end.getTime() - e.start.getTime()) / (1000 * 60 * 60);
        totalScheduledHours += durationHours;

        if (now >= e.end) {
            completedHours += durationHours;
        } else if (now > e.start) {
            const passedMs = now.getTime() - e.start.getTime();
            completedHours += passedMs / (1000 * 60 * 60);
        }
    });

    const denominator = task.category === 'Task' ? task.totalHoursNeeded : totalScheduledHours || 1;

    return {
        completed: completedHours,
        scheduledFuture: Math.max(0, totalScheduledHours - completedHours),
        totalNeeded: task.category === 'Task' ? task.totalHoursNeeded : totalScheduledHours,
        percentCompleted: Math.min(100, (completedHours / denominator) * 100),
        percentScheduled: Math.min(100, ((totalScheduledHours - completedHours) / denominator) * 100)
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

  const filteredTasks = filter === 'All' ? tasks : tasks.filter(t => t.category === filter);

  if (tasks.length === 0) {
      return (
          <div className="flex flex-col items-center justify-center h-full py-20 text-center">
              <div className="bg-gray-100 p-6 rounded-full mb-4">
                  <span className="text-4xl">📅</span>
              </div>
              <h3 className="text-lg font-bold text-gray-900">No Events Yet</h3>
              <p className="text-gray-500 max-w-sm mt-2 mb-6">Create Tasks, Meetings, or Habits to fill your schedule.</p>
          </div>
      );
  }

  return (
    <div className="space-y-6">
      {/* Filter Tabs */}
      <div className="flex space-x-2 border-b border-gray-200 pb-1">
          {(['All', 'Task', 'Meeting', 'Habit'] as const).map(cat => (
              <button
                key={cat}
                onClick={() => setFilter(cat)}
                className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                    filter === cat 
                    ? 'bg-white text-indigo-600 border border-b-0 border-gray-200 shadow-sm' 
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                  {cat === 'All' ? 'All Events' : (cat === 'Habit' ? 'Habits / Recurring' : `${cat}s`)}
              </button>
          ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredTasks.map(task => {
            const stats = getProgress(task);
            const isOverdue = !task.isCompleted && task.category === 'Task' && now > task.deadline && stats.percentCompleted < 100;
            const totalPlanned = stats.completed + stats.scheduledFuture;
            
            return (
                <div 
                    key={task.id} 
                    className={`bg-white rounded-xl border transition-all p-5 flex flex-col relative overflow-hidden group
                        ${task.isCompleted ? 'border-green-200 bg-green-50/30' : 'border-gray-200 shadow-sm hover:shadow-md'}
                    `}
                >
                    {/* Category Badge Stripe */}
                    <div className={`absolute top-0 left-0 w-1 h-full ${
                        task.isCompleted ? 'bg-green-500' :
                        task.category === 'Meeting' ? 'bg-purple-500' :
                        task.category === 'Habit' ? 'bg-teal-500' : 'bg-indigo-500'
                    }`}></div>

                    <div className="flex justify-between items-start mb-3 pl-3">
                        <div className="flex flex-col">
                            <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider mb-1">
                                {task.category === 'Habit' ? 'Habit / Recurring' : task.category}
                            </span>
                            {task.isCompleted ? (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border bg-green-100 text-green-700 border-green-200 w-fit">
                                    Completed
                                </span>
                            ) : (
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border w-fit ${getPriorityColor(task.priority)}`}>
                                    {task.priority}
                                </span>
                            )}
                        </div>
                        <div className="flex gap-2 relative z-20">
                             {!task.isCompleted && (
                                <button 
                                    type="button"
                                    onClick={(e) => { 
                                        e.stopPropagation(); 
                                        onEditTask(task); 
                                    }}
                                    className="text-gray-400 hover:text-indigo-600 transition-colors p-2 rounded-full hover:bg-indigo-50"
                                    title="Edit"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                    </svg>
                                </button>
                             )}
                             <button 
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onDeleteTask(task.id);
                                }}
                                className="text-gray-400 hover:text-red-600 transition-colors p-2 rounded-full hover:bg-red-50"
                                title="Delete Task"
                             >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                             </button>
                        </div>
                    </div>

                    <h3 className={`text-lg font-bold mb-1 leading-tight pl-3 ${task.isCompleted ? 'text-gray-500 line-through' : 'text-gray-900'}`}>
                        {task.title}
                    </h3>
                    
                    <div className="pl-3 mb-4">
                        {task.category === 'Task' && (
                            <div className="text-xs text-gray-500 flex items-center">
                                <span className="mr-2">📅 Due:</span> 
                                <span className={`font-medium ${isOverdue ? 'text-red-600' : 'text-gray-700'}`}>
                                    {task.deadline.toLocaleDateString(undefined, {month:'short', day:'numeric'})}
                                </span>
                            </div>
                        )}
                        {task.category === 'Meeting' && (
                             <div className="text-xs text-gray-500 flex items-center">
                                <span className="mr-2">🕒 Time:</span> 
                                <span className="font-medium text-gray-700">
                                    {task.meetingDate} @ {task.meetingStartTime}
                                </span>
                            </div>
                        )}
                        {task.category === 'Habit' && (
                             <div className="text-xs text-gray-500 flex items-center">
                                <span className="mr-2">🔁 Repeats:</span> 
                                <span className="font-medium text-gray-700">
                                    {task.preferredDays.map(d => d.slice(0,3)).join(', ')}
                                </span>
                            </div>
                        )}
                    </div>

                    {task.description && (
                        <p className={`text-xs mb-4 line-clamp-2 pl-3 ${task.isCompleted ? 'text-gray-400' : 'text-gray-600'}`}>
                            {task.description}
                        </p>
                    )}

                    <div className="mt-auto pl-3">
                        {task.category !== 'Meeting' && (
                        <>
                            <div className="flex justify-between items-end mb-1">
                                <span className="text-xs font-medium text-gray-500">
                                    {stats.completed.toFixed(1)} hrs done
                                </span>
                                <span className="text-xs font-bold text-gray-700">
                                    {totalPlanned.toFixed(1)} hrs planned
                                </span>
                            </div>
                            
                            <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden flex">
                                <div 
                                    className="h-full bg-emerald-500 transition-all duration-500"
                                    style={{ width: `${stats.percentCompleted}%` }}
                                ></div>
                                {!task.isCompleted && (
                                    <div 
                                        className="h-full bg-indigo-400 transition-all duration-500 opacity-60"
                                        style={{ width: `${stats.percentScheduled}%` }}
                                    ></div>
                                )}
                            </div>
                        </>
                        )}
                        
                        <div className="mt-4 flex items-center justify-between">
                             {task.files.length > 0 ? (
                                <div className="text-[10px] bg-gray-50 border border-gray-200 px-2 py-1 rounded text-gray-600 flex items-center">
                                    📎 {task.files.length} Materials
                                </div>
                             ) : <div></div>}

                             {/* Mark as Complete Button for Tasks */}
                             {task.category === 'Task' && (
                                 <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); onToggleComplete(task.id, !task.isCompleted); }}
                                    className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors border flex items-center gap-1 ${
                                        task.isCompleted 
                                        ? 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50' 
                                        : 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100'
                                    }`}
                                 >
                                    {task.isCompleted ? (
                                        <>↩ Undo Complete</>
                                    ) : (
                                        <>✓ Mark Complete</>
                                    )}
                                 </button>
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
