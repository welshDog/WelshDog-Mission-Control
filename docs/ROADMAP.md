# 🚀 Hyper Merge — Mission Control Roadmap

> Based on Hyper Report v1 TRAE deep-dive session — June 2026 🧠⚡

See full spec: [docs/hyper-settings-spec.md](./hyper-settings-spec.md)

---

## 🟢 Phase 1 — MVP Settings Layer (v0.1)

**GitHub Issue:** [#1](https://github.com/welshDog/WelshDog-Mission-Control/issues/1)

- Account system (display name, email, plan tier, export, delete)
- Hard Privacy Mode toggle
- General/Theme settings + first-run presets
- Model Registry (custom models)
- Basic Rules Engine (user + project rules from `.hyper/rules/`)
- File-based config: `~/.hyper/config.json` + per-project `.hyper/config.json`

---

## 🟡 Phase 2 — Agent Layer (v0.2)

- **Agent Forge**: create, edit, share agents with model/tools/rules/memories/skills
- **MCP Hub**: register servers, live status, log viewer, marketplace
- **Context Hub**: code index, doc sources, ignore patterns
- Agent templates: BROski Dev, BROski Ops, BROski Creative, BROski Research

---

## 🔴 Phase 3 — Security & Governance (v0.3)

- **BROski Sandbox**: filesystem + network policy via `.hyper/sandbox.json`
- **Agent Command Centre**: command modes, allowlist, denylist, task sounds
- **Trust Stack**: privacy → sandbox → allowlist → classifier → manual review
- High-risk command classifier with escalation flow + user prompts

---

## 🏴󠁧󠁢󠁷󠁬󠁳󠁥 Phase 4 — Extensions & Polish (v0.4)

- **BROski Extension Store**: curated + side-load (marketplace URL) + local VSIX
- Config import/export/migration (`hyper migrate --from=trae/vscode/cursor`)
- Neuro UX polish pass: presets, progressive disclosure, hover tooltips
- Welsh language support (`cy` locale) 🏴󠁧󠁢󠁷󠁬󠁳󠁥

---

## 🗂️ Config Files (Already In Repo)

| File | Purpose |
|---|---|
| `.hyper/config.json` | Project-level settings |
| `.hyper/sandbox.json` | Sandbox policy (filesystem + network + commands) |
| `.hyper/AGENTS.md` | Agent rules (auto-detected) |
| `.hyper/rules/broski_fullstack.md` | Full-stack dev rules |
| `.hyper/rules/broski_devops.md` | DevOps + Docker rules |
| `.hyper/rules/broski_neuro_ux.md` | Neuro-friendly UX rules |
| `.hyper/rules/broski_python_ai.md` | Python + AI agent rules |
| `.hyper/agents/broski-dev.json` | BROski Dev agent template |
| `.hyper/mcp/servers.json` | MCP server registry |
| `docs/hyper-settings-spec.md` | Full Hyper Report v1 spec |

---

*WelshDog x Perplexity AI HYPERFOCUS session — June 2026* 🧠⚡🏴󠁧󠁢󠁷󠁬󠁳󠁥
