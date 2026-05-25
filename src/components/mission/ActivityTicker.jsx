// ActivityTicker v2 — last 50 course-ops events, primarily streamed
// from `mc_events` (the v0.5.0 spine).
//
// WHAT CHANGED FROM v1
//   v1 proxied state-table writes from `mc_missions` + `user_level_progress`
//   to fake an activity feed. v2 reads the real event log directly.
//   Result: rich actor attribution, structured payload, and queryable
//   history (the same rows the audit trail uses).
//
// PRIMARY STREAM — `mc_events`
//   - Initial load: SELECT top 50, ordered by created_at DESC.
//   - Realtime: INSERT subscription on `mc_events` (the publication
//     was added in v0.5.0). New rows prepend to the list.
//   - Each event_type gets a custom renderer (icon + accent + summary).
//     Unknown types fall back to a generic Radio icon + the raw event_type
//     so future event_types appear immediately, just unstyled.
//
// FALLBACK STREAM — `mc_missions`
//   - Three sources of mission cards do NOT currently emit mc_events:
//     manual creation (+ New button), drag-and-drop lane changes,
//     Health Pulse / Morning Brief auto-cards. We subscribe to
//     mc_missions INSERT + UPDATE + DELETE to keep those visible.
//   - DEDUP: mission INSERTs whose `signal_source` starts with a
//     known Agent Action prefix (`catch_stragglers:`, `grant_tokens:`,
//     `refund:`) are SKIPPED because the matching mc_events row will
//     already show them (richer). When Health Pulse + Brief start
//     emitting events in handover priority #4, they'll naturally
//     stop double-appearing once their signal_source prefix is
//     added to AGENT_ACTION_PREFIXES.
//
// DROPPED FROM v1
//   `user_level_progress` subscription — student-side noise that
//   belongs on a per-student dashboard, not the ops feed.
//
// EXTERNAL HOOK PRESERVED
//   `window.__mcExternalEventPush({ type, text })` still works —
//   Socket.io / external-channel events can pipe in unchanged.

import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Radio,
  MessageSquare,
  Coins,
  Undo2,
  AlertTriangle,
  ShieldAlert,
  Search,
  Edit3,
  Trash2,
  Sparkles,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'

const MAX_EVENTS = 50

// mc_missions INSERTs whose signal_source starts with these prefixes
// also have a corresponding mc_events row — skip in the fallback
// stream to avoid duplicates. Extend this when new Agent Actions
// land (Health Pulse + Morning Brief will join in priority #4).
const AGENT_ACTION_PREFIXES = ['catch_stragglers:', 'grant_tokens:', 'refund:']

const isAgentActionMission = (signalSource) =>
  typeof signalSource === 'string' &&
  AGENT_ACTION_PREFIXES.some((p) => signalSource.startsWith(p))

const formatTime = (iso) => {
  const d = iso instanceof Date ? iso : new Date(iso)
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

const formatStripeAmount = (minor, currency) => {
  if (minor == null || !currency) return null
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(minor / 100)
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency.toUpperCase()}`
  }
}

const shortActor = (actor) => {
  if (!actor) return 'unknown'
  if (actor === 'system') return 'system'
  // email-shaped → strip everything after @ for the ticker line; the full
  // value is in the title attribute on hover.
  const at = actor.indexOf('@')
  return at > 0 ? actor.slice(0, at) : actor
}

const shortUser = (payload) =>
  payload?.email || (payload?.userId ? `${payload.userId.slice(0, 8)}…` : 'unknown')

// Per-event-type renderer. Returns { Icon, accent, text }. Unknown
// types degrade to a generic Radio + the raw type name (so new event
// types appear instantly without needing a code change).
const renderEvent = ({ event_type, payload }) => {
  const p = payload || {}
  switch (event_type) {
    case 'straggler.dm_sent':
      return {
        Icon: MessageSquare,
        accent: 'text-brand-accent',
        text: `DM via ${p.channel || '?'} → ${shortUser(p)}`,
      }
    case 'tokens.granted':
      return {
        Icon: Coins,
        accent: 'text-emerald-300',
        text: `+${p.amount ?? '?'} BROski$ → ${shortUser(p)}`,
      }
    case 'tokens.grant_skipped_duplicate':
      return {
        Icon: Coins,
        accent: 'text-amber-300',
        text: `Grant skipped (idempotent) → ${shortUser(p)}`,
      }
    case 'refund.issued': {
      const amt = formatStripeAmount(p.refundedAmount, p.currency)
      return {
        Icon: Undo2,
        accent: 'text-rose-200',
        text: `Refund ${amt || `${p.refundedAmount} ${p.currency || ''}`} → ${shortUser(p)}`,
      }
    }
    case 'refund.failed':
      return {
        Icon: AlertTriangle,
        accent: 'text-rose-300',
        text: `Refund FAILED at Stripe → ${shortUser(p)}`,
      }
    case 'refund.token_deduction_failed': {
      const amt = formatStripeAmount(p.refundedAmount, p.currency)
      return {
        Icon: ShieldAlert,
        accent: 'text-amber-300',
        text: `Refund ${amt || ''} OK but tokens NOT deducted → ${shortUser(p)}`,
      }
    }
    default:
      return {
        Icon: Radio,
        accent: 'text-gray-400',
        text: event_type || 'unknown event',
      }
  }
}

export default function ActivityTicker() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)

  // Push a normalised event onto the list (newest first, capped at MAX).
  const push = (ev) =>
    setEvents((prev) => {
      // De-dup by id when present (idempotent on realtime echo).
      if (ev.id && prev.some((e) => e.id === ev.id)) return prev
      return [ev, ...prev].slice(0, MAX_EVENTS)
    })

  useEffect(() => {
    let cancelled = false

    // ── Initial load — the rich source ────────────────────────────
    const loadInitial = async () => {
      const { data, error } = await supabase
        .from('mc_events')
        .select('id, event_type, actor, payload, created_at')
        .order('created_at', { ascending: false })
        .limit(MAX_EVENTS)
      if (cancelled) return
      if (error) {
        console.error('[ticker] mc_events initial load failed:', error)
        setLoading(false)
        return
      }
      setEvents(
        (data || []).map((row) => ({
          source: 'event',
          id: row.id,
          event_type: row.event_type,
          actor: row.actor,
          payload: row.payload,
          ts: new Date(row.created_at),
        })),
      )
      setLoading(false)
    }
    loadInitial()

    // ── PRIMARY — mc_events INSERT subscription ───────────────────
    const eventsCh = supabase
      .channel('mc-ticker-events')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mc_events' }, (p) => {
        push({
          source: 'event',
          id: p.new.id,
          event_type: p.new.event_type,
          actor: p.new.actor,
          payload: p.new.payload,
          ts: new Date(p.new.created_at),
        })
      })
      .subscribe()

    // ── FALLBACK — mc_missions for cards without an Agent Action
    //    event behind them (manual + drag-drop + Pulse + Brief). ──
    const missionsCh = supabase
      .channel('mc-ticker-missions')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mc_missions' }, (p) => {
        if (isAgentActionMission(p.new?.signal_source)) return
        push({
          source: 'mission',
          id: `m-ins-${p.new.id}`,
          event_type: 'mission.new',
          actor: p.new.owner || 'system',
          payload: { title: p.new.title, signalSource: p.new.signal_source },
          ts: new Date(p.new.created_at || Date.now()),
        })
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'mc_missions' }, (p) => {
        if (p.old?.lane === p.new?.lane) return // only surface lane changes
        push({
          source: 'mission',
          id: `m-upd-${p.new.id}-${p.new.lane}`,
          event_type: 'mission.update',
          actor: p.new.owner || 'system',
          payload: { title: p.new.title, fromLane: p.old?.lane, toLane: p.new.lane },
          ts: new Date(),
        })
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'mc_missions' }, (p) => {
        push({
          source: 'mission',
          id: `m-del-${p.old?.id}`,
          event_type: 'mission.delete',
          actor: 'unknown',
          payload: { title: p.old?.title || p.old?.id || 'mission' },
          ts: new Date(),
        })
      })
      .subscribe()

    // ── External hook (preserved for Socket.io plumbing) ──────────
    if (typeof window !== 'undefined') {
      window.__mcExternalEventPush = (ev) =>
        push({
          source: 'external',
          id: `ext-${Date.now()}-${Math.random()}`,
          event_type: ev?.type || 'external',
          actor: ev?.actor || 'external',
          payload: { text: ev?.text || '' },
          ts: new Date(),
        })
    }

    return () => {
      cancelled = true
      supabase.removeChannel(eventsCh)
      supabase.removeChannel(missionsCh)
    }
  }, [])

  // Mission-source rows get a tiny dedicated renderer (no event_type
  // overlap with mc_events) so the fallback path doesn't pollute the
  // main switch.
  const renderRow = (e) => {
    if (e.source === 'mission') {
      const p = e.payload || {}
      if (e.event_type === 'mission.new') {
        return { Icon: Search, accent: 'text-amber-300', text: `Mission: ${p.title || '?'}` }
      }
      if (e.event_type === 'mission.update') {
        return {
          Icon: Edit3,
          accent: 'text-sky-300',
          text: `"${p.title || '?'}" → ${p.toLane || '?'}`,
        }
      }
      if (e.event_type === 'mission.delete') {
        return { Icon: Trash2, accent: 'text-rose-300', text: `Mission deleted: ${p.title}` }
      }
    }
    if (e.source === 'external') {
      return { Icon: Sparkles, accent: 'text-fuchsia-300', text: e.payload?.text || 'external event' }
    }
    return renderEvent(e)
  }

  return (
    <div>
      <h2 className="text-sm uppercase tracking-widest text-brand-accent font-bold flex items-center gap-2 mb-3">
        <Radio className="w-4 h-4" /> Live Activity
      </h2>

      {loading && events.length === 0 ? (
        <p className="text-xs text-gray-500 font-mono italic">Loading recent events…</p>
      ) : events.length === 0 ? (
        <p className="text-xs text-gray-500 font-mono italic">
          No events yet — Agent Actions + missions stream here as they fire.
        </p>
      ) : (
        <ul className="space-y-2 custom-scrollbar max-h-[60vh] overflow-y-auto pr-1">
          <AnimatePresence initial={false}>
            {events.map((e) => {
              const { Icon, accent, text } = renderRow(e)
              const actor = shortActor(e.actor)
              return (
                <motion.li
                  key={e.id}
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-start gap-2 text-xs"
                  title={`event_type: ${e.event_type}\nactor: ${e.actor || 'unknown'}\nwhen: ${e.ts.toISOString()}`}
                >
                  <span className="font-mono text-gray-500 w-16 shrink-0">{formatTime(e.ts)}</span>
                  <span className={`pt-0.5 shrink-0 ${accent}`}>
                    <Icon className="w-3 h-3" />
                  </span>
                  <span className="text-gray-200 leading-snug min-w-0 flex-1">
                    {text}
                    {e.actor && (
                      <span className="text-gray-500 font-mono ml-1.5">· {actor}</span>
                    )}
                  </span>
                </motion.li>
              )
            })}
          </AnimatePresence>
        </ul>
      )}
    </div>
  )
}
