// ecosystem.js — the "see all, know all" data layer.
//
// Reads `public/ecosystem-map.json`, which is generated at the HperCore
// workspace root by `scripts/gen_repo_map.py` and copied in by
// `npm run sync:ecosystem`. Same file that feeds AGENT-START.md §2 — one
// source of truth for the boot file AND this dashboard.
//
// DESIGN RULE (the important one):
//   26 repos x 5 metrics = 130 numbers = an interface an ADHD brain opens
//   once and never again. So this module does the triage, not the operator.
//   It answers ONE question — "what needs me right now?" — and everything
//   healthy collapses to a single line.
//
// PARKED repos are excluded from scoring entirely. That is the whole point
// of the tier: frozen on purpose, must not generate guilt or noise.

export const MAP_URL = '/ecosystem-map.json'

// A LIVE thing untouched for a month is worth a glance — people depend on it.
export const STALE_LIVE_DAYS = 30
// Something you're actively building that's gone quiet has probably drifted.
export const STALE_BUILDING_DAYS = 21

export const TIER_META = {
  LIVE:     { label: 'LIVE',     pill: 'pill-green', dot: 'bg-emerald-400', order: 0 },
  BUILDING: { label: 'BUILDING', pill: 'pill-amber', dot: 'bg-amber-400',   order: 1 },
  PARKED:   { label: 'PARKED',   pill: 'pill-grey',  dot: 'bg-gray-500',    order: 2 },
  RETIRED:  { label: 'RETIRED',  pill: 'pill-grey',  dot: 'bg-gray-600',    order: 3 },
}

export const CATEGORY_LABEL = {
  core:      'Core platform & language',
  infra:     'Brain, skills & infra',
  products:  'Course, ops & products',
  games:     'Games & interactive',
  web:       'Web, shops & showcase',
  workspace: 'Workspace / local-only',
  retired:   'Retired',
}

/**
 * Decide whether a repo needs attention, and why.
 * Returns { level: 'ok' | 'warn' | 'risk' | 'muted', reason: string|null }
 *
 * 'muted' = deliberately not scored (PARKED / RETIRED). Not a failure state.
 */
export function assess(repo) {
  const tier = repo.tier
  const days = repo.git?.days_since ?? null

  if (tier === 'PARKED' || tier === 'RETIRED') {
    return { level: 'muted', reason: null }
  }

  // No commits at all in something you consider live or in-progress.
  if (!repo.is_git) {
    return { level: 'warn', reason: 'not a git repo' }
  }
  if (days === null) {
    return { level: 'warn', reason: 'no commits yet' }
  }

  if (tier === 'LIVE' && days > STALE_LIVE_DAYS) {
    return { level: 'risk', reason: `LIVE but untouched ${days}d` }
  }
  if (tier === 'BUILDING' && days > STALE_BUILDING_DAYS) {
    return { level: 'warn', reason: `quiet ${days}d — drifting?` }
  }

  // A repo carrying no manifest is invisible to the generated map.
  if (!repo.has_manifest) {
    return { level: 'warn', reason: 'no .hyperfocus.yml — missing from the map' }
  }

  return { level: 'ok', reason: null }
}

const LEVEL_WEIGHT = { risk: 0, warn: 1, ok: 2, muted: 3 }

/**
 * Turn the raw map into everything the panel needs, pre-sorted.
 * Worst first — the operator should never have to hunt for the problem.
 */
export function summarise(map) {
  const repos = (map?.repos ?? []).map((r) => ({ ...r, assessment: assess(r) }))

  const scored = repos.filter((r) => r.assessment.level !== 'muted')
  const parked = repos.filter((r) => r.assessment.level === 'muted')

  const risk = scored.filter((r) => r.assessment.level === 'risk')
  const warn = scored.filter((r) => r.assessment.level === 'warn')
  const ok   = scored.filter((r) => r.assessment.level === 'ok')

  const attention = [...risk, ...warn].sort((a, b) => {
    const w = LEVEL_WEIGHT[a.assessment.level] - LEVEL_WEIGHT[b.assessment.level]
    if (w !== 0) return w
    return (b.git?.days_since ?? 0) - (a.git?.days_since ?? 0)
  })

  // Health = share of *scored* repos that are fine. Parked never counts
  // against you.
  const healthPct = scored.length === 0
    ? 100
    : Math.round((ok.length / scored.length) * 100)

  const status = risk.length > 0 ? 'risk' : warn.length > 0 ? 'warn' : 'ok'

  const hottest = [...repos]
    .filter((r) => (r.git?.commits_30d ?? 0) > 0)
    .sort((a, b) => (b.git.commits_30d ?? 0) - (a.git.commits_30d ?? 0))
    .slice(0, 3)

  const tierCounts = repos.reduce((acc, r) => {
    acc[r.tier] = (acc[r.tier] ?? 0) + 1
    return acc
  }, {})

  return {
    generated: map?.generated ?? null,
    total: repos.length,
    repos, attention, ok, parked,
    riskCount: risk.length,
    warnCount: warn.length,
    okCount: ok.length,
    parkedCount: parked.length,
    healthPct, status, hottest, tierCounts,
  }
}

/** How stale is the map file itself? The dashboard must not lie about itself. */
export function mapAgeDays(generatedIso) {
  if (!generatedIso) return null
  const then = new Date(generatedIso).getTime()
  if (Number.isNaN(then)) return null
  return Math.floor((Date.now() - then) / 86_400_000)
}

/** Fetch + summarise. Throws with a operator-readable message on failure. */
export async function loadEcosystem() {
  let res
  try {
    res = await fetch(MAP_URL, { cache: 'no-store' })
  } catch {
    throw new Error('Could not reach ecosystem-map.json')
  }
  if (!res.ok) {
    throw new Error(
      res.status === 404
        ? 'ecosystem-map.json missing — run `npm run sync:ecosystem`'
        : `ecosystem-map.json returned ${res.status}`
    )
  }
  const map = await res.json()
  return summarise(map)
}
