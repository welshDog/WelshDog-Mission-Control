import { useEffect, useState } from 'react'
import { Activity, LogOut, RefreshCw, Rocket, Stethoscope } from 'lucide-react'
import { supabase } from '../lib/supabase'
import AdminAuth from '../components/admin/AdminAuth'
import MissionsKanban from '../components/mission/MissionsKanban'
import AgentActions from '../components/mission/AgentActions'
import ActivityTicker from '../components/mission/ActivityTicker'

// MissionControl — the course-ops shell.
// Top bar (live clock + health pill) → Agent Actions strip → Missions
// Kanban → Activity Ticker (sidebar). Course-only this commit; multi-tenant
// can come later if the loop proves useful.
export default function MissionControl() {
  const [session, setSession]         = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [now, setNow]                 = useState(new Date())

  // --- Auth ---
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

  // --- Live clock ---
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    if (typeof window !== 'undefined') window.localStorage.removeItem('mcAdminVerification')
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

  const dateStr = now.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
  const timeStr = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  // Health pill is hard-coded green until commit #4 wires the heartbeat.
  const healthPill = (
    <span className="pill-green flex items-center gap-1"><Activity className="w-3 h-3" /> ALL SYSTEMS GO</span>
  )

  return (
    <div className="min-h-screen flex flex-col">
      {/* ── TOP BAR ─────────────────────────────────────────────────────── */}
      <header className="glass-panel border-b border-white/10 px-6 py-4 flex items-center gap-6 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-accent/10 border border-brand-accent/30 flex items-center justify-center">
            <Rocket className="w-5 h-5 text-brand-accent" />
          </div>
          <div>
            <h1 className="text-lg font-black accent-gradient-text leading-tight">Mission Control</h1>
            <p className="text-[10px] text-gray-500 font-mono uppercase tracking-widest">HVC-MISSION-CONTROL · v0.4.0</p>
          </div>
        </div>

        <div className="flex-1" />

        <div className="text-right font-mono leading-tight" aria-live="polite">
          <div className="text-xs text-gray-400">{dateStr}</div>
          <div className="text-xl font-black text-white tabular-nums">{timeStr}</div>
        </div>

        {healthPill}

        <div className="flex items-center gap-2">
          <button className="btn-secondary py-2 px-3 text-xs flex items-center gap-1" title="System health (wired commit #4)" disabled>
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

      {/* ── MAIN + RIGHT SIDEBAR ────────────────────────────────────────── */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 p-6">
        <main className="space-y-6">
          {/* Agents up top — most prominent slot */}
          <AgentActions />

          {/* Missions Kanban — the closed-loop board */}
          <MissionsKanban />
        </main>

        <aside className="glass-panel rounded-2xl p-6 border border-white/10 h-fit">
          <ActivityTicker />
        </aside>
      </div>

      {/* ── FOOTER ──────────────────────────────────────────────────────── */}
      <footer className="border-t border-white/10 px-6 py-3 text-[10px] text-gray-600 font-mono uppercase tracking-widest flex items-center justify-between">
        <span>🐶♾️ Mission Control · Vibe Coding Course Ops</span>
        <span>Built for brains that don't switch off.</span>
      </footer>
    </div>
  )
}
