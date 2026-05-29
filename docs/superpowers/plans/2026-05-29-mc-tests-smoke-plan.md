# Mission Control Tests (Smoke) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `npm test` pass by adding a Vitest + Testing Library smoke test for Mission Control.

**Architecture:** Add a shared test setup file (as configured in `vite.config.js`) and a single `App` render smoke test. Mock Supabase so auth never calls the network.

**Tech Stack:** Vite, Vitest, React Testing Library, jsdom.

---

### Task 1: Add Vitest setup file

**Files:**
- Create: `tests/setup.js`
- Verify: `vite.config.js` (already points at `./tests/setup.js`)

- [ ] **Step 1: Create `tests/setup.js`**

```js
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => {
  cleanup()
})
```

- [ ] **Step 2: Run tests to confirm it still fails (no test files yet)**

Run: `npm test`  
Expected: FAIL with “No test files found” (exit code 1)

- [ ] **Step 3: Commit**

```bash
git add tests/setup.js
git commit -m "test: add vitest setup"
```

### Task 2: Add App smoke test (unauth gate)

**Files:**
- Create: `src/__tests__/app.smoke.test.jsx`
- Test target: `src/App.jsx`

- [ ] **Step 1: Create test file**

```jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from '../App'

vi.mock('../lib/supabase', () => {
  const sessionRes = Promise.resolve({ data: { session: null } })
  return {
    supabase: {
      auth: {
        getSession: () => sessionRes,
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        signOut: () => Promise.resolve(),
      },
    },
  }
})

describe('Mission Control App', () => {
  it('shows auth gate when not logged in', async () => {
    render(<App />)
    expect(await screen.findByText(/Restricted Access/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests**

Run: `npm test`  
Expected: PASS (1 test file, 1 test)

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/app.smoke.test.jsx
git commit -m "test: add app smoke test"
```

### Task 3: Final verification + push

**Files:**
- None

- [ ] **Step 1: Lint**

Run: `npm run lint`  
Expected: exit code 0

- [ ] **Step 2: Build**

Run: `npm run build`  
Expected: exit code 0

- [ ] **Step 3: git fetch + push**

```bash
git fetch
git push
```

