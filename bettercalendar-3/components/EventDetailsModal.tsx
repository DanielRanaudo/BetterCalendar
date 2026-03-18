
import React, { useState, useEffect } from 'react';
import { CalendarEvent, Task, EventType } from '../types';
import { Button } from './Button';

interface EventDetailsModalProps {
  event: CalendarEvent | null;
  relatedTask?: Task;
  onClose: () => void;
  onDelete: (id: string) => void;
  onUpdate: (event: CalendarEvent) => void;
}

export const EventDetailsModal: React.FC<EventDetailsModalProps> = ({ event, relatedTask, onClose, onDelete, onUpdate }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [editLocation, setEditLocation] = useState('');

  // Reset state when event changes
  useEffect(() => {
    if (event) {
        setIsEditing(false);
        setEditTitle(event.title);
        setEditLocation(event.location || '');
        // Format for datetime-local input (YYYY-MM-DDTHH:mm)
        const formatForInput = (d: Date) => {
            const pad = (n: number) => n < 10 ? '0'+n : n;
            return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        };
        setEditStart(formatForInput(event.start));
        setEditEnd(formatForInput(event.end));
    }
  }, [event]);

  if (!event) return null;

  const handleSave = () => {
    if (!editTitle || !editStart || !editEnd) return;
    
    const newStart = new Date(editStart);
    const newEnd = new Date(editEnd);
    
    if (newEnd <= newStart) {
        alert("End time must be after start time");
        return;
    }

    onUpdate({
        ...event,
        title: editTitle,
        start: newStart,
        end: newEnd,
        location: editLocation
    });
    setIsEditing(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-500 bg-opacity-75 backdrop-blur-sm p-4">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-lg p-6 border border-gray-200 relative">
        
        {/* Header */}
        <div className="flex justify-between items-start mb-6">
            {isEditing ? (
                 <input 
                    type="text" 
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="text-xl font-bold text-gray-900 border-b-2 border-indigo-500 focus:outline-none w-full bg-white"
                    placeholder="Event Title"
                 />
            ) : (
                <h2 className="text-xl font-bold text-gray-900">{event.title}</h2>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 ml-4 hover:bg-gray-100 rounded-full p-1 transition-colors">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        </div>

        <div className="space-y-6">
            <div>
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                    event.type === EventType.AI_WORK_SESSION ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700'
                }`}>
                    {event.type === EventType.AI_WORK_SESSION ? 'Work Session' : 'Event'}
                </span>
                
                {isEditing ? (
                    <div className="mt-4 space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs text-gray-500 mb-1">Start</label>
                                <input 
                                    type="datetime-local" 
                                    value={editStart}
                                    onChange={(e) => setEditStart(e.target.value)}
                                    className="block w-full text-sm border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 border p-2 bg-white text-gray-900"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-500 mb-1">End</label>
                                <input 
                                    type="datetime-local" 
                                    value={editEnd}
                                    onChange={(e) => setEditEnd(e.target.value)}
                                    className="block w-full text-sm border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 border p-2 bg-white text-gray-900"
                                />
                            </div>
                        </div>
                        <div>
                             <label className="block text-xs text-gray-500 mb-1">Location</label>
                             <input 
                                type="text"
                                value={editLocation}
                                onChange={(e) => setEditLocation(e.target.value)}
                                className="block w-full text-sm border-gray-300 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 border p-2 bg-white text-gray-900"
                                placeholder="Add location"
                             />
                        </div>
                    </div>
                ) : (
                    <>
                        <p className="mt-2 text-sm text-gray-700 font-mono">
                            {event.start.toLocaleTimeString([], {hour:'numeric', minute:'2-digit', hour12: true})} - {event.end.toLocaleTimeString([], {hour:'numeric', minute:'2-digit', hour12: true})}
                        </p>
                        <p className="text-sm text-gray-500 mt-1">
                            {event.start.toLocaleDateString(undefined, {weekday:'long', month:'long', day:'numeric'})}
                        </p>
                        {event.location && (
                             <p className="text-sm text-gray-600 mt-2 flex items-center">
                                <span className="mr-1">📍</span> {event.location}
                             </p>
                        )}
                    </>
                )}
            </div>

            {!isEditing && event.description && (
                <div className="bg-gray-50 p-4 rounded border border-gray-200 text-sm text-gray-700">
                    <p className="text-xs text-gray-400 uppercase font-bold mb-2">Details</p>
                    {event.description}
                </div>
            )}

            {!isEditing && event.type === EventType.AI_WORK_SESSION && relatedTask && relatedTask.files.length > 0 && (
                <div className="border-t border-gray-100 pt-4">
                    <h3 className="text-xs text-gray-500 uppercase font-bold mb-3">Materials</h3>
                    <ul className="space-y-2">
                        {relatedTask.files.map((file, idx) => (
                            <li key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded border border-gray-200">
                                <span className="text-xs text-gray-700 truncate flex-1 mr-2">{file.name}</span>
                                {file.url && (
                                    <a 
                                        href={file.url} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="text-[10px] bg-white border border-gray-300 text-gray-700 px-2 py-1 rounded hover:bg-gray-100"
                                    >
                                        Open
                                    </a>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>

        <div className="mt-8 flex justify-end gap-3 pt-4 border-t border-gray-100">
          {isEditing ? (
            <>
                <Button variant="ghost" onClick={() => setIsEditing(false)}>Cancel</Button>
                <Button onClick={handleSave}>Save Changes</Button>
            </>
          ) : (
            <>
                <Button variant="danger" onClick={() => { onDelete(event.id); onClose(); }}>Delete</Button>
                <Button variant="secondary" onClick={() => setIsEditing(true)}>Edit</Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
