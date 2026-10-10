import express from 'express'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { rankMoves } from '../../src/lib/nextMove.js'
import { createCooBriefClient } from '../cooBrief.js'
import { supabase } from '../config.js'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { emitEvent } from '../lib/events.js'

const router = express.Router()

// ── /api/broski/next-move ─────────────────────────────────────────────
// Admin-only, READ-ONLY. "What's my next best move?" — ranks up to 3 tiny
// actions from the ecosystem map + the admin's open quests/XP (pure rules in
// src/lib/nextMove.js). If broski-coo is reachable, its brief rides along as
// advisory text; it never changes the ranking and its absence is not an error.
// Never calls complete_quest or any mutating agent endpoint.
const ECOSYSTEM_MAP_PATH = fileURLToPath(new URL('../../public/ecosystem-map.json', import.meta.url))
const fetchCooBrief = createCooBriefClient({
  url: process.env.BROSKI_COO_URL || 'http://localhost:8025',
  key: process.env.BROSKI_COO_KEY || process.env.AGENT_API_KEY || process.env.HYPERCODE_API_KEY,
})

router.get('/api/broski/next-move', requireAdmin, async (req, res) => {
  try {
    const map = JSON.parse(await readFile(ECOSYSTEM_MAP_PATH, 'utf-8'))

    const [xpRes, questsRes, doneRes] = await Promise.all([
      supabase.from('user_xp').select('total_xp, level, streak_days, last_active').eq('user_id', req.user.id).maybeSingle(),
      supabase.from('quests').select('id, title, xp_reward, token_reward').eq('is_active', true),
      supabase.from('user_quests').select('quest_id').eq('user_id', req.user.id),
    ])
    // Quest/XP reads are best-effort: still return repo moves if they fail.
    const questsOk = !questsRes.error && !doneRes.error
    const done = new Set((doneRes.data || []).map((r) => r.quest_id))
    const openQuests = questsOk ? (questsRes.data || []).filter((q) => !done.has(q.id)) : []
    const xp = xpRes.error ? null : xpRes.data

    const moves = rankMoves({ map, xp, openQuests })
    const coo = await fetchCooBrief()

    await emitEvent({
      eventType: 'nextmove.generated',
      actor: req.user.email,
      payload: { moves: moves.map((m) => m.id), openQuests: openQuests.length, coo: coo.status },
    })

    res.json({
      success: true,
      moves,
      xp: xp ? { totalXp: xp.total_xp, level: xp.level, streakDays: xp.streak_days } : null,
      openQuestCount: openQuests.length,
      questsAvailable: questsOk,
      mapGenerated: map.generated ?? null,
      coo: { status: coo.status, brief: coo.brief, generatedAt: coo.generatedAt ?? null },
    })
  } catch (e) {
    console.error('[mc-api] next-move failed:', e)
    res.status(500).json({ success: false, error: 'next_move_failed' })
  }
})

export default router
