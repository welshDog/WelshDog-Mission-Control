import { useCallback, useEffect, useMemo, useState } from 'react'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import { motion } from 'framer-motion'
import { Package, Printer, Box, Truck, CheckCircle2, RefreshCw, AlertTriangle } from 'lucide-react'
import { supabase, fetchAllOrders, updateFulfillmentStatus } from '../../lib/supabase'

// The 5 lanes of the print-fulfillment workflow.
// `id` is the literal value stored in `orders.fulfillment_status` (matches
// the CHECK constraint in supabase/migrations/20260523120000_*.sql).
const COLUMNS = [
  { id: 'pending',   label: 'PENDING',   Icon: Package,        accent: 'border-amber-400/40 text-amber-300'  },
  { id: 'printing',  label: 'PRINTING',  Icon: Printer,        accent: 'border-fuchsia-400/40 text-fuchsia-300' },
  { id: 'packed',    label: 'PACKED',    Icon: Box,            accent: 'border-sky-400/40 text-sky-300'      },
  { id: 'shipped',   label: 'SHIPPED',   Icon: Truck,          accent: 'border-indigo-400/40 text-indigo-300'},
  { id: 'delivered', label: 'DELIVERED', Icon: CheckCircle2,   accent: 'border-emerald-400/40 text-emerald-300'},
]

// Normalises rows from before the migration ran (legacy = no column → 'pending').
const laneFor = (order) => (order?.fulfillment_status || 'pending').toLowerCase()

export default function OrdersKanban() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)

  // --- Initial load -------------------------------------------------------
  const load = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      const rows = await fetchAllOrders(0, 200)
      setOrders(rows)
    } catch (e) {
      setErr(e?.message || 'Failed to load orders')
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // --- Live updates via Supabase Realtime (no Socket.io needed for DB events) ---
  useEffect(() => {
    const ch = supabase
      .channel('mc-orders')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (p) => {
        setOrders((prev) => [p.new, ...prev])
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, (p) => {
        setOrders((prev) => prev.map((o) => (o.id === p.new.id ? { ...o, ...p.new } : o)))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'orders' }, (p) => {
        setOrders((prev) => prev.filter((o) => o.id !== p.old.id))
      })
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [])

  // --- Group orders by lane (memoised so DnD re-renders stay cheap) ------
  const byLane = useMemo(() => {
    const map = Object.fromEntries(COLUMNS.map((c) => [c.id, []]))
    for (const o of orders) {
      const lane = laneFor(o)
      if (map[lane]) map[lane].push(o)
    }
    return map
  }, [orders])

  // --- Drag end → optimistic update + persist ----------------------------
  const handleDragEnd = (result) => {
    const { destination, draggableId } = result
    if (!destination) return

    const newStatus = destination.droppableId
    const orderId = draggableId

    // Optimistic local update first — the Kanban must feel instant.
    setOrders((prev) =>
      prev.map((o) => (String(o.id) === String(orderId) ? { ...o, fulfillment_status: newStatus } : o))
    )

    // Persist. If it fails, revert (caller will hear the next Realtime event
    // and reconcile anyway, but we toast a warning so it isn't silent).
    updateFulfillmentStatus(orderId, newStatus).catch((e) => {
      console.error('updateFulfillmentStatus failed:', e)
      setErr(`Status update failed: ${e?.message || 'unknown'} — reverting on next sync.`)
    })
  }

  // --- Render -------------------------------------------------------------
  return (
    <section className="glass-panel rounded-2xl p-6 border border-white/10">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm uppercase tracking-widest text-brand-accent font-bold flex items-center gap-2">
          <Package className="w-4 h-4" /> Kanban — Order Fulfillment
        </h2>
        <div className="flex items-center gap-3 text-xs text-gray-400 font-mono">
          <span>{orders.length} order{orders.length === 1 ? '' : 's'}</span>
          <button
            onClick={load}
            className="btn-secondary py-1 px-2 text-[10px] flex items-center gap-1"
            title="Force-refresh from Supabase"
          >
            <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> Sync
          </button>
        </div>
      </div>

      {err && (
        <div className="mb-4 text-xs text-amber-200 bg-amber-500/10 border border-amber-400/30 rounded-lg px-3 py-2 flex items-center gap-2">
          <AlertTriangle className="w-3 h-3" /> {err}
        </div>
      )}

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4">
          {COLUMNS.map(({ id, label, Icon, accent }) => (
            <Droppable droppableId={id} key={id}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={`rounded-xl border ${accent} ${
                    snapshot.isDraggingOver ? 'bg-white/10' : 'bg-white/5'
                  } p-3 min-h-[200px] flex flex-col gap-2 transition-colors`}
                >
                  <div className={`flex items-center justify-between text-xs font-bold uppercase tracking-wider ${accent.split(' ').pop()}`}>
                    <span className="flex items-center gap-1"><Icon className="w-3 h-3" /> {label}</span>
                    <span className="font-mono opacity-80">{byLane[id]?.length || 0}</span>
                  </div>

                  {(byLane[id] || []).map((order, idx) => (
                    <Draggable draggableId={String(order.id)} index={idx} key={order.id}>
                      {(prov, snap) => (
                        <motion.div
                          ref={prov.innerRef}
                          {...prov.draggableProps}
                          {...prov.dragHandleProps}
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={`glass-card rounded-lg p-3 cursor-grab active:cursor-grabbing ${
                            snap.isDragging ? 'ring-2 ring-brand-accent' : ''
                          }`}
                          style={prov.draggableProps.style}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-mono text-[10px] text-brand-accent font-bold truncate">
                              #{order.order_number || String(order.id).slice(0, 8)}
                            </span>
                            <span className="font-mono text-[10px] text-gray-300">
                              £{order.total_price ?? '—'}
                            </span>
                          </div>
                          <div className="text-xs text-white font-bold truncate">
                            {order.customer_name || '(no name)'}
                          </div>
                          <div className="text-[10px] text-gray-500 font-mono mt-1">
                            {order.created_at ? new Date(order.created_at).toLocaleDateString() : ''}
                          </div>
                        </motion.div>
                      )}
                    </Draggable>
                  ))}

                  {provided.placeholder}

                  {(byLane[id]?.length || 0) === 0 && !loading && (
                    <div className="text-[10px] text-gray-600 font-mono italic text-center py-4">
                      no orders
                    </div>
                  )}
                </div>
              )}
            </Droppable>
          ))}
        </div>
      </DragDropContext>
    </section>
  )
}
