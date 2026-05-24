import { useCallback, useEffect, useMemo, useState } from 'react'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import { motion } from 'framer-motion'
import { Search, Eye, Wrench, CheckCircle2, RefreshCw, AlertTriangle, Trash2, Plus } from 'lucide-react'
import { supabase, fetchMissions, updateMissionLane, deleteMission, createMission } from '../../lib/supabase'

// The 4 lanes — match the CHECK constraint on `mc_missions.lane`.
const COLUMNS = [
  { id: 'detected',      label: 'DETECTED',      Icon: Search,        accent: 'border-amber-400/40 text-amber-300' },
  { id: 'investigating', label: 'INVESTIGATING', Icon: Eye,           accent: 'border-sky-400/40 text-sky-300' },
  { id: 'fixing',        label: 'FIXING',        Icon: Wrench,        accent: 'border-fuchsia-400/40 text-fuchsia-300' },
  { id: 'shipped',       label: 'SHIPPED',       Icon: CheckCircle2,  accent: 'border-emerald-400/40 text-emerald-300' },
]

export default function MissionsKanban() {
  const [missions, setMissions] = useState([])
  const [loading, setLoading]   = useState(true)
  const [err, setErr]           = useState(null)

  // --- Initial load ------------------------------------------------------
  const load = useCallback(async () => {
    setLoading(true); setErr(null)
    try {
      setMissions(await fetchMissions(200))
    } catch (e) {
      setErr(e?.message || 'Failed to load missions')
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // --- Live updates via Supabase Realtime --------------------------------
  useEffect(() => {
    const ch = supabase
      .channel('mc-missions-kanban')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mc_missions' }, (p) => {
        setMissions((prev) => [p.new, ...prev])
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'mc_missions' }, (p) => {
        setMissions((prev) => prev.map((m) => (m.id === p.new.id ? { ...m, ...p.new } : m)))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'mc_missions' }, (p) => {
        setMissions((prev) => prev.filter((m) => m.id !== p.old.id))
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  // --- Group by lane (memoised) -----------------------------------------
  const byLane = useMemo(() => {
    const map = Object.fromEntries(COLUMNS.map((c) => [c.id, []]))
    for (const m of missions) {
      if (map[m.lane]) map[m.lane].push(m)
    }
    return map
  }, [missions])

  // --- Drag end → optimistic + persist ----------------------------------
  const handleDragEnd = (result) => {
    const { destination, draggableId } = result
    if (!destination) return
    const newLane = destination.droppableId

    setMissions((prev) =>
      prev.map((m) => (String(m.id) === String(draggableId) ? { ...m, lane: newLane } : m))
    )

    updateMissionLane(draggableId, newLane).catch((e) => {
      console.error('updateMissionLane failed:', e)
      setErr(`Lane update failed: ${e?.message || 'unknown'} — reverting on next sync.`)
    })
  }

  const handleManualCreate = async () => {
    const title = window.prompt('New mission title?')
    if (!title) return
    try {
      await createMission({ title, signal_source: 'manual' })
    } catch (e) {
      setErr(`createMission failed: ${e?.message || 'unknown'}`)
    }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this mission? It is removed from history.')) return
    try {
      await deleteMission(id)
    } catch (e) {
      setErr(`deleteMission failed: ${e?.message || 'unknown'}`)
    }
  }

  // --- Render -----------------------------------------------------------
  return (
    <section className="glass-panel rounded-2xl p-6 border border-white/10">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-x-4 gap-y-2">
        <h2 className="text-sm uppercase tracking-widest text-brand-accent font-bold flex items-center gap-2">
          <Search className="w-4 h-4" /> Missions — Course Ops
        </h2>
        <div className="flex items-center gap-3 text-xs text-gray-400 font-mono">
          <span className="mr-1">{missions.length} mission{missions.length === 1 ? '' : 's'}</span>
          <button
            onClick={handleManualCreate}
            className="btn-secondary py-1 px-2 text-[10px] flex items-center gap-1"
            title="Manually add a mission"
          >
            <Plus className="w-3 h-3" /> New
          </button>
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
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5 md:gap-6">
          {COLUMNS.map(({ id, label, Icon, accent }) => (
            <Droppable droppableId={id} key={id}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={`rounded-xl border ${accent} ${
                    snapshot.isDraggingOver ? 'bg-white/10' : 'bg-white/5'
                  } p-4 min-h-[200px] flex flex-col gap-2 transition-colors`}
                >
                  <div className={`flex items-center justify-between gap-3 pb-2 mb-1 border-b border-white/5 text-xs font-bold uppercase tracking-wider ${accent.split(' ').pop()}`}>
                    <span className="flex items-center gap-1.5 min-w-0 truncate"><Icon className="w-3 h-3 shrink-0" /> {label}</span>
                    <span className="font-mono opacity-80 shrink-0">{byLane[id]?.length || 0}</span>
                  </div>

                  {(byLane[id] || []).map((m, idx) => (
                    <Draggable draggableId={String(m.id)} index={idx} key={m.id}>
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
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <span className="text-xs text-white font-bold leading-snug flex-1">{m.title}</span>
                            <button
                              onClick={() => handleDelete(m.id)}
                              className="text-gray-600 hover:text-rose-300 transition-colors shrink-0"
                              title="Delete mission"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                          <div className="text-[10px] text-gray-500 font-mono truncate" title={m.signal_source}>
                            {m.signal_source}
                          </div>
                          {m.notes && (
                            <div className="text-[10px] text-gray-400 mt-1 line-clamp-2">{m.notes}</div>
                          )}
                          <div className="text-[10px] text-gray-600 font-mono mt-1">
                            {m.created_at ? new Date(m.created_at).toLocaleString() : ''}
                          </div>
                        </motion.div>
                      )}
                    </Draggable>
                  ))}

                  {provided.placeholder}

                  {(byLane[id]?.length || 0) === 0 && !loading && (
                    <div className="text-[10px] text-gray-600 font-mono italic text-center py-4">
                      no missions
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
