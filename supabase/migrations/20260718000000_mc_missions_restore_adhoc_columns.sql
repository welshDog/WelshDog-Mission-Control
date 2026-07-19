-- Mission Control — restore columns that only ever existed as ad-hoc MCP
-- migrations, never as files.
--
-- WHY THIS EXISTS
--   The deleted project `yhtmuibgdnxhbgboajhc` was built partly from the two
--   migration files in this folder and partly from inline `apply_migration`
--   calls that were never saved to disk (see WHATS_DONE v0.6.0:
--   "add_mc_missions_signal_source_lane_title_notes"). The result: the file
--   migrations are an INCOMPLETE reconstruction of the live schema.
--
--   Specifically `mission_type` — which `src/lib/supabase.js` documents as
--   NOT NULL on the live schema and which EVERY insert path sends:
--     * createMission()            (client, +New button)
--     * Health Pulse               (mission_type: 'health_pulse')
--     * Catch Stragglers           (mission_type: 'straggler')
--     * Grant Tokens audit card    (mission_type: 'grant_tokens')
--     * Refund audit card          (mission_type: 'refund')
--
--   Without this migration, applying only the two originals gives you a
--   mc_missions table with no mission_type column, and every one of those
--   paths fails with:
--     column "mission_type" of relation "mc_missions" does not exist
--
--   That surfaces at smoke-test time, long after the env-var work, and looks
--   like an auth or RLS problem. It isn't.
--
-- DIFFERENCE FROM THE ORIGINAL LIVE SCHEMA
--   `mission_type` is recreated with a DEFAULT of 'manual'. The old column was
--   NOT NULL with no default, which is what made the "phantom column" bug bite
--   (inserts that omitted it failed silently). The default makes omission safe
--   while keeping the NOT NULL guarantee.
--
--   The other four columns (trigger_source, user_id, status, metadata) are
--   legacy from the v0.2/v0.3 shop-era schema. Current code does not write
--   them, but they're documented in WHATS_DONE as part of the live schema, so
--   they're restored nullable — harmless, and covers any path not spotted.
--
-- ORDERING
--   Fully idempotent and safe to re-run any number of times — but it ALTERs
--   public.mc_missions, so it MUST run after 20260523130000 (which creates the
--   table). Order vs 20260524000000 doesn't matter. Filename order
--   (0523 → 0524 → 0718) is already correct; just don't paste this one first
--   on a clean project. The precondition check below fails loudly if you do.
--
-- APPLY VIA: Supabase MCP `apply_migration` — NEVER `supabase db push`.

-- ═════════════════════════════════════════════════════════════════════
-- 0. Precondition — fail with a useful message, not `relation does not exist`
-- ═════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema = 'public' AND table_name = 'mc_missions') THEN
    RAISE EXCEPTION
      'mc_missions does not exist — apply 20260523130000_create_mc_missions_table.sql first, then re-run this file';
  END IF;
END $$;

-- ═════════════════════════════════════════════════════════════════════
-- 1. mission_type — the one that actually breaks things
-- ═════════════════════════════════════════════════════════════════════
ALTER TABLE public.mc_missions
  ADD COLUMN IF NOT EXISTS mission_type text;

-- Backfill any pre-existing rows before enforcing NOT NULL.
UPDATE public.mc_missions SET mission_type = 'manual' WHERE mission_type IS NULL;

DO $$
BEGIN
  -- Default first, so inserts omitting the column succeed.
  ALTER TABLE public.mc_missions ALTER COLUMN mission_type SET DEFAULT 'manual';

  -- Then NOT NULL — only if it isn't already.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'mc_missions'
      AND column_name = 'mission_type' AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE public.mc_missions ALTER COLUMN mission_type SET NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_mc_missions_mission_type
  ON public.mc_missions (mission_type);

-- ═════════════════════════════════════════════════════════════════════
-- 2. Legacy columns — restored nullable for parity with the old schema
-- ═════════════════════════════════════════════════════════════════════
ALTER TABLE public.mc_missions
  ADD COLUMN IF NOT EXISTS trigger_source text,
  ADD COLUMN IF NOT EXISTS user_id        uuid,
  ADD COLUMN IF NOT EXISTS status         text,
  ADD COLUMN IF NOT EXISTS metadata       jsonb DEFAULT '{}'::jsonb;

-- ═════════════════════════════════════════════════════════════════════
-- 3. Verify — should return all 5 rows
-- ═════════════════════════════════════════════════════════════════════
-- select column_name, data_type, is_nullable, column_default
-- from information_schema.columns
-- where table_schema='public' and table_name='mc_missions'
--   and column_name in ('mission_type','trigger_source','user_id','status','metadata')
-- order by column_name;
