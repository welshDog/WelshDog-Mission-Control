// nextMove.js — "What's my next best move?" ranking. PURE: no fetch, no DB.
//
// Imported by BOTH the browser and server/index.js, so keep it dependency-free
// apart from ./ecosystem (itself pure at import time).
//
// DESIGN RULES
//   - Deterministic rules decide WHAT to suggest. The optional COO brief is
//     advisory text attached to the result; it never changes the ranking.
//   - Max 3 moves. ADHD pacing: a list of 12 is a list nobody starts.
//   - READ-ONLY. Every move is advice ("look at X"); nothing here acts.

import { summarise } from './ecosystem.js'

export const MAX_MOVES = 3
// Streak at/below this with an active quest open → nudge to protect it.
export const STREAK_AT_RISK_DAYS = 1

/**
 * @param {object} input
 * @param {object} input.map          raw ecosystem-map.json
 * @param {object|null} input.xp      { total_xp, level, streak_days, last_active } | null
 * @param {Array}  input.openQuests   [{ id, title, xp_reward, token_reward }]
 * @returns {Array<{id,kind,title,why,minutes,reward}>} ranked, length <= MAX_MOVES
 */
export function rankMoves({ map, xp = null, openQuests = [] } = {}) {
  const eco = summarise(map)
  const candidates = []

  // 1. Anything LIVE that has gone cold — people depend on it.
  for (const r of eco.attention.filter((x) => x.assessment.level === 'risk')) {
    candidates.push({
      id: `repo:${r.folder}`,
      kind: 'repo-risk',
      score: 100 + (r.git?.days_since ?? 0) / 100,
      title: `Check on ${r.name ?? r.folder}`,
      why: r.assessment.reason,
      minutes: 15,
      reward: null,
    })
  }

  // 2. Highest-XP open quest — a rewarded win.
  const quests = [...openQuests].sort(
    (a, b) => (b.xp_reward ?? 0) - (a.xp_reward ?? 0),
  )
  if (quests.length > 0) {
    const q = quests[0]
    candidates.push({
      id: `quest:${q.id}`,
      kind: 'quest',
      score: 80 + Math.min(q.xp_reward ?? 0, 500) / 100,
      title: `Quest: ${q.title}`,
      why: 'Open quest on your board',
      minutes: 25,
      reward: { xp: q.xp_reward ?? 0, tokens: q.token_reward ?? 0 },
    })
  }

  // 3. Streak protection — only meaningful if there is an open quest to do.
  if (xp && (xp.streak_days ?? 0) >= STREAK_AT_RISK_DAYS && quests.length > 0 && isOlderThanToday(xp.last_active)) {
    candidates.push({
      id: 'streak',
      kind: 'streak',
      score: 90,
      title: `Protect your ${xp.streak_days}-day streak`,
      why: 'No activity logged today yet',
      minutes: 10,
      reward: null,
    })
  }

  // 4. BUILDING repos that have drifted.
  for (const r of eco.attention.filter((x) => x.assessment.level === 'warn')) {
    candidates.push({
      id: `repo:${r.folder}`,
      kind: 'repo-warn',
      score: 50 + (r.git?.days_since ?? 0) / 100,
      title: `Nudge ${r.name ?? r.folder}`,
      why: r.assessment.reason,
      minutes: 20,
      reward: null,
    })
  }

  return candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_MOVES)
    .map(({ score: _score, ...move }) => move)
}

function isOlderThanToday(iso) {
  if (!iso) return true
  const t = new Date(iso)
  if (Number.isNaN(t.getTime())) return true
  const now = new Date()
  return t.toDateString() !== now.toDateString()
}
