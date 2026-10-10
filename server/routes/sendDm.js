import express from 'express'
import { supabase, DISCORD_BOT_TOKEN, DISCORD_API, RATE_LIMIT_MS, dmSendAttemptTotal, dmSendFailureTotal } from '../config.js'
import { requireAdmin } from '../middleware/requireAdmin.js'
import { emitEvent } from '../lib/events.js'
import { sendDmLimit } from '../lib/limits.js'

const router = express.Router()

// ── /api/send-dm ──────────────────────────────────────────────────────
// Admin-only. Body: { userId, discordId?, email?, message, tone? }
// Returns: { success: true,  userId, channel, messageId? }
//          { success: false, userId, error, retryAfter? }
//   401 = missing/invalid Bearer JWT · 403 = authenticated but not admin
router.post('/api/send-dm', requireAdmin, sendDmLimit, async (req, res) => {
  const { userId, discordId, email, message, tone } = req.body || {}

  if (!userId || !message) {
    return res.status(400).json({ success: false, error: 'userId and message are required' })
  }
  if (!supabase) {
    return res.status(500).json({ success: false, userId, error: 'supabase not configured' })
  }
  if (!DISCORD_BOT_TOKEN) {
    return res.status(500).json({ success: false, userId, error: 'discord token missing' })
  }

  // ── 24h rate limit (mc_missions is the source of truth) ────────────
  const cutoff = new Date(Date.now() - RATE_LIMIT_MS).toISOString()
  const userSignal = `catch_stragglers:dm_sent:${userId}`
  const { data: recent, error: rlErr } = await supabase
    .from('mc_missions')
    .select('id, created_at')
    .eq('signal_source', userSignal)
    .gt('created_at', cutoff)
    .limit(1)
  if (rlErr) {
    console.error('[mc-api] rate-limit lookup failed:', rlErr)
    return res.status(500).json({ success: false, userId, error: 'rate_limit_lookup_failed' })
  }
  if (recent && recent.length > 0) {
    const sentAt = new Date(recent[0].created_at).getTime()
    const retryAfter = Math.max(0, Math.ceil((sentAt + RATE_LIMIT_MS - Date.now()) / 1000))
    return res.status(429).json({ success: false, userId, error: 'rate_limited', retryAfter })
  }

  dmSendAttemptTotal.inc()

  // ── Discord delivery (DM channel → send message). Fall back to ─────
  // email_logged on failure so the operator can chase manually.
  let channel = 'none'
  let messageId
  let discordError

  if (discordId) {
    try {
      const openRes = await fetch(`${DISCORD_API}/users/@me/channels`, {
        method: 'POST',
        headers: {
          Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ recipient_id: discordId }),
      })
      if (!openRes.ok) {
        discordError = `open_dm ${openRes.status}`
      } else {
        const { id: channelId } = await openRes.json()
        const sendRes = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
          method: 'POST',
          headers: {
            Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ content: message }),
        })
        if (sendRes.status === 429) {
          const body = await sendRes.json().catch(() => ({}))
          return res.status(429).json({
            success: false,
            userId,
            error: 'discord_rate_limited',
            retryAfter: body.retry_after || 1,
          })
        }
        if (!sendRes.ok) {
          discordError = `send_dm ${sendRes.status}`
        } else {
          const sent = await sendRes.json()
          channel = 'discord'
          messageId = sent.id
        }
      }
    } catch (e) {
      discordError = e?.message || 'discord_fetch_failed'
    }
  }

  if (channel === 'none' && email) {
    // No SMTP wired yet — we LOG the email-fallback so the operator can
    // see exactly who needs a manual chase. Real send lands in a later
    // commit when the email provider is picked.
    channel = 'email_logged'
  }

  if (channel === 'none') {
    dmSendFailureTotal.inc()
    return res.status(502).json({
      success: false,
      userId,
      error: discordError || 'no_delivery_channel',
    })
  }

  // ── Audit (the loop closes here) ────────────────────────────────────
  // Two-layer pattern: mc_missions = operator-visible Kanban card,
  // mc_events = immutable detail. Both writes are best-effort — if
  // either fails after the DM already shipped, we log + still return
  // success so the operator's UI moves on (the alternative is making
  // them think the DM didn't send, which is worse than a stale audit).
  const actor = req.user?.email || 'unknown'
  const noteLines = [
    `userId: ${userId}`,
    `channel: ${channel}`,
    `tone: ${tone || 'unknown'}`,
    `actor: ${actor}`,
    messageId ? `discord_message_id: ${messageId}` : null,
    discordError ? `discord_error: ${discordError}` : null,
    '',
    'message:',
    message,
  ].filter(Boolean)

  const { data: missionRows, error: insErr } = await supabase
    .from('mc_missions')
    .insert([
      {
        title:
          channel === 'discord'
            ? `Straggler DM sent · ${userId.slice(0, 8)}…`
            : `Straggler DM logged (email) · ${userId.slice(0, 8)}…`,
        signal_source: userSignal,
        mission_type: 'straggler',
        lane: 'shipped',
        owner: actor,
        notes: noteLines.join('\n'),
      },
    ])
    .select('id')
  if (insErr) {
    console.error('[mc-api] mc_missions audit insert failed:', insErr)
  }
  const missionId = missionRows?.[0]?.id ?? null

  // mc_events row — first real consumer of the v0.5.0 spine. Structured
  // payload so future "show me every DM I sent in May" queries hit a
  // gin index instead of LIKE-scanning notes.
  await emitEvent({
    missionId,
    eventType: 'straggler.dm_sent',
    actor,
    payload: {
      userId,
      channel,
      tone: tone || null,
      discordMessageId: messageId || null,
      discordError: discordError || null,
      messageLength: message.length,
    },
  })

  return res.json({ success: true, userId, channel, messageId })
})

export default router
