-- Mission Control — `mc_events` spine + `mc_missions` schema bump.
--
-- WHY
--   `mc_missions` doubles as state + history right now (signal_source
--   carries userId etc. as a workaround). Splitting state vs history
--   unlocks: Live Activity feed (just SELECT FROM mc_events ORDER BY
--   created_at DESC), real audit trails for Grant Tokens / Refund /
--   Catch Stragglers, actor attribution, and replay.
--
-- TWO THINGS HAPPEN IN ONE MIGRATION:
--   1. Create public.mc_events — append-only event log (immutable via
--      triggers; INSERT restricted to service_role so a compromised
--      client session cannot inject fake audit rows).
--   2. ALTER public.mc_missions ADD owner + priority — so the Kanban
--      can render ownership + p0..p3 chips (was previously just title +
--      lane). Both nullable so existing rows survive untouched.
--
-- TARGET: project `yhtmuibgdnxhbgboajhc` (Vibe Coding Course Supabase —
--   same project Mission Control reads/writes).
-- APPLY VIA: Supabase MCP `apply_migration` (NEVER `supabase db push`
--   — local migration filenames are desynced from remote
--   schema_migrations).

-- ═════════════════════════════════════════════════════════════════════
-- 1. mc_events — append-only audit + activity spine
-- ═════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema = 'public' AND table_name = 'mc_events') THEN
    CREATE TABLE public.mc_events (
      id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      mission_id  uuid REFERENCES public.mc_missions(id) ON DELETE SET NULL,
      event_type  text NOT NULL,                       -- e.g. 'mission.created', 'lane.changed', 'straggler.dm_sent', 'tokens.granted', 'refund.issued', 'health_pulse.ran'
      actor       text,                                 -- admin email (or 'system' for autonomous actions)
      payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at  timestamptz NOT NULL DEFAULT now()
    );
  END IF;
END $$;

-- Immutability: block UPDATE + DELETE at the DB layer. Even a
-- service-role caller cannot quietly rewrite history; corrections are
-- recorded by INSERTing a new event (event_type = '*.corrected' or
-- similar). TRUNCATE remains available for explicit ops resets.
CREATE OR REPLACE FUNCTION public.mc_events_block_mutations()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'mc_events is append-only — INSERT a correcting event instead of mutating existing rows';
END $$;

DROP TRIGGER IF EXISTS mc_events_no_update ON public.mc_events;
CREATE TRIGGER mc_events_no_update
  BEFORE UPDATE ON public.mc_events
  FOR EACH ROW EXECUTE FUNCTION public.mc_events_block_mutations();

DROP TRIGGER IF EXISTS mc_events_no_delete ON public.mc_events;
CREATE TRIGGER mc_events_no_delete
  BEFORE DELETE ON public.mc_events
  FOR EACH ROW EXECUTE FUNCTION public.mc_events_block_mutations();

-- Indexes for the two dominant access patterns:
--   1. Activity feed       — ORDER BY created_at DESC LIMIT 50
--   2. Mission detail drawer — WHERE mission_id = ? ORDER BY created_at
--   3. Filter by event_type  — WHERE event_type = 'refund.issued'
--   4. Future: filter by payload.user_id — gin on jsonb
CREATE INDEX IF NOT EXISTS idx_mc_events_created_at ON public.mc_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mc_events_mission_id ON public.mc_events (mission_id, created_at DESC) WHERE mission_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mc_events_event_type ON public.mc_events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mc_events_payload    ON public.mc_events USING gin (payload);

-- Realtime: Live Activity feed subscribes via supabase-js realtime.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'mc_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.mc_events;
  END IF;
END $$;

-- RLS — RESTRICTIVE BY DESIGN:
--   * SELECT: any authenticated user (defence in depth — AdminAuth
--     allowlist already gates the app client-side; tighten to an
--     is_admin() helper in a future hardening commit).
--   * INSERT: NO authenticated policy. Only service_role (the MC
--     Express server) writes events. Service_role bypasses RLS, so
--     no policy is needed; the absence of an INSERT policy is the
--     security control. This prevents a compromised browser session
--     from injecting `actor = 'lyndzwills@gmail.com'` audit lies.
--   * UPDATE / DELETE: blocked by triggers above regardless of role.
ALTER TABLE public.mc_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mc_events_authed_read ON public.mc_events;
CREATE POLICY mc_events_authed_read
  ON public.mc_events
  FOR SELECT
  TO authenticated
  USING (true);

-- ═════════════════════════════════════════════════════════════════════
-- 2. mc_missions — owner + priority columns
-- ═════════════════════════════════════════════════════════════════════
-- Both nullable so existing rows survive untouched. `owner` is a free-
-- form text field (email for now; later may become a uuid → users.id
-- once mission ownership UX firms up). `priority` is a constrained
-- enum-by-CHECK so the Kanban can colour-code rows reliably.
ALTER TABLE public.mc_missions
  ADD COLUMN IF NOT EXISTS owner    text,
  ADD COLUMN IF NOT EXISTS priority text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mc_missions_priority_check') THEN
    ALTER TABLE public.mc_missions
      ADD CONSTRAINT mc_missions_priority_check
      CHECK (priority IS NULL OR priority IN ('p0', 'p1', 'p2', 'p3'));
  END IF;
END $$;

-- Partial indexes — only index rows where the column is set so the
-- index stays small while existing un-owned/un-prioritised rows don't
-- consume space.
CREATE INDEX IF NOT EXISTS idx_mc_missions_priority ON public.mc_missions (priority)
  WHERE priority IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mc_missions_owner    ON public.mc_missions (owner)
  WHERE owner    IS NOT NULL;
