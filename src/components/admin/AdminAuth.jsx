import { useState } from 'react'
import { motion } from 'framer-motion'
import { Lock, ShieldCheck } from 'lucide-react'
import { supabase } from '../../lib/supabase'

// Copied from welshdog-designs-web3-shop@src/components/admin/AdminAuth.jsx.
// Same Supabase project, same `check-admin` edge function, same fallback
// allowlist — so an admin who can log into the shop can log into Mission
// Control without any extra setup.
//
// Next-commit upgrade: surface Supabase's native TOTP MFA challenge here
// instead of bolting on Passport.js (Sacred Rule: don't double-build auth).
export default function AdminAuth({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { data: { session }, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError('Access denied: ' + error.message)
    } else if (session) {
      try {
        const { data: adminData, error: funcError } = await supabase.functions.invoke('check-admin', {
          headers: { Authorization: `Bearer ${session.access_token}` }
        })

        if (funcError) {
          console.warn('Edge function check error, falling back to client check:', funcError)

          const ALLOWED_ADMINS = ['admin@welsdogdesigns.com', 'lyndz@welsdogdesigns.com', 'lyndzwills@gmail.com']
          if (ALLOWED_ADMINS.includes(email.toLowerCase())) {
            if (typeof window !== 'undefined') {
              window.localStorage.setItem('adminVerification', JSON.stringify({ via: 'fallback', email }))
            }
            if (onLogin) onLogin()
          } else {
            await supabase.auth.signOut()
            setError('Unauthorized: You are not an admin.')
          }
        } else if (adminData?.isAdmin) {
          if (typeof window !== 'undefined') {
            window.localStorage.setItem('adminVerification', JSON.stringify({ via: 'edge', email: adminData.email || email }))
          }
          if (onLogin) onLogin()
        } else {
          await supabase.auth.signOut()
          setError('Unauthorized: You are not an admin.')
        }
      } catch (err) {
        console.error('Auth verification error:', err)
        setError('Security check failed. Please try again or contact support.')
      }
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen pt-32 pb-20 px-4 flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md w-full glass-panel p-8 rounded-2xl border border-white/10 text-center relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-brand-accent via-white to-brand-pink"></div>

        <div className="w-16 h-16 bg-brand-accent/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <Lock className="w-8 h-8 text-brand-accent" />
        </div>

        <h2 className="text-2xl font-black text-white mb-2">Restricted Access</h2>
        <p className="text-gray-400 mb-8 text-sm">Security clearance required for Mission Control.</p>

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="relative space-y-3">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Admin Email"
              className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-white font-mono focus:border-brand-accent focus:outline-none transition-all"
              required
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-white font-mono focus:border-brand-accent focus:outline-none transition-all"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full btn-primary py-4 font-bold flex items-center justify-center gap-2 group disabled:opacity-50"
          >
            <ShieldCheck className="w-5 h-5" /> {loading ? 'Authenticating...' : 'Authenticate'}
          </button>
        </form>
        {error && (
          <div className="mt-4 text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 text-left">
            {error}
          </div>
        )}

        <div className="mt-6 text-[10px] text-gray-600 font-mono uppercase tracking-widest">
          System ID: WDD-MISSION-CONTROL
        </div>
      </motion.div>
    </div>
  )
}
