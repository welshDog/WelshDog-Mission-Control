-- Mission Control — Kanban fulfillment workflow on orders.
--
-- Adds an idempotent `fulfillment_status` column to `public.orders` so the
-- Mission Control Kanban can render lanes: pending → printing → packed →
-- shipped → delivered. Existing rows default to 'pending'.
--
-- SACRED RULE: apply via Supabase MCP `apply_migration` — NEVER
-- `supabase db push` (the shop repo's local migration history is desynced
-- from the remote `schema_migrations`).

-- 1. Column + check constraint (idempotent: re-applying is a no-op).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders'
      AND column_name = 'fulfillment_status'
  ) THEN
    ALTER TABLE public.orders
      ADD COLUMN fulfillment_status text NOT NULL DEFAULT 'pending';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_fulfillment_status_check'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_fulfillment_status_check
      CHECK (fulfillment_status IN ('pending', 'printing', 'packed', 'shipped', 'delivered'));
  END IF;
END $$;

-- 2. Index for the Kanban's grouped queries.
CREATE INDEX IF NOT EXISTS idx_orders_fulfillment_status
  ON public.orders (fulfillment_status);

-- 3. Ensure orders + demo_bookings are in the Realtime publication so the
--    activity ticker + Kanban hear DB changes live.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'demo_bookings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.demo_bookings;
  END IF;
END $$;
