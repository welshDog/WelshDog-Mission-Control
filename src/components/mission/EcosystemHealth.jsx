import { useCallback, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Globe2, RefreshCw, ChevronDown, ChevronRight, AlertTriangle,
  AlertCircle, CheckCircle2, PauseCircle, Flame, GitCommit, ExternalLink,
} from 'lucide-react'
import { loadEcosystem, mapAgeDays, CATEGORY_LABEL } from '../../lib/ecosystem'

// EcosystemHealth — the "see all, know all" panel.
//
// Reads the same ecosystem-map.json that generates AGENT-START.md §2, so the
// boot file and this dashboard can never disagree.
//
// ADHD pacing rule, applied to the UI itself:
//   ONE number at the top. Then ONLY what needs you. Everything healthy
//   collapses to a single line. PARKED is hidden behind a toggle because
//   parked means frozen on purpose — it must not sit there generating guilt.
//
// This panel deliberately shows NO per-repo metrics grid. 26 repos x 5 numbers
// is an interface you open once. Drill down is opt-in, always.

const STATUS_STYLES = {
  ok:   { pill: 'pill-green', ring: 'border-emerald-400/40', text: 'text-emerald-300', Icon: CheckCircle2,   headline: 'ECOSYSTEM HEALTHY' },
  warn: { pill: 'pill-amber', ring: 'border-amber-400/40',   text: 'text-amber-300',   Icon: AlertCircle,    headline: 'NEEDS A LOOK' },
  risk: { pill: 'pill-red',   ring: 'border-rose-400/40',    text: 'text-rose-300',    Icon: AlertTriangle,  headline: 'NEEDS YOU NOW' },
}

const LEVEL_STYLES = {
  risk: { dot: 'bg-rose-400',  text: 'text-rose-300',  border: 'border-rose-400/30'  },
  warn: { dot: 'bg-amber-400', text: 'text-amber-300', border: 'border-amber-400/30' },
}

export default function EcosystemHealth() {
  const [data, setData]       = useState(null)
  const [error, setError]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [showOk, setShowOk]         = useState(false)
  const [showParked, setShowParked] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      setData(await loadEcosystem())
    } catch (err) {
      setError(err.message ?? String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // ── Loading ──────────────────────────────────────────────────────────
  if (loading && !data) {
    return (
      <section className="glass-panel rounded-2xl p-6 border border-white/10">
        <div className="flex items-center gap-3 text-gray-400 text-sm">
          <RefreshCw className="w-4 h-4 animate-spin" /> Scanning the ecosystem…
        </div>
      </section>
    )
  }

  // ── Error ────────────────────────────────────────────────────────────
  if (error) {
    return (
      <section className="glass-panel rounded-2xl p-6 border border-rose-400/30">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-300 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h2 className="font-bold text-white text-sm">Ecosystem map unavailable</h2>
            <p className="text-xs text-rose-300/80 mt-1 font-mono">{error}</p>
            <p className="text-[11px] text-gray-500 mt-2">
              Generate it at the HperCore root with{' '}
              <code className="text-brand-accent">python scripts/gen_repo_map.py --write</code>,
              then <code className="text-brand-accent">npm run sync:ecosystem</code>.
            </p>
          </div>
          <button onClick={load} className="btn-secondary py-1.5 px-3 text-xs shrink-0">Retry</button>
        </div>
      </section>
    )
  }

  const s = STATUS_STYLES[data.status]
  const StatusIcon = s.Icon
  const age = mapAgeDays(data.generated)
  const mapStale = age !== null && age > 7

  return (
    <section className={`glass-panel rounded-2xl border ${s.ring} overflow-hidden`}>
      {/* ── HEADER: the ONE number ──────────────────────────────────── */}
      <div className="p-6 pb-5">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="w-10 h-10 rounded-xl bg-brand-accent/10 border border-brand-accent/30 flex items-center justify-center shrink-0">
            <Globe2 className="w-5 h-5 text-brand-accent" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-black text-white leading-tight">Ecosystem Health</h2>
            <p className="text-[10px] text-gray-500 font-mono uppercase tracking-widest">
              {data.total} repos · one source of truth
            </p>
          </div>

          <div className="flex-1" />

          <button
            onClick={load}
            className="btn-secondary py-2 px-3 text-xs flex items-center gap-1 shrink-0"
            title="Re-read ecosystem-map.json"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        {/* The headline number — big, unmissable, single */}
        <div className="mt-5 flex items-end gap-4 flex-wrap">
          <div>
            <div className={`text-5xl font-black tabular-nums ${s.text} leading-none`}>
              {data.okCount}<span className="text-gray-600 text-3xl">/{data.okCount + data.riskCount + data.warnCount}</span>
            </div>
            <div className="text-[10px] text-gray-500 font-mono uppercase tracking-widest mt-1.5">
              repos healthy · {data.healthPct}%
            </div>
          </div>

          <div className="flex-1" />

          <div className="flex items-center gap-2 flex-wrap">
            <span className={`${s.pill} flex items-center gap-1`}>
              <StatusIcon className="w-3 h-3" /> {s.headline}
            </span>
            {data.parkedCount > 0 && (
              <span className="px-2 py-1 rounded-full text-xs font-bold bg-white/5 text-gray-400 border border-white/10 flex items-center gap-1">
                <PauseCircle className="w-3 h-3" /> {data.parkedCount} parked
              </span>
            )}
          </div>
        </div>

        {/* Map freshness — the dashboard must not lie about itself */}
        {age !== null && (
          <p className={`text-[11px] mt-3 font-mono ${mapStale ? 'text-amber-300/80' : 'text-gray-600'}`}>
            {mapStale && <AlertCircle className="w-3 h-3 inline mr-1 -mt-0.5" />}
            map generated {age === 0 ? 'today' : `${age}d ago`}
            {mapStale && ' — run gen_repo_map.py --write'}
          </p>
        )}
      </div>

      {/* ── ATTENTION: only what needs you ──────────────────────────── */}
      {data.attention.length > 0 && (
        <div className="px-6 pb-5 space-y-2">
          {data.attention.map((repo) => {
            const ls = LEVEL_STYLES[repo.assessment.level]
            return (
              <motion.div
                key={repo.folder}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex items-start gap-3 rounded-xl border ${ls.border} bg-white/5 px-4 py-3`}
              >
                <span className={`w-2 h-2 rounded-full ${ls.dot} shrink-0 mt-1.5`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="font-bold text-white text-sm truncate">
                      {repo.emoji} {repo.folder}
                    </span>
                    <span className="text-[10px] text-gray-500 font-mono uppercase">
                      {CATEGORY_LABEL[repo.category] ?? repo.category}
                    </span>
                  </div>
                  <p className={`text-xs mt-0.5 ${ls.text}`}>{repo.assessment.reason}</p>
                </div>
                {repo.url && (
                  <a
                    href={repo.url} target="_blank" rel="noreferrer"
                    className="text-gray-500 hover:text-brand-accent shrink-0 mt-0.5"
                    title={repo.url}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </motion.div>
            )
          })}
        </div>
      )}

      {/* ── HOT: where the energy actually is ───────────────────────── */}
      {data.hottest.length > 0 && (
        <div className="px-6 pb-5">
          <div className="flex items-center gap-2 flex-wrap text-xs">
            <span className="text-gray-500 font-mono uppercase tracking-widest text-[10px] flex items-center gap-1">
              <Flame className="w-3 h-3 text-brand-pink" /> hottest
            </span>
            {data.hottest.map((r) => (
              <span key={r.folder} className="px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-gray-300 font-mono text-[11px]">
                {r.folder} <span className="text-brand-accent">{r.git.commits_30d}↑</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── COLLAPSED: everything fine + everything parked ──────────── */}
      <div className="border-t border-white/10 divide-y divide-white/10">
        <CollapsedGroup
          open={showOk} onToggle={() => setShowOk((v) => !v)}
          Icon={CheckCircle2} iconClass="text-emerald-400"
          label={`${data.okCount} repos OK`}
          repos={data.ok}
        />
        {data.parkedCount > 0 && (
          <CollapsedGroup
            open={showParked} onToggle={() => setShowParked((v) => !v)}
            Icon={PauseCircle} iconClass="text-gray-500"
            label={`${data.parkedCount} parked on purpose`}
            hint="frozen deliberately — not a backlog"
            repos={data.parked}
          />
        )}
      </div>
    </section>
  )
}

// A one-line summary that expands. The default state is CLOSED — that's the
// entire point of the panel.
function CollapsedGroup({ open, onToggle, Icon, iconClass, label, hint, repos }) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-6 py-3 hover:bg-white/5 transition-colors text-left"
      >
        {open ? <ChevronDown className="w-3.5 h-3.5 text-gray-500" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-500" />}
        <Icon className={`w-4 h-4 ${iconClass}`} />
        <span className="text-sm text-gray-300 font-medium">{label}</span>
        {hint && <span className="text-[10px] text-gray-600 font-mono">· {hint}</span>}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-6 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
              {repos.map((r) => (
                <div key={r.folder} className="flex items-center gap-2 text-xs min-w-0">
                  <span className="text-gray-300 truncate flex-1">{r.emoji} {r.folder}</span>
                  <span className="text-gray-600 font-mono shrink-0 flex items-center gap-1">
                    <GitCommit className="w-3 h-3" />
                    {r.git?.days_since === null || r.git?.days_since === undefined
                      ? '—'
                      : r.git.days_since === 0 ? 'today' : `${r.git.days_since}d`}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
