// server/app.js — builds the Express app: CORS, body parsing, request log, routers.
// Route order is preserved from the original single-file server.
import express from 'express'
import cors from 'cors'
import './config.js'
import healthRouter from './routes/health.js'
import activityRouter from './routes/activity.js'
import sendDmRouter from './routes/sendDm.js'
import grantTokensRouter from './routes/grantTokens.js'
import refundRouter from './routes/refund.js'
import nextMoveRouter from './routes/nextMove.js'
import metricsRouter from './routes/metrics.js'

// ── Express app ───────────────────────────────────────────────────────
export const app = express()

// CORS: explicit allowlist (defence in depth — same Supabase + admin
// allowlist already protect the data layer, but no reason to be loose).
export const corsAllowlist = new Set(
  (process.env.API_CORS_ORIGINS || 'http://localhost:5174')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
)
app.use(
  cors({
    origin: (origin, cb) => {
      // Allow same-origin / curl (no Origin header) + the allowlist.
      if (!origin || corsAllowlist.has(origin)) return cb(null, true)
      return cb(new Error(`Origin ${origin} not in CORS allowlist`))
    },
    methods: ['GET', 'POST', 'OPTIONS'],
  }),
)
app.use(express.json({ limit: '64kb' }))

// Lightweight request log (no body — message text might be sensitive).
app.use((req, _res, next) => {
  console.log(`[mc-api] ${req.method} ${req.path}`)
  next()
})

app.use(healthRouter)
app.use(activityRouter)
app.use(sendDmRouter)
app.use(grantTokensRouter)
app.use(refundRouter)
app.use(nextMoveRouter)
app.use(metricsRouter)
