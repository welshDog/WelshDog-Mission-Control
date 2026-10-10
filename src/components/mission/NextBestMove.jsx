import { useCallback, useEffect, useState } from 'react'
import { Compass, RefreshCw, Clock, Sparkles, Flame, WifiOff } from 'lucide-react'
import { supabase } from '../../lib/supabase'

// NextBestMove — BROski's "what should I do next?" panel (J.A.R.V.I.S. V0.1).
//
// READ-ONLY. Shows at most 3 tiny suggestions ranked server-side by
// src/lib/nextMove.js, plus the broski-coo brief when that agent is up.
// Nothing here acts on anything — every card is advice.

async function loadNextMove() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Not signed in')
  const res = await fetch('/api/broski/next-move', {
    headers: { Authorization: `Bearer ${session.access_token}` },
  })
  if (!res.ok) throw new Error(`BROski API returned ${res.status}`)
  return res.json()
}

const KIND_ICON = { quest: Sparkles, streak: Flame }

export default function NextBestMove() {
  const [data, setData]       = useState(null)
  const [error, setError]     = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      setData(await loadNextMove())
    } catch (err) {
      setError(err.message ?? String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <section className="glass-panel rounded-2xl p-6 border border-brand-accent/30" aria-label="BROski next best move">
      <header className="flex items-center gap-3 mb-4">
        <Compass className="w-5 h-5 text-brand-accent" />
        <h2 className="text-sm font-black uppercase tracking-widest accent-gradient-text">Next Best Move</h2>
        <div className="flex-1" />
        {data?.xp && (
          <span className="text-xs font-mono text-gray-400">
            Lv {data.xp.level} · {data.xp.totalXp} XP · {data.xp.streakDays}d streak
          </span>
        )}
        <button onClick={load} disabled={loading} className="btn-secondary py-1 px-2 text-xs flex items-center gap-1" title="Refresh">
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </header>

      {error && <p className="text-sm text-rose-300">Couldn&apos;t reach BROski: {error}</p>}

      {!error && loading && !data && (
        <p className="text-sm text-gray-400">BROski is thinking…</p>
      )}

      {data && data.moves.length === 0 && (
        <p className="text-sm text-emerald-300">Nothing needs you right now. Nice one. 🐶</p>
      )}

      {data && data.moves.length > 0 && (
        <ol className="space-y-3">
          {data.moves.map((m, i) => {
            const Icon = KIND_ICON[m.kind] ?? Compass
            return (
              <li key={m.id} className="flex items-start gap-3 rounded-xl border border-white/10 p-3">
                <span className="text-xs font-mono text-gray-500 mt-0.5">{i + 1}</span>
                <Icon className="w-4 h-4 mt-0.5 text-brand-accent shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold text-white">{m.title}</div>
                  <div className="text-xs text-gray-400">{m.why}</div>
                </div>
                <div className="text-right text-[11px] font-mono text-gray-400 shrink-0">
                  <div className="flex items-center gap-1 justify-end"><Clock className="w-3 h-3" /> ~{m.minutes}m</div>
                  {m.reward && <div className="text-emerald-300">+{m.reward.xp} XP{m.reward.tokens ? ` · +${m.reward.tokens} BROski$` : ''}</div>}
                </div>
              </li>
            )
          })}
        </ol>
      )}

      {data && data.questsAvailable === false && (
        <p className="mt-3 text-[11px] text-amber-300">Quest data unavailable — showing repo moves only.</p>
      )}

      {data?.coo?.brief && (
        <details className="mt-4">
          <summary className="text-xs text-gray-400 cursor-pointer">COO brief</summary>
          <p className="mt-2 text-xs text-gray-300 whitespace-pre-wrap">{data.coo.brief}</p>
        </details>
      )}
      {data && data.coo?.status === 'offline' && (
        <p className="mt-3 text-[11px] text-gray-500 flex items-center gap-1"><WifiOff className="w-3 h-3" /> COO offline — rule-based suggestions only.</p>
      )}
    </section>
  )
}
