# 🧠 BROski Neuro-Friendly UX Rule Template

> Apply these rules to every UI component. Built for ADHD + Dyslexia + Autism users first — everyone benefits.

## Core Principles

- **Clarity over cleverness** — simple words, plain language always
- **Reduce cognitive load** — one primary action per screen/card
- **Progressive disclosure** — show essentials first, advanced on demand
- **Predictability** — UI should never surprise the user

## Typography

- Font size: minimum 16px body, 14px for secondary text — never smaller
- Line height: 1.6 minimum for body text
- Font: prefer dyslexia-friendly fonts (Open Dyslexic, Lexie Readable, or clean sans-serif)
- Avoid justified text — use left-aligned always
- Max line length: 65-75 characters (no wide walls of text)

## Color & Contrast

- WCAG AA minimum — aim for AAA on critical text
- Never use color alone to convey meaning — always pair with icon or text label
- Dark mode first — bright white backgrounds cause eye strain
- Avoid red/green only combos — colorblind-safe palettes

## Forms & Inputs

- Label always visible above input — never placeholder-only
- Inline validation — show errors as user types, not only on submit
- Error messages: plain language + actionable ("Email must include @" not "Invalid format")
- Autofill friendly — use correct `autocomplete` attributes
- Tab order must be logical — test keyboard-only navigation

## Notifications & Feedback

- Toast/banner notifications — bottom-right, auto-dismiss in 5s
- NEVER modal interrupts for non-critical info
- Loading states on every async action — no unexplained blank states
- Success feedback: visual + optional sound cue (BROski ding 🔔)
- Error feedback: clear, non-alarming, always recoverable

## Navigation

- Breadcrumbs or back button on all non-root pages
- Current location always clear in nav (active states)
- No more than 7 items in any nav menu (Miller's Law)
- Mobile-first layout — thumb-reachable primary actions

## Content

- Short sentences — max 20 words per sentence
- Bullet points over paragraphs for lists
- Headers to chunk every section
- No walls of text — break at 3-4 sentences max
- Use emojis sparingly as visual anchors (not decoration)

## Focus & ADHD Support

- Task lists: show current step highlighted, completed steps folded
- Progress indicators on multi-step flows
- Auto-save where possible — prevent data loss from focus shifts
- "Where was I?" — always persist UI state between sessions
- Confirmation dialogs for destructive actions — with plain language summary of what will happen
