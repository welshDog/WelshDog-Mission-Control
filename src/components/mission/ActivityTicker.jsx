import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Radio, ShoppingBag, UserPlus, Edit3, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'

// ActivityTicker — last 20 events from Supabase Realtime.
//
// DB events use Supabase Realtime (no Socket.io needed). External events
// (V2.4 agent pings, login attempts) will pipe through the Socket.io
// channel that lands in commit #3 — this component already merges anything
// pushed onto `window.__mcExternalEvents` so wiring that is trivial later.
const MAX_EVENTS = 20

const formatTime = (iso) => {
  const d = iso instanceof Date ? iso : new Date(iso)
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

const eventIcon = (type) => {
  switch (type) {
    case 'order.new':      return <ShoppingBag className="w-3 h-3 text-emerald-300" />
    case 'order.update':   return <Edit3 className="w-3 h-3 text-sky-300" />
    case 'order.delete':   return <Trash2 className="w-3 h-3 text-rose-300" />
    case 'demo.new':       return <UserPlus className="w-3 h-3 text-fuchsia-300" />
    default:               return <Radio className="w-3 h-3 text-brand-accent" />
  }
}

export default function ActivityTicker() {
  const [events, setEvents] = useState([])

  const push = (ev) =>
    setEvents((prev) => [{ ...ev, ts: new Date(), key: `${Date.now()}-${Math.random()}` }, ...prev].slice(0, MAX_EVENTS))

  useEffect(() => {
    // --- Supabase Realtime: orders ---
    const ordersCh = supabase
      .channel('mc-ticker-orders')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (p) =>
        push({ type: 'order.new', text: `New order #${p.new.order_number || p.new.id} from ${p.new.customer_name || 'anon'}` })
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, (p) => {
        const oldS = p.old?.fulfillment_status, newS = p.new?.fulfillment_status
        if (oldS !== newS) {
          push({ type: 'order.update', text: `Order #${p.new.order_number || p.new.id} → ${newS}` })
        } else {
          push({ type: 'order.update', text: `Order #${p.new.order_number || p.new.id} updated` })
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'orders' }, (p) =>
        push({ type: 'order.delete', text: `Order #${p.old.order_number || p.old.id} deleted` })
      )
      .subscribe()

    // --- Supabase Realtime: demo_bookings ---
    const demoCh = supabase
      .channel('mc-ticker-demo')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'demo_bookings' }, (p) =>
        push({ type: 'demo.new', text: `Demo booking: ${p.new.name || p.new.email || 'anon'}` })
      )
      .subscribe()

    // --- External-event hook (Socket.io plumbing arrives in commit #3) ---
    if (typeof window !== 'undefined') {
      window.__mcExternalEvents = window.__mcExternalEvents || []
      window.__mcExternalEventPush = (ev) => push({ type: 'external', ...ev })
    }

    return () => {
      supabase.removeChannel(ordersCh)
      supabase.removeChannel(demoCh)
    }
  }, [])

  return (
    <div>
      <h2 className="text-sm uppercase tracking-widest text-brand-accent font-bold flex items-center gap-2 mb-3">
        <Radio className="w-4 h-4" /> Live Activity
      </h2>

      {events.length === 0 ? (
        <p className="text-xs text-gray-500 font-mono italic">
          No events yet — orders / bookings will stream here as they happen.
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
