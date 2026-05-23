import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Activity, LogOut, RefreshCw, Rocket, Stethoscope } from 'lucide-react'
import { supabase } from '../lib/supabase'
import AdminAuth from '../components/admin/AdminAuth'

// MissionControl — the auth-gated shell. This commit lands the chrome:
//   - Top bar with LIVE clock (auto-syncing every second) + system-health pill
//     + quick actions (Sync / Deploy / Health Check — wired in the next commit)
//   - Main canvas placeholder for the Kanban (PENDING → PRINTING → PACKED →
//     SHIPPED → DELIVERED) — landing in commit #2
//   - Right sidebar placeholder for the live activity ticker — commit #2
//
// The auth flow reuses the shop's Supabase project + `check-admin` edge fn, so
// an existing admin logs straight in (no new accounts to provision).
export default function MissionControl() {
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [now, setNow] = useState(new Date())

  // --- Auth: same pattern as the shop's Admin page ---
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setAuthLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
    })

    return () => subscription.unsubscribe()
  }, [])

  // --- Live clock: tick every second ---
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    if (typeof window !== 'undefined') window.localStorage.removeItem('adminVerification')
    setSession(null)
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400">
        <RefreshCw className="w-6 h-6 animate-spin mr-3" /> Loading Mission Control…
      </div>
    )
  }

  if (!session) {
    return <AdminAuth onLogin={() => supabase.auth.getSession().then(({ data: { session } }) => setSession(session))} />
  }

  // ---- Authed shell ----
  const dateStr = now.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
  const timeStr = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const month = now.getMonth() // 0-11 — seasonal planner auto-highlight base

  // System health is hard-coded green this commit; commit #2 wires the real
  // Supabase + Socket.io heartbeat into this pill.
  const healthPill = <span className="pill-green flex items-center gap-1"><Activity className="w-3 h-3" /> ALL SYSTEMS GO</span>

  return (
    <div className="min-h-screen flex flex-col">
      {/* ── TOP BAR ───────────────────────────────────────────────────────── */}
      <header className="glass-panel border-b border-white/10 px-6 py-4 flex items-center gap-6 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-accent/10 border border-brand-accent/30 flex items-center justify-center">
            <Rocket className="w-5 h-5 text-brand-accent" />
          </div>
          <div>
            <h1 className="text-lg font-black accent-gradient-text leading-tight">WelshDog Mission Control</h1>
            <p className="text-[10px] text-gray-500 font-mono uppercase tracking-widest">WDD-MISSION-CONTROL · v0.1.0</p>
          </div>
        </div>

        <div className="flex-1" />

        {/* Live clock — auto-syncs every second */}
        <div className="text-right font-mono leading-tight" aria-live="polite">
          <div className="text-xs text-gray-400">{dateStr}</div>
          <div className="text-xl font-black text-white tabular-nums">{timeStr}</div>
        </div>

        {healthPill}

        <div className="flex items-center gap-2">
          <button className="btn-secondary py-2 px-3 text-xs flex items-center gap-1" title="Sync (wired next commit)" disabled>
            <RefreshCw className="w-3 h-3" /> Sync
          </button>
          <button className="btn-secondary py-2 px-3 text-xs flex items-center gap-1" title="Deploy (wired next commit)" disabled>
            <Rocket className="w-3 h-3" /> Deploy
          </button>
          <button className="btn-secondary py-2 px-3 text-xs flex items-center gap-1" title="Health check (wired next commit)" disabled>
            <Stethoscope className="w-3 h-3" /> Health
          </button>
        </div>

        <div className="flex items-center gap-3 border-l border-white/10 pl-4">
          <span className="text-xs text-gray-400 font-mono">{session.user?.email}</span>
          <button onClick={handleLogout} className="btn-secondary py-2 px-3 text-xs flex items-center gap-1">
            <LogOut className="w-3 h-3" /> Sign out
          </button>
        </div>
      </header>

      {/* ── MAIN + RIGHT SIDEBAR ──────────────────────────────────────────── */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 p-6">
        <main className="space-y-6">
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-panel rounded-2xl p-6 border border-white/10"
          >
            <h2 className="text-sm uppercase tracking-widest text-brand-accent font-bold mb-2">Kanban Board</h2>
            <p className="text-gray-400 text-sm">
              <span className="font-mono">PENDING → PRINTING → PACKED → SHIPPED → DELIVERED</span> — drag-and-drop
              order lanes wired to Supabase Realtime. Landing in the next commit.
            </p>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="glass-panel rounded-2xl p-6 border border-white/10"
          >
            <h2 className="text-sm uppercase tracking-widest text-brand-accent font-bold mb-2">Seasonal Planner</h2>
            <p className="text-gray-400 text-sm">
              Current month index: <span className="font-mono text-white">{month}</span> — calendar
              auto-highlight wires up when <code className="font-mono">AdminCalendar</code> is pulled across.
            </p>
          </motion.section>
        </main>

        <aside className="glass-panel rounded-2xl p-6 border border-white/10 h-fit">
          <h2 className="text-sm uppercase tracking-widest text-brand-accent font-bold mb-3">Live Activity</h2>
          <p className="text-gray-500 text-xs font-mono">
            Ticker feed (orders · status changes · login attempts · agent pings) wires up when the
            Socket.io + Supabase Realtime channels are bolted on next commit.
          </p>
        </aside>
      </div>

      {/* ── FOOTER ────────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/10 px-6 py-3 text-[10px] text-gray-600 font-mono uppercase tracking-widest flex items-center justify-between">
        <span>🐶♾️ WelshDog Designs · Mission Control</span>
        <span>Built for brains that don't switch off.</span>
      </footer>
    </div>
  )
}
