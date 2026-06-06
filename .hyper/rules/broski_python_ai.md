# 🐍 BROski Python + AI Agent Rule Template

> Apply for Python, FastAPI, agent frameworks, and LLM integration work.

## Python Sacred Rules

- Indent: 4 spaces — NEVER 3, NEVER tabs, NEVER mixed
- Import style: `from app.X import Y` — NEVER `from backend.app.X import Y`
- Type hints on all function signatures
- Docstrings on all public functions and classes (Google style)
- `requirements.txt` pinned versions for prod — `requirements-dev.txt` for dev deps

## FastAPI Patterns

- Routers: `routers/feature_name.py` — one router per feature
- Pydantic models for all request/response shapes
- Dependency injection for auth, DB sessions, rate limiting
- Background tasks via `BackgroundTasks` or Celery for heavy work
- Always return structured responses with consistent shape

## LLM / Agent Patterns

- API keys via env vars only — never hardcoded
- Model selection via config — never hardcoded model strings in business logic
- Prompt templates in separate files (`prompts/`) — not inline strings
- Streaming responses where latency matters
- Always handle: rate limits, token limits, API timeouts gracefully
- Log token usage per request for cost monitoring

## Memory & State (Agent-specific)

- Short-term memory: Redis (DB 1 = cache)
- Long-term memory: PostgreSQL or vector DB (pgvector on Supabase)
- Session IDs: UUID v4 — never sequential integers
- Memory scope: user-level, project-level, agent-level — clearly separated

## Safety & Security

- Input sanitisation before passing to LLM — strip injection attempts
- Output validation — never blindly execute LLM-generated code without sandbox
- Rate limit all LLM endpoints (except Stripe webhook pattern)
- Audit log all agent actions: timestamp, agent_id, action, input_hash, output_hash

## Testing

- pytest for unit + integration tests
- Mock LLM calls in tests — never hit real API in CI
- Test fixtures in `tests/fixtures/`
- Coverage target: 80%+ for agent core logic
- Use `pytest-asyncio` for async FastAPI route tests
