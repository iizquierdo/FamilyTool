
import React, { useState } from 'react';
import { CalendarEvent } from '../types';
import { useTranslation } from 'react-i18next';

const MOCK_EVENTS: CalendarEvent[] = [
  { id: '1', title: 'All Day Event', description: 'Toto lorem ipsum dolor sit incid idunt ut', location: 'Federation Square', start: '2026-01-01', end: '2026-01-02', allDay: true, color: 'bg-emerald-500' },
  { id: '2', title: 'Company Trip', start: '2026-01-02', end: '2026-01-02', color: 'bg-violet-600' },
  { id: '3', title: 'ICT Expo 2021 - Product R', start: '2026-01-03', end: '2026-01-04', color: 'bg-blue-600' },
  { id: '4', title: 'Conference', start: '2026-01-09', end: '2026-01-10', color: 'bg-blue-500' },
  { id: '5', title: 'Repeating Event', start: '2026-01-09', end: '2026-01-09', color: 'text-slate-400' },
  { id: '6', title: 'Meeting', start: '2026-01-10', end: '2026-01-10', color: 'text-slate-400' },
  { id: '7', title: 'Birthday Party', start: '2026-01-11', end: '2026-01-11', color: 'text-slate-400' },
  { id: '8', title: 'Dinner', start: '2026-01-11', end: '2026-01-12', color: 'bg-blue-600' },
  { id: '9', title: 'Reporting', start: '2026-01-14', end: '2026-01-14', color: 'bg-amber-400' },
  { id: '10', title: 'Repeating Event', start: '2026-01-16', end: '2026-01-16', color: 'text-slate-400' },
];

const CalendarModule: React.FC = () => {
  const { t } = useTranslation();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [viewMode, setViewMode] = useState<'Month' | 'Week' | 'Day'>('Month');

  const days = Array.from({ length: 31 }, (_, i) => i + 1);
  // Padding for grid (January 2026 starts on Thursday)
  const emptyDays = Array.from({ length: 4 }, (_, i) => 28 + i);

  const getEventsForDay = (day: number) => {
    const dateStr = `2026-01-${day.toString().padStart(2, '0')}`;
    return MOCK_EVENTS.filter(e => e.start === dateStr || (e.allDay && e.start <= dateStr && e.end >= dateStr));
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-12">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-slate-900">Calendar</h2>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest shadow-lg shadow-indigo-100 flex items-center gap-2"
        >
          <i className="fa-solid fa-plus"></i> {t('calendar.newEvent')}
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Calendar Header */}
        <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <button className="w-8 h-8 flex items-center justify-center text-slate-400 hover:bg-slate-50 rounded-lg"><i className="fa-solid fa-chevron-left text-xs"></i></button>
            <button className="w-8 h-8 flex items-center justify-center text-slate-400 hover:bg-slate-50 rounded-lg"><i className="fa-solid fa-chevron-right text-xs"></i></button>
            <button className="px-4 py-1.5 bg-slate-50 text-slate-400 text-xs font-bold rounded-lg ml-2">Today</button>
          </div>

          <h3 className="text-xl font-bold text-slate-700">January 2026</h3>

          <div className="flex bg-slate-50 p-1 rounded-xl">
            {['Month', 'Week', 'Day'].map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode as any)}
                className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${viewMode === mode ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
              >
                {mode === 'Month' ? t('calendar.month') : mode === 'Week' ? t('calendar.week') : t('calendar.day')}
              </button>
            ))}
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 border-b border-slate-100">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="py-4 text-center text-xs font-bold text-slate-500 bg-slate-50/30 border-r last:border-0 border-slate-100 uppercase tracking-widest">{day}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 auto-rows-[140px]">
          {emptyDays.map(d => (
            <div key={`empty-${d}`} className="p-4 border-r border-b border-slate-100 bg-slate-50/10 text-right">
              <span className="text-xs font-bold text-slate-300">{d}</span>
            </div>
          ))}
          {days.map(day => (
            <div key={day} className={`p-2 border-r border-b border-slate-100 group hover:bg-slate-50/30 transition-colors ${day === 10 ? 'bg-emerald-50/20' : ''}`}>
              <div className="text-right mb-2">
                <span className={`text-xs font-bold ${day === 10 ? 'text-emerald-600' : 'text-slate-400'}`}>{day}</span>
              </div>
              <div className="space-y-1">
                {getEventsForDay(day).map(event => (
                  <div
                    key={event.id}
                    onClick={() => setSelectedEvent(event)}
                    className={`px-2 py-1 rounded text-[10px] font-bold truncate cursor-pointer transition-all hover:brightness-95 ${event.color.startsWith('bg-') ? `${event.color} text-white` : 'text-slate-500 flex items-center gap-1'}`}
                  >
                    {!event.color.startsWith('bg-') && <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>}
                    {event.title}
                  </div>
                ))}
                {day === 10 && <div className="text-[10px] font-bold text-indigo-500 pl-1 cursor-pointer">+3 more</div>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add Event Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsAddModalOpen(false)}></div>
          <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h3 className="text-xl font-bold text-slate-900">Add a New Event</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-50">
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <div className="p-8 space-y-6">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Event Name <span className="text-rose-500">*</span></label>
                <input type="text" className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500/10" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Event Description</label>
                <textarea className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none min-h-[100px]"></textarea>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Event Location</label>
                <input type="text" className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none" />
              </div>
              <label className="flex items-center gap-2 cursor-pointer group w-fit">
                <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-indigo-600" />
                <span className="text-xs font-bold text-slate-400 group-hover:text-slate-600">All Day</span>
              </label>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Event Start Date <span className="text-rose-500">*</span></label>
                  <input type="date" defaultValue="2026-01-10" className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Event Start Time</label>
                  <input type="time" defaultValue="00:06" className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Event End Date <span className="text-rose-500">*</span></label>
                  <input type="date" defaultValue="2026-01-10" className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Event End Time</label>
                  <input type="time" defaultValue="00:06" className="w-full px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none" />
                </div>
              </div>
            </div>
            <div className="p-6 bg-slate-50/50 border-t border-slate-100 flex justify-center gap-3">
              <button onClick={() => setIsAddModalOpen(false)} className="px-8 py-2.5 bg-white border border-slate-200 text-slate-500 text-xs font-bold rounded-xl hover:bg-slate-50">Cancel</button>
              <button onClick={() => setIsAddModalOpen(false)} className="px-8 py-2.5 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-100">Submit</button>
            </div>
          </div>
        </div>
      )}

      {/* Event Detail Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setSelectedEvent(null)}></div>
          <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 flex items-center justify-end gap-2 border-b border-slate-50">
              <button className="p-2 text-slate-300 hover:text-indigo-600"><i className="fa-solid fa-pen text-sm"></i></button>
              <button className="p-2 text-slate-300 hover:text-rose-500"><i className="fa-solid fa-trash-can text-sm"></i></button>
              <button onClick={() => setSelectedEvent(null)} className="p-2 text-slate-300 hover:text-slate-600 ml-2"><i className="fa-solid fa-xmark text-lg"></i></button>
            </div>
            <div className="p-10 space-y-8">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600">
                  <i className="fa-regular fa-calendar-days text-xl"></i>
                </div>
                <div>
                  <h3 className="text-xl font-bold text-slate-900 flex items-center gap-3">
                    {selectedEvent.title}
                    {selectedEvent.allDay && <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 text-[9px] font-bold rounded uppercase">All Day</span>}
                  </h3>
                  {selectedEvent.description && <p className="text-sm text-slate-500 mt-2">{selectedEvent.description}</p>}
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-4 text-sm font-medium">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  <span className="text-slate-900 w-12 font-bold">Starts</span>
                  <span className="text-slate-500">{new Date(selectedEvent.start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} Jan, 2026</span>
                </div>
                <div className="flex items-center gap-4 text-sm font-medium">
                  <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                  <span className="text-slate-900 w-12 font-bold">Ends</span>
                  <span className="text-slate-500">{new Date(selectedEvent.end).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} Jan, 2026</span>
                </div>
                {selectedEvent.location && (
                  <div className="flex items-center gap-4 text-sm font-medium pt-2">
                    <i className="fa-solid fa-location-dot text-slate-300 w-4 text-center"></i>
                    <span className="text-slate-500">{selectedEvent.location}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CalendarModule;
