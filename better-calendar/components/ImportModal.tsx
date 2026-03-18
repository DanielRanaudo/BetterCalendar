
import React, { useState } from 'react';
import { Button } from './Button';
import { CalendarEvent, EventType } from '../types';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (events: CalendarEvent[]) => void;
}

type TabType = 'upload' | 'url' | 'text';

export const ImportModal: React.FC<ImportModalProps> = ({ isOpen, onClose, onImport }) => {
  const [activeTab, setActiveTab] = useState<TabType>('upload');
  const [icsContent, setIcsContent] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) return null;

  const generateId = () => Date.now().toString(36) + Math.random().toString(36).substring(2);

  const parseICSDate = (str: string): Date | null => {
    try {
        if (!str) return null;
        const isUTC = str.endsWith('Z');
        const cleanStr = str.replace('Z', '');
        if (cleanStr.length < 8) return null;
        const year = parseInt(cleanStr.substring(0, 4));
        const month = parseInt(cleanStr.substring(4, 6)) - 1;
        const day = parseInt(cleanStr.substring(6, 8));
        if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
        if (cleanStr.length === 8) return new Date(year, month, day);
        const hour = parseInt(cleanStr.substring(9, 11));
        const min = parseInt(cleanStr.substring(11, 13));
        const sec = cleanStr.length >= 15 ? parseInt(cleanStr.substring(13, 15)) : 0;
        if (isNaN(hour) || isNaN(min)) return null;
        if (isUTC) return new Date(Date.UTC(year, month, day, hour, min, sec));
        return new Date(year, month, day, hour, min, sec);
    } catch (e) { return null; }
  };

  const expandRecurringEvent = (originalEvent: CalendarEvent, rruleStr: string): CalendarEvent[] => {
      try {
        const rules: any = {};
        rruleStr.split(';').forEach(part => {
            const [key, val] = part.split('=');
            rules[key] = val;
        });
        if (rules.FREQ !== 'WEEKLY') return [originalEvent]; 
        const expanded: CalendarEvent[] = [];
        const duration = originalEvent.end.getTime() - originalEvent.start.getTime();
        let until = rules.UNTIL ? parseICSDate(rules.UNTIL) : null;
        const count = rules.COUNT ? parseInt(rules.COUNT) : Infinity;
        const interval = rules.INTERVAL ? parseInt(rules.INTERVAL) : 1;
        if (!until && count === Infinity) {
            const d = new Date(originalEvent.start);
            d.setMonth(d.getMonth() + 4);
            until = d;
        }
        const dayMap: {[key: string]: number} = { 'SU': 0, 'MO': 1, 'TU': 2, 'WE': 3, 'TH': 4, 'FR': 5, 'SA': 6 };
        const byDay = rules.BYDAY ? rules.BYDAY.split(',').map((d: string) => dayMap[d.length > 2 ? d.slice(-2) : d]) : null;
        const anchor = new Date(originalEvent.start);
        anchor.setDate(anchor.getDate() - anchor.getDay()); 
        anchor.setHours(originalEvent.start.getHours(), originalEvent.start.getMinutes(), 0, 0);
        let addedCount = 0;
        for (let w = 0; w < 52; w++) { 
            if (addedCount >= count) break;
            if (!byDay) {
                const date = new Date(originalEvent.start);
                date.setDate(date.getDate() + (w * 7 * interval));
                if (until && date > until) break;
                expanded.push({ ...originalEvent, id: `${originalEvent.id}_${w}`, start: date, end: new Date(date.getTime() + duration) });
                addedCount++;
                continue;
            }
            if (w % interval !== 0) continue;
            for (const dayIdx of byDay) {
                if (dayIdx === undefined) continue;
                const date = new Date(anchor);
                date.setDate(date.getDate() + (w * 7) + dayIdx);
                date.setHours(originalEvent.start.getHours(), originalEvent.start.getMinutes(), originalEvent.start.getSeconds(), 0);
                if (date < originalEvent.start) continue; 
                if (until && date > until) { } else {
                    expanded.push({ ...originalEvent, id: `${originalEvent.id}_${w}_${dayIdx}`, start: date, end: new Date(date.getTime() + duration) });
                    addedCount++;
                }
            }
            if (until && expanded.length > 0 && expanded[expanded.length-1].start > until) break;
        }
        return expanded.length > 0 ? expanded : [originalEvent];
    } catch (e) { return [originalEvent]; }
  };

  const processICSContent = (content: string) => {
      try {
      if (!content.trim()) return;
      const events: CalendarEvent[] = [];
      const lines = content.split(/\r\n|\n|\r/);
      let currentEvent: Partial<CalendarEvent> | null = null;
      let currentEventRRule: string | null = null;
      let inEvent = false;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        if (line === 'BEGIN:VEVENT') {
          inEvent = true;
          currentEvent = { id: generateId(), type: EventType.IMPORTED, color: "bg-gray-100 border-gray-300 text-gray-700" }; 
          currentEventRRule = null;
          continue;
        } 
        if (line === 'END:VEVENT') {
          inEvent = false;
          if (currentEvent && currentEvent.title && currentEvent.start && currentEvent.end) {
            if (!isNaN(currentEvent.start.getTime()) && !isNaN(currentEvent.end.getTime())) {
                if (currentEventRRule) {
                    events.push(...expandRecurringEvent(currentEvent as CalendarEvent, currentEventRRule));
                } else {
                    events.push(currentEvent as CalendarEvent);
                }
            }
          }
          currentEvent = null; continue;
        }
        if (inEvent && currentEvent) {
          if (line.startsWith('SUMMARY:')) currentEvent.title = line.substring(8).trim();
          if (line.startsWith('RRULE:')) currentEventRRule = line.substring(6).trim();
          if (line.startsWith('DTSTART')) {
             const val = line.substring(line.indexOf(':') + 1).trim();
             const date = parseICSDate(val);
             if (date) currentEvent.start = date;
          }
          if (line.startsWith('DTEND')) {
             const val = line.substring(line.indexOf(':') + 1).trim();
             const date = parseICSDate(val);
             if (date) currentEvent.end = date;
          }
        }
      }
      onImport(events);
      setIcsContent(''); setUrlInput(''); onClose();
    } catch (e) { console.error(e); }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsProcessing(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      processICSContent(event.target?.result as string);
      setIsProcessing(false);
    };
    reader.readAsText(file);
  };

  const handleUrlImport = async () => {
    if (!urlInput) return;
    setIsProcessing(true);
    try {
        const targetUrl = urlInput.trim();
        let response;
        let error;

        // Strategy 1: corsproxy.io
        try {
            response = await fetch(`https://corsproxy.io/?${encodeURIComponent(targetUrl)}`);
            if (!response.ok) throw new Error("Proxy 1 failed");
        } catch (e) {
            console.warn("Primary proxy failed, trying fallback...");
            error = e;
        }

        // Strategy 2: allorigins.win (Fallback)
        if (!response || !response.ok) {
            try {
                // allorigins returns JSON by default, need 'raw' for ICS text
                response = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`);
                if (!response.ok) throw new Error("Fallback proxy failed");
            } catch (e) {
                console.error("All proxies failed", e);
                throw error || e;
            }
        }

        const text = await response.text();
        
        // Basic validation to check if we actually got ICS content
        if (!text.includes("BEGIN:VCALENDAR")) {
             throw new Error("Invalid ICS content received. The URL might be protected or incorrect.");
        }

        processICSContent(text);
    } catch (e) { 
        console.error(e);
        alert("Import failed. Please ensure:\n1. The URL is a direct link to an .ics file.\n2. For Google Calendar, use the 'Secret address in iCal format'.\n3. Your calendar is publicly accessible or you are using the secret link."); 
    } finally { setIsProcessing(false); }
  };

  const handleSimulateImport = () => {
    setIsProcessing(true);
    setTimeout(() => {
      const today = new Date();
      const mockEvents: CalendarEvent[] = [];
      for(let i=0; i<4; i++) { 
         [1, 3, 5].forEach(dayOffset => { 
             const start = new Date(today);
             start.setDate(today.getDate() - today.getDay() + dayOffset + (i*7));
             start.setHours(10, 0, 0, 0);
             const end = new Date(start);
             end.setHours(11, 30, 0, 0);
             mockEvents.push({
                id: generateId(),
                title: "Calculus II",
                start: start,
                end: end,
                type: EventType.IMPORTED,
                color: "bg-gray-100 border-gray-300 text-gray-700"
             });
         });
      }
      onImport(mockEvents);
      setIsProcessing(false);
      onClose();
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-500 bg-opacity-75 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 border border-gray-200">
        <h2 className="text-xl font-bold mb-6 text-gray-900 tracking-tight">Import Calendar</h2>
        
        <div className="flex border-b border-gray-200 mb-6">
            {(['upload', 'url', 'text'] as TabType[]).map(tab => (
                 <button 
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex-1 py-2 text-xs font-medium border-b-2 uppercase tracking-wide transition-colors ${activeTab === tab ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                >
                    {tab}
                </button>
            ))}
        </div>

        <div className="min-h-[160px]">
            {activeTab === 'upload' && (
                <div className="text-center py-4">
                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
                        <span className="text-sm text-gray-500">Click to upload .ics file</span>
                        <input type="file" accept=".ics,text/calendar" className="hidden" onChange={handleFileUpload} />
                    </label>
                </div>
            )}
            {activeTab === 'url' && (
                <div className="py-2">
                    <input 
                        type="url"
                        placeholder="https://calendar.google.com/calendar/ical/..."
                        value={urlInput}
                        onChange={(e) => setUrlInput(e.target.value)}
                        className="w-full p-2 bg-white border border-gray-300 rounded text-gray-900 focus:ring-1 focus:ring-indigo-500 text-sm"
                    />
                    <p className="text-[10px] text-gray-400 mt-2">
                        For Google Calendar, use the "Secret address in iCal format" from Settings.
                    </p>
                    <div className="mt-4 flex justify-end">
                        <Button onClick={handleUrlImport} isLoading={isProcessing} disabled={!urlInput} variant="secondary">Sync</Button>
                    </div>
                </div>
            )}
            {activeTab === 'text' && (
                <div className="py-2">
                    <textarea 
                        className="w-full h-32 p-2 bg-white border border-gray-300 rounded text-gray-900 font-mono text-xs focus:ring-1 focus:ring-indigo-500"
                        placeholder="BEGIN:VCALENDAR..."
                        value={icsContent}
                        onChange={(e) => setIcsContent(e.target.value)}
                    />
                    <div className="mt-2 flex justify-end">
                        <Button onClick={() => icsContent && processICSContent(icsContent)} disabled={!icsContent} variant="secondary">Parse</Button>
                    </div>
                </div>
            )}
        </div>

        <div className="mt-6 flex justify-between items-center pt-4 border-t border-gray-100">
             <button onClick={handleSimulateImport} className="text-xs text-gray-400 hover:text-indigo-600 underline">
                Simulate (Dev)
             </button>
             <div className="flex gap-2">
                <Button variant="ghost" onClick={onClose}>Cancel</Button>
             </div>
        </div>
      </div>
    </div>
  );
};
