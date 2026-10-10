import { createRateLimiter } from '../rateLimit.js'
import '../config.js' // dotenv must run before limits read env

// ── Per-admin rate limits (see server/rateLimit.js) ─────────────────
// Money-moving routes are tight so a stolen admin token can't drain quickly;
// previews are looser because operators look up several items in a row.
// send-dm sits well above Catch Stragglers' bulk batch (20 drafts) and uses a
// distinct error code so the UI doesn't confuse it with the 24h per-user rule.
const mkLimit = (name, envKey, dflt, windowMs, errorCode) =>
  createRateLimiter({ name, limit: Number(process.env[envKey]) || dflt, windowMs, errorCode })
export const refundPreviewLimit = mkLimit('refund_preview', 'REFUND_PREVIEW_MAX_PER_MIN', 30, 60 * 1000)
export const refundCommitLimit = mkLimit('refund', 'REFUND_MAX_PER_10MIN', 5, 10 * 60 * 1000)
export const grantPreviewLimit = mkLimit('grant_preview', 'GRANT_PREVIEW_MAX_PER_MIN', 30, 60 * 1000)
export const grantCommitLimit = mkLimit('grant', 'GRANT_MAX_PER_10MIN', 10, 10 * 60 * 1000)
export const sendDmLimit = mkLimit('send_dm', 'SEND_DM_MAX_PER_10MIN', 40, 10 * 60 * 1000, 'admin_rate_limited')
