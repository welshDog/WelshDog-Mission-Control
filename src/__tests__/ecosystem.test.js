import { describe, it, expect } from 'vitest'
import { assess, summarise, mapAgeDays, STALE_LIVE_DAYS, STALE_BUILDING_DAYS } from '../lib/ecosystem'

const repo = (over = {}) => ({
  folder: 'test-repo',
  tier: 'BUILDING',
  category: 'core',
  is_git: true,
  has_manifest: true,
  git: { days_since: 1, commits_30d: 5 },
  ...over,
})

describe('assess', () => {
  it('passes a healthy repo', () => {
    expect(assess(repo()).level).toBe('ok')
  })

  it('flags a LIVE repo that has gone cold as risk', () => {
    const r = repo({ tier: 'LIVE', git: { days_since: STALE_LIVE_DAYS + 1 } })
    expect(assess(r).level).toBe('risk')
    expect(assess(r).reason).toMatch(/LIVE but untouched/)
  })

  it('does NOT flag a LIVE repo inside the window', () => {
    expect(assess(repo({ tier: 'LIVE', git: { days_since: STALE_LIVE_DAYS - 1 } })).level).toBe('ok')
  })

  it('warns when a BUILDING repo goes quiet', () => {
    expect(assess(repo({ git: { days_since: STALE_BUILDING_DAYS + 1 } })).level).toBe('warn')
  })

  it('warns when a repo has no manifest — it is invisible to the generated map', () => {
    expect(assess(repo({ has_manifest: false })).reason).toMatch(/hyperfocus\.yml/)
  })

  it('warns on a folder that is not a git repo', () => {
    expect(assess(repo({ is_git: false })).level).toBe('warn')
  })

  it('warns when there are no commits at all', () => {
    expect(assess(repo({ git: { days_since: null } })).level).toBe('warn')
  })

  // The tier system exists so parked work stops generating guilt. If this
  // ever regresses, the whole design principle goes with it.
  it('MUTES parked repos no matter how cold they are', () => {
    const r = repo({ tier: 'PARKED', git: { days_since: 9999 }, has_manifest: false })
    expect(assess(r).level).toBe('muted')
    expect(assess(r).reason).toBeNull()
  })

  it('mutes retired repos too', () => {
    expect(assess(repo({ tier: 'RETIRED', git: { days_since: 9999 } })).level).toBe('muted')
  })
})

describe('summarise', () => {
  const map = {
    generated: new Date().toISOString(),
    repos: [
      repo({ folder: 'healthy-a' }),
      repo({ folder: 'healthy-b' }),
      repo({ folder: 'cold-live', tier: 'LIVE', git: { days_since: 99 } }),
      repo({ folder: 'quiet', git: { days_since: STALE_BUILDING_DAYS + 5 } }),
      repo({ folder: 'parked-thing', tier: 'PARKED', git: { days_since: 400 } }),
    ],
  }

  it('excludes parked repos from the health score', () => {
    const s = summarise(map)
    expect(s.total).toBe(5)
    expect(s.parkedCount).toBe(1)
    // 4 scored, 2 healthy
    expect(s.okCount).toBe(2)
    expect(s.healthPct).toBe(50)
  })

  it('sorts attention worst-first', () => {
    const s = summarise(map)
    expect(s.attention[0].folder).toBe('cold-live')
    expect(s.attention[0].assessment.level).toBe('risk')
  })

  it('reports risk status when anything is at risk', () => {
    expect(summarise(map).status).toBe('risk')
  })

  it('reports ok when everything scored is healthy', () => {
    const clean = { repos: [repo(), repo({ folder: 'b' }), repo({ folder: 'p', tier: 'PARKED', git: { days_since: 999 } })] }
    const s = summarise(clean)
    expect(s.status).toBe('ok')
    expect(s.healthPct).toBe(100)
  })

  it('ranks the hottest repos by 30-day commits', () => {
    const s = summarise({
      repos: [
        repo({ folder: 'quiet-one', git: { days_since: 1, commits_30d: 2 } }),
        repo({ folder: 'on-fire',   git: { days_since: 1, commits_30d: 78 } }),
      ],
    })
    expect(s.hottest[0].folder).toBe('on-fire')
  })

  it('survives an empty or malformed map', () => {
    expect(summarise({}).total).toBe(0)
    expect(summarise({}).healthPct).toBe(100)
    expect(summarise(null).total).toBe(0)
  })
})

describe('mapAgeDays', () => {
  it('returns 0 for a map generated today', () => {
    expect(mapAgeDays(new Date().toISOString())).toBe(0)
  })

  it('measures age in whole days', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000).toISOString()
    expect(mapAgeDays(threeDaysAgo)).toBe(3)
  })

  it('handles missing or junk timestamps', () => {
    expect(mapAgeDays(null)).toBeNull()
    expect(mapAgeDays('not-a-date')).toBeNull()
  })
})
