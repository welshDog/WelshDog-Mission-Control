import { useEffect, useState } from 'react'
import { Activity, LogOut, RefreshCw, Rocket, Stethoscope } from 'lucide-react'
import { supabase } from '../lib/supabase'
import AdminAuth from '../components/admin/AdminAuth'
import AdminCalendar from '../components/AdminCalendar'
import OrdersKanban from '../components/mission/OrdersKanban'
import ActivityTicker from '../components/mission/ActivityTicker'

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

  // System health: hard-coded green for now. Commit #3 wires the real
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
          {/* Kanban — orders by fulfillment_status, drag-and-drop persists to Supabase */}
          <OrdersKanban />

          {/* Seasonal planner — same component the shop uses; current month auto-highlights */}
          <section className="glass-panel rounded-2xl p-6 border border-white/10">
            <h2 className="text-sm uppercase tracking-widest text-brand-accent font-bold mb-4">Seasonal Planner</h2>
            <AdminCalendar />
          </section>
        </main>

        <aside className="glass-panel rounded-2xl p-6 border border-white/10 h-fit">
          <ActivityTicker />
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
