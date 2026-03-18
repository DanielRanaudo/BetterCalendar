
import React, { useState, useEffect } from 'react';
import { CalendarEvent, EventType } from '../types';

interface CalendarProps {
  events: CalendarEvent[];
  currentDate: Date;
  onEventClick: (event: CalendarEvent) => void;
  onNavigate: (direction: 'prev' | 'next' | 'today') => void;
  onEventUpdate: (updatedEvent: CalendarEvent) => void;
  onSlotClick?: (date: Date) => void;
}

export const Calendar: React.FC<CalendarProps> = ({ events, currentDate, onEventClick, onNavigate, onEventUpdate, onSlotClick }) => {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    // Update 'now' every minute
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  // Changed start hour to 1 AM as requested
  const startHour = 1;
  // Create hours until midnight (24)
  const hours = Array.from({ length: 24 - startHour }, (_, i) => i + startHour); 

  const getDayDates = () => {
    const dates = [];
    const startOfWeek = new Date(currentDate);
    const day = startOfWeek.getDay();
    startOfWeek.setDate(startOfWeek.getDate() - day);
    
    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      dates.push(date);
    }
    return dates;
  };

  const weekDates = getDayDates();

  const formatHour = (h: number) => {
    const ampm = h >= 12 && h < 24 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12} ${ampm}`;
  };

  const getEventStyle = (event: CalendarEvent, colIndex: number) => {
    const eventStartHour = event.start.getHours() + event.start.getMinutes() / 60;
    const eventEndHour = event.end.getHours() + event.end.getMinutes() / 60;
    const duration = eventEndHour - eventStartHour;
    const top = (eventStartHour - startHour) * 60; 
    const height = duration * 60;

    return {
      top: `${top}px`,
      height: `${height}px`,
      left: '2px',
      right: '2px'
    };
  };

  const isSameDay = (d1: Date, d2: Date) => {
    return d1.getDate() === d2.getDate() && 
           d1.getMonth() === d2.getMonth() && 
           d1.getFullYear() === d2.getFullYear();
  };

  const formatWeekRange = (start: Date, end: Date) => {
    return `${start.toLocaleDateString('default', {month:'short', day:'numeric'})} - ${end.toLocaleDateString('default', {month:'short', day:'numeric'})}`;
  };

  // --- Heatmap Logic: Calculate Constraint Density ---
  const getHeatmapColor = (date: Date) => {
      const dayEvents = events.filter(e => isSameDay(e.start, date) && !e.isGhost);
      let totalHours = 0;
      dayEvents.forEach(e => {
          totalHours += (e.end.getTime() - e.start.getTime()) / (1000 * 60 * 60);
      });
      
      const ratio = Math.min(totalHours / 12, 1);
      
      if (ratio < 0.2) return 'bg-emerald-50/50'; 
      if (ratio < 0.5) return 'bg-amber-50/50'; 
      return 'bg-red-50/50'; 
  };

  const getHeatmapHeight = (date: Date) => {
      const dayEvents = events.filter(e => isSameDay(e.start, date) && !e.isGhost);
      let totalHours = 0;
      dayEvents.forEach(e => {
          totalHours += (e.end.getTime() - e.start.getTime()) / (1000 * 60 * 60);
      });
      const ratio = Math.min(totalHours / 14, 1);
      return `${ratio * 100}%`;
  }

  // --- Current Time Indicator Helper ---
  const getCurrentTimePosition = () => {
      const currentHour = now.getHours();
      const currentMin = now.getMinutes();
      // Calculate pixels from top: (Hours passed since startHour * 60) + minutes
      return ((currentHour - startHour) * 60) + currentMin;
  };
  
  const isTimeVisible = () => {
      const pos = getCurrentTimePosition();
      // Total height is roughly (24 - 1) * 60
      return pos >= 0 && pos <= (hours.length * 60);
  };

  // --- Drag and Drop Handlers ---

  const handleDragStart = (e: React.DragEvent, event: CalendarEvent) => {
    if (event.isGhost) {
        e.preventDefault();
        return;
    }
    e.dataTransfer.setData('text/plain', event.id);
    e.dataTransfer.effectAllowed = 'move';
    
    // Calculate offset to prevent "jumping" when dragging starts
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    e.dataTransfer.setData('offsetY', offsetY.toString());
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault(); // Necessary to allow dropping
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, date: Date) => {
    e.preventDefault();
    const eventId = e.dataTransfer.getData('text/plain');
    const offsetY = parseFloat(e.dataTransfer.getData('offsetY'));
    
    const event = events.find(ev => ev.id === eventId);
    if (!event || event.isGhost) return;

    const colRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const dropY = e.clientY - colRect.top - offsetY; 
    
    // Snap to 15 min slots (15px)
    const snappedY = Math.round(dropY / 15) * 15;
    
    // Calculate new start time
    const hoursFromStart = snappedY / 60;
    const totalMinutes = (startHour * 60) + (hoursFromStart * 60);
    
    const newStart = new Date(date);
    newStart.setHours(Math.floor(totalMinutes / 60), Math.floor(totalMinutes % 60), 0, 0);

    // Calculate new end time (preserve duration)
    const durationMs = event.end.getTime() - event.start.getTime();
    const newEnd = new Date(newStart.getTime() + durationMs);

    onEventUpdate({ ...event, start: newStart, end: newEnd });
  };
  
  const handleSlotClick = (e: React.MouseEvent, date: Date) => {
      if (!onSlotClick) return;
      const colRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const clickY = e.clientY - colRect.top;
      
      const snappedY = Math.round(clickY / 15) * 15;
      const hoursFromStart = snappedY / 60;
      const totalMinutes = (startHour * 60) + (hoursFromStart * 60);
      
      const clickedDate = new Date(date);
      clickedDate.setHours(Math.floor(totalMinutes / 60), Math.floor(totalMinutes % 60), 0, 0);
      
      onSlotClick(clickedDate);
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
      
      {/* Navigation Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-6">
            <h2 className="text-lg font-bold text-gray-900 w-48 tracking-tight">
                {weekDates[0].toLocaleString('default', { month: 'long', year: 'numeric' })}
            </h2>
            <div className="flex items-center gap-2">
                <button onClick={() => onNavigate('prev')} className="p-2 text-gray-500 hover:text-gray-900 transition-colors">←</button>
                <span className="text-sm font-medium text-gray-600 w-32 text-center">
                    {formatWeekRange(weekDates[0], weekDates[6])}
                </span>
                <button onClick={() => onNavigate('next')} className="p-2 text-gray-500 hover:text-gray-900 transition-colors">→</button>
                
                <button 
                    onClick={() => onNavigate('today')} 
                    className="ml-4 px-3 py-1 text-xs font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200 transition-colors border border-gray-200"
                >
                    Today
                </button>
            </div>
        </div>
      </div>

      {/* Days Header */}
      <div className="grid grid-cols-8 border-b border-gray-200 bg-gray-50">
        <div className="p-4 border-r border-gray-200 text-xs font-mono text-gray-500 uppercase text-center pt-8">
           GMT
        </div>
        {weekDates.map((date, i) => (
          <div key={i} className={`relative p-2 text-center border-r border-gray-200 ${isSameDay(date, new Date()) ? 'bg-blue-50' : ''}`}>
             <div className="absolute top-0 left-0 w-full opacity-30 pointer-events-none" 
                  style={{ 
                      height: '4px', 
                      background: `linear-gradient(90deg, transparent, ${getHeatmapHeight(date)} === '0%' ? 'transparent' : '#ef4444')`
                  }}>
             </div>
             <div className={`absolute inset-0 pointer-events-none ${getHeatmapColor(date)}`}></div>

            <div className="relative z-10">
                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">{daysOfWeek[date.getDay()]}</div>
                <div className={`text-xl font-medium ${isSameDay(date, new Date()) ? 'text-indigo-600' : 'text-gray-900'}`}>
                {date.getDate()}
                </div>
            </div>
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto relative custom-scrollbar pt-4">
        <div className="grid grid-cols-8 min-h-[1380px]"> 
          
          {/* Time Sidebar */}
          <div className="border-r border-gray-200 bg-white relative">
            {hours.map(hour => (
              // Using relative positioning to center labels on the grid line
              <div key={hour} className="h-[60px] border-b border-gray-100 relative">
                 <span className="absolute -top-2 right-2 text-[10px] text-gray-400 font-mono bg-white px-1">
                    {formatHour(hour)}
                 </span>
              </div>
            ))}
          </div>

          {/* Days Columns */}
          {weekDates.map((date, colIndex) => {
            const dayEvents = events.filter(e => isSameDay(e.start, date));
            const isToday = isSameDay(date, now);

            return (
              <div 
                key={colIndex} 
                className="relative border-r border-gray-200 bg-white hover:bg-gray-50 transition-colors cursor-crosshair"
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, date)}
                onClick={(e) => handleSlotClick(e, date)}
              >
                {/* Current Time Indicator Line */}
                {isToday && isTimeVisible() && (
                    <div 
                        className="absolute w-full z-30 pointer-events-none flex items-center"
                        style={{ top: `${getCurrentTimePosition()}px` }}
                    >
                        <div className="w-2 h-2 rounded-full bg-red-500 -ml-1"></div>
                        <div className="flex-1 h-[2px] bg-red-500 opacity-80"></div>
                    </div>
                )}

                {hours.map(hour => (
                  <div key={hour} className="h-[60px] border-b border-gray-100 pointer-events-none"></div>
                ))}

                {dayEvents.map(event => {
                    const styles = getEventStyle(event, colIndex);
                    // Prevent rendering above the grid if somehow time is before startHour
                    if (parseInt(styles.top) < 0) return null;

                    // Ghost/Skeleton Styling
                    const ghostStyles = event.isGhost 
                        ? 'bg-gray-100 border-gray-200 text-gray-400 animate-pulse border-dashed grayscale' 
                        : (event.color || 'bg-gray-100 border-gray-400 text-gray-700');

                    return (
                      <div
                        key={event.id}
                        draggable={!event.isGhost}
                        onDragStart={(e) => handleDragStart(e, event)}
                        onClick={(e) => { e.stopPropagation(); onEventClick(event); }}
                        className={`absolute rounded px-3 py-2 text-xs cursor-pointer border-l-4 shadow-sm transition-all hover:shadow-md hover:z-20 overflow-hidden group
                            ${ghostStyles}`}
                        style={styles}
                      >
                        <div className="font-semibold truncate tracking-tight flex items-center gap-1">
                            {event.title}
                            {event.location && <span className="text-[9px] font-normal opacity-75 ml-1">📍 {event.location}</span>}
                            {event.isGhost && <span className="animate-spin h-3 w-3 border-2 border-gray-400 border-t-transparent rounded-full ml-1"></span>}
                        </div>
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity text-[9px] mt-1 font-mono">
                          {event.start.toLocaleTimeString([], {hour: 'numeric', minute:'2-digit', hour12: true})} - {event.end.toLocaleTimeString([], {hour: 'numeric', minute:'2-digit', hour12: true})}
                        </div>
                      </div>
                    );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
