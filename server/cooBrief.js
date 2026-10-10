// cooBrief.js — cached, fail-soft client for broski-coo's POST /brief.
//
// Extracted from server/index.js so the timeout / cache / fallback paths are
// unit-testable with an injected fetch and clock. No module-level state: each
// client owns its own cache.
//
// CACHE SEMANTICS (pinned by src/__tests__/cooBrief.test.js)
//   - No key       → { status:'unconfigured' }, no network call, never cached.
//   - Success      → cached for ttlMs (default 10 min). Each /brief is an LLM
//                    call upstream.
//   - Any failure  → { status:'offline', error } cached for failTtlMs
//                    (default 60 s) so a downed COO doesn't stall every
//                    refresh for the full timeout.
//   - Expiry is strict: a value is served only while age < ttl.
//   - NO request coalescing: two concurrent cold calls each hit upstream.
//     The cache is written after the await. Acceptable for a single-operator
//     admin panel; revisit if this ever fans out.
//
// The returned brief is ADVISORY TEXT ONLY. Callers must never feed it into
// ranking (see rankMoves in src/lib/nextMove.js).

export const DEFAULT_TTL_MS = 10 * 60 * 1000
export const DEFAULT_FAIL_TTL_MS = 60_000
export const DEFAULT_TIMEOUT_MS = 20_000
export const MAX_BRIEF_CHARS = 4000

export function createCooBriefClient({
  url = 'http://localhost:8025',
  key,
  fetchImpl = globalThis.fetch,
  now = Date.now,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  ttlMs = DEFAULT_TTL_MS,
  failTtlMs = DEFAULT_FAIL_TTL_MS,
} = {}) {
  const base = String(url).replace(/\/$/, '')
  let cache = { at: 0, value: null }

  return async function fetchCooBrief() {
    if (!key) return { status: 'unconfigured', brief: null }

    const age = now() - cache.at
    if (cache.value && age < (cache.value.status === 'ok' ? ttlMs : failTtlMs)) {
      return cache.value
    }

    let value
    // AbortController + setTimeout (not AbortSignal.timeout) so tests can
    // drive the timeout with fake timers.
    const controller = new AbortController()
    const timer = setTimeout(
      () => controller.abort(new DOMException('COO brief timed out', 'TimeoutError')),
      timeoutMs,
    )
    try {
      const r = await fetchImpl(`${base}/brief`, {
        method: 'POST',
        headers: { 'x-agent-key': key },
        signal: controller.signal,
      })
      if (!r.ok) throw new Error(`coo_${r.status}`)
      const j = await r.json()
      value = {
        status: 'ok',
        brief: typeof j?.brief === 'string' ? j.brief.slice(0, MAX_BRIEF_CHARS) : null,
        generatedAt: j?.generated_at ?? null,
      }
    } catch (e) {
      value = { status: 'offline', brief: null, error: e?.name === 'TimeoutError' ? 'timeout' : 'unreachable' }
    } finally {
      clearTimeout(timer)
    }
    cache = { at: now(), value }
    return value
  }
}
