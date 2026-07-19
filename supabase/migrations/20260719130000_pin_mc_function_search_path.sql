-- Pin search_path on the Mission Control helper functions.
--
-- WHY: Supabase's security linter flags function_search_path_mutable on
--   public.touch_mc_missions_updated_at and public.mc_events_block_mutations
--   (created by the earlier MC migrations). A mutable search_path is a small
--   privilege-escalation surface. Neither function references unqualified
--   user-schema objects (only NEW/OLD and pg_catalog's now()), so an EMPTY
--   search_path is safe and is Supabase's recommended remediation.
--
-- ORDERING: runs after 20260523130000 (creates touch_mc_missions_updated_at)
--   and 20260524000000 (creates mc_events_block_mutations). Guarded so it is a
--   no-op if a function is not present yet, and idempotent on re-run.
-- Applied to tlav (the Course project, where the mc_* objects live) via MCP 2026-07-19.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname='public' AND p.proname='touch_mc_missions_updated_at') THEN
    ALTER FUNCTION public.touch_mc_missions_updated_at() SET search_path = '';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname='public' AND p.proname='mc_events_block_mutations') THEN
    ALTER FUNCTION public.mc_events_block_mutations() SET search_path = '';
  END IF;
END $$;
