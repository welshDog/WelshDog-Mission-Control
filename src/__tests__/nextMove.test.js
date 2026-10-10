import { describe, it, expect } from 'vitest'
import { rankMoves, MAX_MOVES } from '../lib/nextMove'
import { STALE_LIVE_DAYS, STALE_BUILDING_DAYS } from '../lib/ecosystem'

const repo = (over = {}) => ({
  folder: 'r', name: 'r', tier: 'BUILDING', category: 'core',
  is_git: true, has_manifest: true, git: { days_since: 1, commits_30d: 5 }, ...over,
})
const mapOf = (...repos) => ({ generated: '2026-10-08', repos })
const quest = (over = {}) => ({ id: 'q1', title: 'Ship it', xp_reward: 100, token_reward: 10, ...over })

describe('rankMoves', () => {
  it('returns nothing when everything is healthy and no quests', () => {
    expect(rankMoves({ map: mapOf(repo()) })).toEqual([])
  })

  it('tolerates missing input', () => {
    expect(rankMoves()).toEqual([])
  })

  it('puts a cold LIVE repo first', () => {
    const map = mapOf(
      repo({ folder: 'cold', name: 'cold', tier: 'LIVE', git: { days_since: STALE_LIVE_DAYS + 5 } }),
      repo({ folder: 'drift', name: 'drift', git: { days_since: STALE_BUILDING_DAYS + 5 } }),
    )
    const moves = rankMoves({ map, openQuests: [quest()] })
    expect(moves[0].id).toBe('repo:cold')
    expect(moves[0].kind).toBe('repo-risk')
  })

  it('surfaces the highest-XP open quest with its reward', () => {
    const moves = rankMoves({
      map: mapOf(repo()),
      openQuests: [quest({ id: 'a', xp_reward: 50 }), quest({ id: 'b', xp_reward: 300, token_reward: 5 })],
    })
    expect(moves).toHaveLength(1)
    expect(moves[0].id).toBe('quest:b')
    expect(moves[0].reward).toEqual({ xp: 300, tokens: 5 })
  })

  it('never suggests more than MAX_MOVES', () => {
    const repos = Array.from({ length: 8 }, (_, i) =>
      repo({ folder: `c${i}`, name: `c${i}`, tier: 'LIVE', git: { days_since: STALE_LIVE_DAYS + i + 1 } }))
    expect(rankMoves({ map: mapOf(...repos), openQuests: [quest()] })).toHaveLength(MAX_MOVES)
  })

  it('ignores PARKED repos entirely', () => {
    const map = mapOf(repo({ tier: 'PARKED', git: { days_since: 400 } }))
    expect(rankMoves({ map })).toEqual([])
  })

  it('nudges a streak only when inactive today AND a quest is open', () => {
    const stale = { streak_days: 4, last_active: '2020-01-01T00:00:00Z' }
    const withQuest = rankMoves({ map: mapOf(repo()), xp: stale, openQuests: [quest()] })
    expect(withQuest.map((m) => m.kind)).toContain('streak')
    const noQuest = rankMoves({ map: mapOf(repo()), xp: stale })
    expect(noQuest).toEqual([])
    const today = rankMoves({ map: mapOf(repo()), xp: { streak_days: 4, last_active: new Date().toISOString() }, openQuests: [quest()] })
    expect(today.map((m) => m.kind)).not.toContain('streak')
  })

  it('does not leak the internal score field', () => {
    const moves = rankMoves({ map: mapOf(repo()), openQuests: [quest()] })
    expect(moves[0]).not.toHaveProperty('score')
  })
})
