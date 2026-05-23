// supabase.js — single Supabase client for Mission Control.
// Points at the SAME project as welshdog-designs-web3-shop (orders, products,
// drops, settings, demo_bookings). Mission Control is read-mostly + status writes.
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // Log only — let the app render the env-missing banner rather than crashing
  // before the auth gate can explain.
  // eslint-disable-next-line no-console
  console.error('⚠️ Supabase credentials missing — set VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY in .env.local')
}

export const supabase = createClient(SUPABASE_URL ?? '', SUPABASE_ANON_KEY ?? '')

// --- Orders (the Kanban data source) ---

export const fetchAllOrders = async (page = 0, limit = 50) => {
  const start = page * limit
  const end = start + limit - 1
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false })
    .range(start, end)
  if (error) console.error('Error fetching orders:', error)
  return data || []
}

export const updateOrderStatus = async (orderId, status) => {
  const { data, error } = await supabase
    .from('orders')
    .update({ payment_status: status, updated_at: new Date() })
    .eq('id', orderId)
    .select()
  if (error) console.error('Error updating order:', error)
  return data?.[0] || null
}

// Mission Control: the Kanban writes here. Requires the
// supabase/migrations/20260523120000_*.sql migration to have been applied.
export const updateFulfillmentStatus = async (orderId, fulfillment_status) => {
  const { data, error } = await supabase
    .from('orders')
    .update({ fulfillment_status, updated_at: new Date() })
    .eq('id', orderId)
    .select()
  if (error) {
    console.error('Error updating fulfillment_status:', error)
    throw error
  }
  return data?.[0] || null
}

// --- Settings (top-bar feature flags) ---

export const fetchShopSettings = async () => {
  const { data, error } = await supabase
    .from('settings')
    .select('*')
    .single()
  if (error && error.code !== 'PGRST116') console.error('Error fetching settings:', error)
  return data || { payments_enabled: true, catalog_mode: false }
}

// --- Demo bookings (right-sidebar ticker source) ---

export const fetchDemoBookings = async () => {
  const { data, error } = await supabase
    .from('demo_bookings')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) {
    console.error('Error fetching demo bookings:', error)
    return []
  }
  return data || []
}
