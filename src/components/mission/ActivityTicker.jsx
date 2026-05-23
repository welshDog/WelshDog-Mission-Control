import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Radio, Search, Edit3, Trash2, Sparkles } from 'lucide-react'
import { supabase } from '../../lib/supabase'

// ActivityTicker — last 20 course-ops events.
//
// Subscribes to `mc_missions` (always present) and tries `user_level_progress`
// (course progress events). Each subscription is wrapped so a missing table
// just gets logged + skipped instead of crashing the panel.
//
// External events (V2.4 agent pings, login attempts) will pipe through the
// Socket.io channel that lands in a later commit — this component already
// merges anything pushed onto `window.__mcExternalEventPush`.
const MAX_EVENTS = 20

const formatTime = (iso) => {
  const d = iso instanceof Date ? iso : new Date(iso)
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

const eventIcon = (type) => {
  switch (type) {
    case 'mission.new':      return <Search className="w-3 h-3 text-amber-300" />
    case 'mission.update':   return <Edit3  className="w-3 h-3 text-sky-300" />
    case 'mission.delete':   return <Trash2 className="w-3 h-3 text-rose-300" />
    case 'progress.update':  return <Sparkles className="w-3 h-3 text-emerald-300" />
    default:                 return <Radio  className="w-3 h-3 text-brand-accent" />
  }
}

export default function ActivityTicker() {
  const [events, setEvents] = useState([])

  const push = (ev) =>
    setEvents((prev) => [{ ...ev, ts: new Date(), key: `${Date.now()}-${Math.random()}` }, ...prev].slice(0, MAX_EVENTS))

  useEffect(() => {
    // --- mc_missions (created by Agent Actions + manual + drag-and-drop) ---
    const missionsCh = supabase
      .channel('mc-ticker-missions')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mc_missions' }, (p) =>
        push({ type: 'mission.new', text: `Mission: ${p.new.title}` })
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'mc_missions' }, (p) => {
        if (p.old?.lane !== p.new?.lane) {
          push({ type: 'mission.update', text: `"${p.new.title}" → ${p.new.lane}` })
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'mc_missions' }, (p) =>
        push({ type: 'mission.delete', text: `Mission deleted (${p.old?.title || p.old?.id})` })
      )
      .subscribe()

    // --- user_level_progress (course completions / progress) ---
    // Wrapped: if the table isn't in the realtime publication or doesn't
    // exist, the channel will just sit idle — no crash.
    const progressCh = supabase
      .channel('mc-ticker-progress')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'user_level_progress' }, (p) => {
        const done = !!p.new?.completed_at && !p.old?.completed_at
        push({
          type: 'progress.update',
          text: done
            ? `Level ${p.new.level ?? '?'} completed by ${p.new.user_id?.slice(0, 8) ?? '?'}…`
            : `Level ${p.new.level ?? '?'} updated`,
        })
      })
      .subscribe()

    // --- External event hook (Socket.io plumbing arrives in a later commit) ---
    if (typeof window !== 'undefined') {
      window.__mcExternalEventPush = (ev) => push({ type: 'external', ...ev })
    }

    return () => {
      supabase.removeChannel(missionsCh)
      supabase.removeChannel(progressCh)
    }
  }, [])

  return (
    <div>
      <h2 className="text-sm uppercase tracking-widest text-brand-accent font-bold flex items-center gap-2 mb-3">
        <Radio className="w-4 h-4" /> Live Activity
      </h2>

      {events.length === 0 ? (
        <p className="text-xs text-gray-500 font-mono italic">
          No events yet — missions + course progress will stream here as they happen.
        </p>
      ) : (
        <ul className="space-y-2 custom-scrollbar max-h-[60vh] overflow-y-auto pr-1">
          <AnimatePresence initial={false}>
            {events.map((e) => (
              <motion.li
                key={e.key}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-start gap-2 text-xs"
              >
                <span className="font-mono text-gray-500 w-16 shrink-0">{formatTime(e.ts)}</span>
                <span className="pt-0.5">{eventIcon(e.type)}</span>
                <span className="text-gray-200 leading-snug">{e.text}</span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  )
}
