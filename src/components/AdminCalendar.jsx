import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, ShoppingBag, Gift, Flag } from 'lucide-react';
import { getSeasonalEvents } from '../lib/seasonalEvents';
import { motion } from 'framer-motion';

// Copied from welshdog-designs-web3-shop@src/components/AdminCalendar.jsx
// (the "seasonal planner" Lyndz wanted). Unchanged — same brand tokens,
// same data shape, so it slots cleanly into Mission Control.
const AdminCalendar = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [events, setEvents] = useState([]);

  useEffect(() => {
    // Load events for current and next year to ensure coverage
    const year = currentDate.getFullYear();
    const currentYearEvents = getSeasonalEvents(year);
    const nextYearEvents = getSeasonalEvents(year + 1);
    setEvents([...currentYearEvents, ...nextYearEvents]);
  }, [currentDate.getFullYear()]); // eslint-disable-line react-hooks/exhaustive-deps

  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const isSameDay = (d1, d2) => {
    return d1.getDate() === d2.getDate() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getFullYear() === d2.getFullYear();
  };

  const getEventsForDay = (day) => {
    const checkDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    return events.filter(e => isSameDay(e.date, checkDate));
  };

  const upcomingEvents = events.filter(e => e.date >= new Date()).slice(0, 5);

  const renderEventIcon = (type) => {
    switch (type) {
      case 'shopping': return <ShoppingBag className="w-3 h-3 text-purple-400" />;
      case 'cultural': return <Flag className="w-3 h-3 text-yellow-400" />;
      default: return <Gift className="w-3 h-3 text-brand-accent" />;
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Calendar Grid */}
      <div className="lg:col-span-2 glass-panel p-6 rounded-2xl border border-white/10">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-brand-accent" />
            {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </h2>
          <div className="flex gap-2">
            <button onClick={prevMonth} className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button onClick={nextMonth} className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-2 mb-2 text-center">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} className="text-xs font-bold text-gray-500 uppercase">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-2">
          {/* Empty cells for start of month */}
          {Array.from({ length: firstDayOfMonth }).map((_, i) => (
            <div key={`empty-${i}`} className="aspect-square" />
          ))}

          {/* Days */}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dayDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
            const dayEvents = getEventsForDay(day);
            const isToday = isSameDay(dayDate, new Date());
            const isSelected = isSameDay(dayDate, selectedDate);

            return (
              <button
                key={day}
                onClick={() => setSelectedDate(dayDate)}
                className={`aspect-square rounded-lg flex flex-col items-center justify-start pt-2 relative group transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-2 focus-visible:ring-offset-brand-dark ${
                  isSelected ? 'bg-brand-accent text-black font-bold' :
                  isToday ? 'bg-white/10 text-white border border-brand-accent/50' :
                  'hover:bg-white/5 text-gray-300'
                }`}
              >
                <span className="text-sm">{day}</span>

                {/* Event Dots */}
                <div className="flex gap-1 mt-1 flex-wrap justify-center px-1">
                  {dayEvents.map((ev, idx) => (
                    <div
                      key={idx}
                      className={`w-1.5 h-1.5 rounded-full ${
                        ev.type === 'shopping' ? 'bg-purple-500' :
                        ev.type === 'cultural' ? 'bg-yellow-500' : 'bg-green-500'
                      }`}
                    />
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Sidebar / Info Panel */}
      <div className="space-y-6">
        {/* Selected Date Info */}
        <div className="glass-panel p-6 rounded-2xl border border-white/10 h-full flex flex-col">
          <h3 className="text-lg font-bold text-white mb-4 border-b border-white/10 pb-2">
            {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </h3>

          <div className="flex-1">
            {events.filter(e => isSameDay(e.date, selectedDate)).length > 0 ? (
              <div className="space-y-3">
                {events.filter(e => isSameDay(e.date, selectedDate)).map((ev, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`p-3 rounded-lg border flex items-center gap-3 ${
                      ev.type === 'shopping' ? 'bg-purple-500/10 border-purple-500/30 text-purple-200' :
                      ev.type === 'cultural' ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-200' :
                      'bg-green-500/10 border-green-500/30 text-green-200'
                    }`}
                  >
                    {renderEventIcon(ev.type)}
                    <span className="font-bold">{ev.name}</span>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="text-gray-500 text-sm italic">No special events today.</div>
            )}
          </div>

          {/* Upcoming List */}
          <div className="mt-8">
            <h4 className="text-xs uppercase text-gray-500 font-bold mb-3">Upcoming Highlights</h4>
            <div className="space-y-2">
              {upcomingEvents.map((ev, idx) => (
                <div key={idx} className="flex items-center gap-3 text-sm group cursor-default">
                  <div className="text-gray-500 font-mono text-xs w-12">
                    {ev.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </div>
                  <div className={`flex-1 truncate group-hover:text-brand-accent transition-colors ${
                    isSameDay(ev.date, new Date()) ? 'text-brand-accent font-bold' : 'text-gray-300'
                  }`}>
                    {ev.name}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminCalendar;
