
import { CalendarEvent, Task, EventType, Priority } from '../types';

/**
 * Parses a time string (e.g. "14:30") and sets it on the given date object.
 */
const parseTimeOnDate = (timeStr: string, date: Date): Date => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const newDate = new Date(date);
    newDate.setHours(hours, minutes, 0, 0);
    return newDate;
};

/**
 * Checks if two date ranges overlap
 */
const isOverlapping = (start1: Date, end1: Date, start2: Date, end2: Date): boolean => {
    return start1 < end2 && end1 > start2;
};

interface TimeRange {
    start: Date;
    end: Date;
}

/**
 * Subtracts busy intervals from a time range to find free bins.
 */
const calculateFreeBins = (
    rangeStart: Date,
    rangeEnd: Date,
    busyEvents: CalendarEvent[]
): TimeRange[] => {
    const sortedBusy = [...busyEvents]
        .filter(e => isOverlapping(e.start, e.end, rangeStart, rangeEnd))
        .sort((a, b) => a.start.getTime() - b.start.getTime());

    const freeBins: TimeRange[] = [];
    let currentStart = new Date(rangeStart);

    for (const event of sortedBusy) {
        const eventStart = event.start < rangeStart ? rangeStart : event.start;
        const eventEnd = event.end > rangeEnd ? rangeEnd : event.end;

        if (eventStart > currentStart) {
            freeBins.push({ start: new Date(currentStart), end: new Date(eventStart) });
        }

        if (eventEnd > currentStart) {
            currentStart = new Date(eventEnd);
        }
    }

    if (currentStart < rangeEnd) {
        freeBins.push({ start: new Date(currentStart), end: new Date(rangeEnd) });
    }

    return freeBins;
};

const getEventColorByPriority = (priority: Priority) => {
    switch(priority) {
        case 'High': return 'bg-red-50 border-red-200 text-red-700';
        case 'Medium': return 'bg-amber-50 border-amber-200 text-amber-700';
        case 'Low': return 'bg-emerald-50 border-emerald-200 text-emerald-700';
        default: return 'bg-gray-50 border-gray-200 text-gray-700';
    }
};

/**
 * Core Scheduler
 */
export const scheduleTasks = (
    fixedEvents: CalendarEvent[],
    tasks: Task[]
): CalendarEvent[] => {
    const scheduledEvents: CalendarEvent[] = [];
    const now = new Date();
    
    // Separate Habits and Tasks
    const flexibleTasks = tasks.filter(t => t.category === 'Task' && t.isScheduled);
    const habits = tasks.filter(t => t.category === 'Habit' && t.isScheduled);

    // Helper: Apply buffers
    const getAllBusySlots = () => {
        const allEvents = [...fixedEvents, ...scheduledEvents];
        return allEvents.map(e => {
            const start = new Date(e.start);
            const end = new Date(e.end);
            // 15 min buffer for everything
            start.setMinutes(start.getMinutes() - 15);
            end.setMinutes(end.getMinutes() + 15);
            return { ...e, start, end };
        });
    };

    const startOfScheduling = new Date(now);
    const remainder = 15 - (startOfScheduling.getMinutes() % 15);
    startOfScheduling.setMinutes(startOfScheduling.getMinutes() + remainder, 0, 0);

    // --- PHASE 1: SCHEDULE HABITS ---
    // Habits are time-specific recurring events. We try to book them first.
    
    habits.forEach(habit => {
        let loopDate = new Date(startOfScheduling);
        const endDate = habit.recurrenceEndDate || new Date(now.getFullYear() + 1, 0, 1);
        
        while (loopDate < endDate) {
             const dayName = loopDate.toLocaleDateString('en-US', { weekday: 'long' });
             
             if (habit.preferredDays.includes(dayName)) {
                const windowStart = parseTimeOnDate(habit.preferredTimeStart, loopDate);
                const windowEnd = parseTimeOnDate(habit.preferredTimeEnd, loopDate);
                const effectiveStart = (windowStart < startOfScheduling) ? startOfScheduling : windowStart;

                if (effectiveStart < windowEnd) {
                    const busyEvents = getAllBusySlots();
                    const freeBins = calculateFreeBins(effectiveStart, windowEnd, busyEvents);
                    
                    // Try to find *one* slot for this habit instance
                    for (const bin of freeBins) {
                        const binDurationHours = (bin.end.getTime() - bin.start.getTime()) / 36e5;
                        const needed = habit.preferredSessionDuration || 1.0;
                        
                        if (binDurationHours >= needed) {
                             const sessionEnd = new Date(bin.start.getTime() + needed * 36e5);
                             scheduledEvents.push({
                                id: crypto.randomUUID(),
                                title: habit.title,
                                start: new Date(bin.start),
                                end: sessionEnd,
                                type: EventType.AI_WORK_SESSION,
                                relatedTaskId: habit.id,
                                description: "Recurring Habit",
                                color: "bg-teal-50 border-teal-200 text-teal-700",
                                priority: habit.priority
                             });
                             break; // Booked for this day
                        }
                    }
                }
             }
             loopDate.setDate(loopDate.getDate() + 1);
             loopDate.setHours(0,0,0,0);
        }
    });

    // --- PHASE 2: SCHEDULE FLEXIBLE TASKS (EDF) ---
    const sortedTasks = [...flexibleTasks].sort((a, b) => a.deadline.getTime() - b.deadline.getTime());
    const MIN_SESSION_DURATION_HOURS = 0.5;

    for (const task of sortedTasks) {
        let hoursRemaining = task.totalHoursNeeded;
        if (typeof hoursRemaining !== 'number' || isNaN(hoursRemaining) || hoursRemaining <= 0) continue;

        let currentDate = new Date(startOfScheduling);
        let dayCount = 0;
        const maxDays = 365;

        while (hoursRemaining > 0.05 && currentDate < task.deadline && dayCount < maxDays) {
            dayCount++;
            const dayName = currentDate.toLocaleDateString('en-US', { weekday: 'long' });
            
            if (task.preferredDays.includes(dayName)) {
                const windowStart = parseTimeOnDate(task.preferredTimeStart, currentDate);
                const windowEnd = parseTimeOnDate(task.preferredTimeEnd, currentDate);
                const effectiveStart = (windowStart < startOfScheduling) ? startOfScheduling : windowStart;

                if (effectiveStart < windowEnd) {
                    const busyEvents = getAllBusySlots();
                    let freeBins = calculateFreeBins(effectiveStart, windowEnd, busyEvents);

                    // Energy Heuristic
                    freeBins.sort((a, b) => {
                        const midA = (a.start.getHours() + a.end.getHours()) / 2;
                        const midB = (b.start.getHours() + b.end.getHours()) / 2;
                        return task.energyLevel === 'High' ? midA - midB : midB - midA;
                    });

                    for (const bin of freeBins) {
                        if (hoursRemaining <= 0.05) break;

                        const binDurationHours = (bin.end.getTime() - bin.start.getTime()) / 36e5;
                        if (binDurationHours < MIN_SESSION_DURATION_HOURS) continue;

                        const maxBlockSize = task.preferredSessionDuration || 2.0;
                        const timeToTake = Math.min(hoursRemaining, binDurationHours, maxBlockSize);
                        
                        if (timeToTake < MIN_SESSION_DURATION_HOURS && Math.abs(timeToTake - hoursRemaining) > 0.05) continue;

                        const sessionEnd = new Date(bin.start.getTime() + timeToTake * 36e5);

                        scheduledEvents.push({
                            id: crypto.randomUUID(),
                            title: task.title,
                            start: new Date(bin.start),
                            end: sessionEnd,
                            type: EventType.AI_WORK_SESSION,
                            relatedTaskId: task.id,
                            description: `Priority: ${task.priority} | Energy: ${task.energyLevel}`,
                            color: getEventColorByPriority(task.priority),
                            priority: task.priority
                        });

                        hoursRemaining -= timeToTake;
                    }
                }
            }
            currentDate.setDate(currentDate.getDate() + 1);
            currentDate.setHours(0, 0, 0, 0);
        }
    }

    return scheduledEvents;
};
