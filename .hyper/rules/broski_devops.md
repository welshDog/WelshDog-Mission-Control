# 🛠️ BROski DevOps Rule Template

> Apply this for Docker, CI/CD, infra, and deployment work.

## Docker Rules (SACRED)

- ALWAYS use `docker-ce-cli` — NEVER `docker.io` for socket agents
- Docker Compose for local dev — never run containers manually
- Multi-stage builds for production images (build → runtime)
- Never run containers as root — use `USER` directive
- Health checks required on all long-running services

## Environment & Secrets

- All secrets via environment variables — never hardcoded
- `.env` files: NEVER committed — always in `.gitignore`
- `.env.example` is the template — keep it updated
- Production secrets: use platform secret manager (Vercel env, Railway vars, Render env)

## Redis Rules (SACRED)

- DB 1 = cache ONLY
- DB 2 = rate limits ONLY
- NEVER mix these databases
- Always set TTL on cache keys — no infinite cache

## CI/CD Patterns

- GitHub Actions for CI — test → lint → build → deploy
- Branch strategy: `feature/*` → `dev` → `main` (with PR required)
- Deploy to staging on `dev` push, production on `main` push
- Run tests before deploy — never skip on prod
- Rollback strategy defined before any major deploy

## Monitoring & Observability

- Grafana + Loki + Promtail for logs
- Health endpoint: `GET /health` on every service
- Alert on: 5xx rate > 1%, latency p95 > 2s, disk > 85%
- Log format: structured JSON (timestamp, level, service, message, context)

## Deployment Targets (Mission Control stack)

- Frontend: Vercel — `vercel.json` config at root
- Backend: Render — `render.yaml` config at root
- DB: Supabase hosted PostgreSQL
- Optional: Railway for microservices or workers
