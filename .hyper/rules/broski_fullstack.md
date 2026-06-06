# 🌐 BROski Full-Stack Rule Template

> Apply this for React + Node + TypeScript + Supabase projects.

## React Patterns

- Functional components + hooks only
- Co-locate component logic: `ComponentName.jsx`, `useComponentName.js`, `ComponentName.test.js`
- State: prefer `useState` + `useReducer` for local; Zustand or Jotai for global
- Data fetching: React Query (`@tanstack/react-query`) preferred over raw `useEffect`
- Forms: React Hook Form + Zod validation

## Node/Express Patterns

- Route files: `routes/featureName.js`
- Middleware first: auth → rate-limit → validation → handler
- Always return structured responses: `{ success: bool, data: {}, error: null }`
- Error handling: centralised `errorHandler` middleware — never swallow errors silently
- Stripe webhooks: rate-limit EXEMPT, always verify `stripe-signature` header

## Supabase Patterns

- RLS enabled on all tables — no exceptions
- Use Supabase client from `lib/supabase.js` — never instantiate inline
- DB migrations in `supabase/migrations/` — always use `supabase db push`
- Edge functions for sensitive logic (payment hooks, auth triggers)
- Never query Supabase from client side with service role key

## TypeScript (when used)

- Strict mode on: `"strict": true` in `tsconfig.json`
- Interfaces for API shapes, types for unions/primitives
- Zod schemas auto-generate types — don't duplicate
- No `any` — use `unknown` + type guards if type is truly unknown

## Testing

- Unit tests: Vitest (co-located with files)
- Integration tests: Supertest for API routes
- E2E: Playwright
- Coverage target: 80%+ for critical paths (auth, payments)
