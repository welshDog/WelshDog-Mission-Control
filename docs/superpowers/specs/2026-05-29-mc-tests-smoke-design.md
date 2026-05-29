# Mission Control Tests (Smoke) — Design

## Goal

Make `npm test` pass in `WelshDog-Mission-Control` by adding a minimal but meaningful Vitest + Testing Library smoke test.

## Current Problem

- `npm test` exits with code 1 because no test files exist.
- `vite.config.js` expects `test.setupFiles: ./tests/setup.js`.

## Non-Goals

- No production behaviour changes.
- No Playwright/E2E expansion in this pass.

## Approach

1. Add `tests/setup.js` to configure Testing Library matchers and clean up between tests.
2. Add a single smoke test that renders `src/App.jsx` and asserts the unauthenticated auth gate appears (text: “Restricted Access”).
3. Mock `supabase` in the test so no real network/auth calls occur.

## Acceptance Criteria

- Running `npm test` returns exit code 0.
- Smoke test proves React + Router boot without requiring any `.env.local`.

## Test Plan

- Run: `npm test`
- Expect: PASS, 1 test suite, 1+ tests.

