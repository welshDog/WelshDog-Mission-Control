-- Mission Control — `mc_missions` table for the course-ops Kanban.
--
-- Each row is one mission card. Missions are AUTO-CREATED by the Agent
-- Actions panel (Health Pulse, Drift Scan, etc.) when signals trip — but
-- can also be created manually. Lyndz drags cards across lanes as work
-- progresses; the `resolved_at` timestamp is set when a card hits
-- `shipped`.
--
-- SACRED RULE: apply via Supabase MCP `apply_migration` against the
-- Vibe Coding Course project (yhtmuibgdnxhbgboajhc) — NEVER `supabase db
-- push` (the course repo's local migration filenames are desynced).

-- 1. Table + check constraint (idempotent).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema = 'public' AND table_name = 'mc_missions') THEN
    CREATE TABLE public.mc_missions (
      id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      title         text NOT NULL,
      signal_source text NOT NULL,                          -- e.g. 'health_pulse:stuck_students', 'manual', 'morning_brief'
      lane          text NOT NULL DEFAULT 'detected',
      notes         text,
      created_at    timestamptz NOT NULL DEFAULT now(),
      updated_at    timestamptz NOT NULL DEFAULT now(),
      resolved_at   timestamptz
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mc_missions_lane_check') THEN
    ALTER TABLE public.mc_missions
      ADD CONSTRAINT mc_missions_lane_check
      CHECK (lane IN ('detected', 'investigating', 'fixing', 'shipped'));
  END IF;
END $$;

-- 2. Indexes for the Kanban's grouped queries + recency feed.
CREATE INDEX IF NOT EXISTS idx_mc_missions_lane       ON public.mc_missions (lane);
CREATE INDEX IF NOT EXISTS idx_mc_missions_created_at ON public.mc_missions (created_at DESC);

-- 3. Auto-touch `updated_at` on every row update.
CREATE OR REPLACE FUNCTION public.touch_mc_missions_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  -- Auto-stamp resolved_at when a card lands in 'shipped'.
  IF NEW.lane = 'shipped' AND OLD.lane <> 'shipped' THEN
    NEW.resolved_at = now();
  END IF;
  -- Clear resolved_at if a card is pulled back out of 'shipped'.
  IF NEW.lane <> 'shipped' AND OLD.lane = 'shipped' THEN
    NEW.resolved_at = NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS mc_missions_touch_updated_at ON public.mc_missions;
CREATE TRIGGER mc_missions_touch_updated_at
  BEFORE UPDATE ON public.mc_missions
  FOR EACH ROW EXECUTE FUNCTION public.touch_mc_missions_updated_at();

-- 4. Realtime publication — Mission Control subscribes to live changes.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'mc_missions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.mc_missions;
  END IF;
END $$;

-- 5. RLS — authenticated-only for now. Harden to admin-only via is_admin()
--    wrapper in a follow-up commit (Mission Control is gated behind the
--    AdminAuth allowlist client-side; this is defence in depth).
ALTER TABLE public.mc_missions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS mc_missions_authed_all ON public.mc_missions;
CREATE POLICY mc_missions_authed_all
  ON public.mc_missions
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
