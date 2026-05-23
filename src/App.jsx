import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import MissionControl from './pages/MissionControl'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MissionControl />} />
        {/* Future: tenant-scoped routes — /welshdog, /course */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
