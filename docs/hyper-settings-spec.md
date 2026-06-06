# 🧠 Hyper Report v1: BROski IDE Settings Spec

**Project:** Hyper Merge / Mission Control Hub  
**Based on:** TRAE IDE deep-dive (Changelog, Unity Plugin, Extensions, Sandbox, IDE Settings)  
**Version:** 0.1 — June 2026  
**Author:** WelshDog x Perplexity HYPERFOCUS session  

---

## 1. Overview

This report defines the **Settings Architecture** for Hyper Merge / Mission Control Hub, using TRAE IDE's settings model as the reference blueprint. The goal is a modular, agent-aware, neurodivergent-friendly settings system that controls:

- **User identity & privacy**
- **IDE/editor behaviour**
- **Agent configuration & governance**
- **Context, rules, and memory**
- **Security sandbox & command execution**

---

## 2. Settings Taxonomy

| TRAE Section | Purpose | BROski Equivalent |
|---|---|---|
| Account | Identity, data export, delete | BROski Account Hub |
| Privacy | Data storage, telemetry | Hard Privacy Mode |
| General | Theme, language, editor prefs | Hyper IDE General |
| Agents | Create/edit/share agents | Agent Forge |
| MCP | Register/manage MCP servers | MCP Hub |
| Conversation | AI behaviour, review, commands | Agent Command Centre |
| CUE | Inline code intelligence | Context Engine |
| Models | Custom model registry | Model Registry |
| Context | Code index, docs, ignores | Context Hub |
| Rules | User + project AI rules | Rules Engine |
| Sandbox | Command execution policy | BROski Sandbox |

---

## 3. BROski Settings Model

### 🔐 3.1 Account & Privacy

**Required fields:**
- `user.display_name` — shown across all workspaces
- `user.email`
- `user.plan` — Free / Pro / BROski+ / Enterprise
- `user.export_data` — export all workspace + agent configs as `.zip`
- `user.delete_account` — full wipe with confirmation challenge

**Notification prefs:**
- `notify.product_tips` — bool
- `notify.account_alerts` — bool (billing, security)
- `notify.community_invites` — bool

**Privacy controls:**
- `privacy.hard_mode` — bool: if true, zero logs stored, zero telemetry, all inference local or self-hosted only
- `privacy.store_conversations` — bool (default: true, false in Hard Mode)
- `privacy.used_for_training` — bool (default: false always)

> 🧠 **Neuro UX Note:** Privacy settings must use plain language, not legal jargon. Single toggle for "Lock it all down" (Hard Mode = one click to maximum privacy).

---

### 🎨 3.2 General / IDE UX

**Theme:**
- `ui.theme` — options: `hyper_dark` | `hyper_night_shift` | `high_contrast_neuro` | `light` | `custom`
- `ui.font_size` — number (default: 14)
- `ui.font_family` — string (default: `"JetBrains Mono"`)
- `ui.line_wrap` — bool (default: true)
- `ui.minimap` — bool

**Language & localisation:**
- `ui.language` — ISO code (default: `"en"`, expandable to `"cy"` for Welsh 🏴󠁧󠁢󠁷󠁬󠁳󠁿, `"ja"`, `"zh"`, etc.)

**Keymap profiles:**
- `editor.keymap` — `vscode` | `jetbrains` | `broski_cmd` | `custom`
- `editor.default_browser` — path to browser binary for local link opens
- `editor.markdown_view` — `code` | `preview` | `split` | `agent_annotated`

**Config import/migration:**
- `import.source` — `vscode` | `cursor` | `trae` | `none`
- `import.overwrite_warning` — bool (always true, protect existing config)

> 🧠 **Neuro UX Note:** Ship 3 presets on first-run: "Chill Dev", "Hyperfocus Beast", "Accessibility First". Each sets sensible defaults for that mode rather than drowning users in options.

---

### 🤖 3.3 Agent Forge (Agents)

**Agent schema (per agent):**
- `agent.id` — uuid
- `agent.name` — string
- `agent.description` — string
- `agent.model` — reference to Model Registry
- `agent.tools` — array of MCP tool IDs enabled for this agent
- `agent.rules` — array of rule file paths (global + project)
- `agent.memories` — array of memory scopes enabled
- `agent.skills` — array of skill IDs
- `agent.shared` — bool: can be exported/shared as a template
- `agent.workspace_scope` — `global` | `project` | `team`

**Agent templates (shipped defaults):**
- `BROski Dev` — full-stack web dev agent, VS Code-style tools, strict rules
- `BROski Ops` — DevOps, Docker, K8s, infra agent
- `BROski Creative` — design, 3D, content, storytelling agent
- `BROski Research` — deep-dive, web fetch, summarise, report agent

---

### 🔌 3.4 MCP Hub

**MCP server schema (per server):**
- `mcp.id` — uuid
- `mcp.name` — string (e.g. `"unityMCP"`, `"supabaseMCP"`, `"githubMCP"`)
- `mcp.transport` — `stdio` | `sse` | `http`
- `mcp.command` — string (for stdio: launch command)
- `mcp.url` — string (for sse/http)
- `mcp.env` — object (env vars, masked in UI)
- `mcp.enabled` — bool
- `mcp.workspace_scope` — `global` | `project`
- `mcp.log_level` — `off` | `error` | `info` | `verbose`

**MCP Hub UI features:**
- 🟢 Live status indicator (connected / error / idle) per server
- "Test Connection" button
- MCP log viewer with filter by server + level
- Quick-add from BROski MCP Marketplace (community-built servers)

> 🧠 **Neuro UX Note:** Color-code server status: 🟢 connected, 🟡 idle, 🔴 error. No hunting for error logs — surface them inline next to the server card.

---

### 💬 3.5 Agent Command Centre (Conversation)

**Task UX:**
- `conv.todo_panel` — bool: show task list per conversation
- `conv.auto_fold_completed` — bool: collapse + summarise finished task threads

**Code hygiene:**
- `conv.auto_fix_lint` — bool (always true in SOLO/Hyperfocus mode)
- `conv.auto_format_on_save` — bool

**Agent initiative:**
- `conv.agent_questions_proactively` — bool: agent asks for clarification before assuming
- `conv.question_depth` — `minimal` | `balanced` | `thorough`

**Review modes:**
- `conv.review_mode` — `review_all` | `review_latest` | `trust_agent`
- `conv.jump_to_next_change` — bool: auto-scroll to next diff after accepting a change

**Command execution:**
- `conv.auto_run_mcp` — bool
- `conv.command_mode` — `always_manual` | `sandbox_allowlist` | `denylist` | `always_run`
- `conv.command_allowlist` — array of command prefixes trusted to run on host (e.g. `["git", "bun dev", "docker compose up"]`)
- `conv.command_denylist` — array of command prefixes always blocked (e.g. `["rm -rf /", "sudo rm"]`)

**Alerting & sounds:**
- `conv.notify_task_complete` — bool
- `conv.notify_task_needs_attention` — bool
- `conv.notify_task_failed` — bool
- `conv.sound_task_complete` — path to `.mp3` or preset name (e.g. `"broski_ding"`)
- `conv.sound_task_failed` — path to `.mp3` or preset name (e.g. `"broski_alarm"`)

> 🧠 **Neuro UX Note:** Task notifications are gold for ADHD flow. Keep the banner subtle — bottom-right corner, auto-dismiss in 5s, no modal interrupts. Custom sounds = dopamine hit on task complete. 🎯

---

### ⚡ 3.6 Context Engine (CUE)

**Inline intelligence:**
- `cue.tab_completion` — bool: context-aware inline completions
- `cue.smart_import` — bool: auto-suggest missing imports
- `cue.smart_rename` — bool: AI-assisted safe rename across codebase
- `cue.workspace_scope` — `global` | `project` (override per workspace)

---

### 🧩 3.7 Model Registry

**Model schema (per model):**
- `model.id` — uuid
- `model.name` — display name
- `model.provider` — `openai` | `anthropic` | `google` | `xai` | `openrouter` | `local` | `custom`
- `model.base_url` — string (for custom/local)
- `model.api_key` — string (masked in UI, stored in secrets manager)
- `model.context_window` — number (tokens)
- `model.default_for` — `chat` | `agent` | `inline` | `all`
- `model.enabled` — bool

**BROski-shipped model presets:**
- GPT-5.2 (OpenAI, 128k context)
- Claude Sonnet 4.6 (Anthropic)
- Gemini 3 Flash (Google, fast + cheap)
- Kimi K2 (long context beast, 272k)
- Local Ollama (self-hosted, hard privacy mode)

---

### 📚 3.8 Context Hub

**Code indexing:**
- `context.index_enabled` — bool (default: true)
- `context.index_scope` — `workspace` | `repo` | `monorepo`
- `context.ignore_patterns` — array of glob patterns (beyond `.gitignore`)
  - Defaults: `[".trae/**", ".hyper/**", "dist/**", "node_modules/**", "*.lock"]`

**Docs:**
- `context.docs` — array of doc sources:
  - `{ type: "url", url: "https://..." }` — fetches + indexes live docs
  - `{ type: "file", path: "./docs/spec.md" }` — local markdown
  - `{ type: "upload", file_id: "uuid" }` — uploaded PDF/Markdown

**External packages:**
- `context.include_external_packages` — bool: index installed lib source for smarter completions
- `context.include_library_folder` — bool: include Unity-style Library or build output dirs

---

### 📋 3.9 Rules Engine

**User-level rules (global):**
- `rules.user` — array of rule file paths (applied to every workspace)
- Default path: `~/.hyper/rules/user.md`

**Project-level rules:**
- `rules.project` — array of rule file paths relative to workspace root
- Convention: `.hyper/rules/*.md` or `AGENTS.md` at root (auto-detected)
- Supports sub-repo rules for monorepos: each sub-package can have its own `AGENTS.md`

**Rule templates (shipped):**
- `broski_fullstack.md` — React, Node, TypeScript, Supabase patterns
- `broski_devops.md` — Docker, K8s, CI/CD conventions
- `broski_python_ai.md` — Python, FastAPI, LangChain, agent patterns
- `broski_unity.md` — Unity 6 style, naming, debugging, perf
- `broski_neuro_ux.md` — Neurodivergent-friendly component patterns, accessible defaults

---

### 🔒 3.10 BROski Sandbox

**Activation:**
- `sandbox.enabled` — bool (default: true when any agent auto-runs commands)
- `sandbox.mode` — `sandbox_allowlist` | `always_manual` | `always_run`

**Filesystem policy:**
- `sandbox.filesystem.read_write` — array of paths (default: `["$WORKSPACE_FOLDER"]`)
- `sandbox.filesystem.read_only` — array of paths (default: `["/", "~/.ssh", "~/.aws", "~/.hyper", ".git"]`)
- Path tokens supported: `~`, `$WORKSPACE_FOLDER`, `$BROSKI_ENV`, `$HOME`, `$TMPDIR`

**Network policy (Windows + Linux):**
- `sandbox.network.default` — `allow` | `deny`
- `sandbox.network.allow` — array of patterns (IPs, CIDR, domains, `"*.github.com:443"`)
- `sandbox.network.deny` — array of patterns

**Command classification:**
- `sandbox.high_risk_patterns` — array of regex/glob patterns flagged as destructive
  - Defaults: `["rm -rf*", "sudo rm*", "format *", "DROP TABLE*"]`
- `sandbox.high_risk_action` — `always_prompt` | `always_block`

**Escalation flow:**
1. Agent wants to run command
2. Check if prefix is in `command_allowlist` → run on host directly
3. Not on allowlist → run in sandbox
4. Fails in sandbox → prompt: "Run outside sandbox? [Yes / Add to Allowlist / Skip]"
5. Matches `high_risk_patterns` → always intercept: "[Skip / Add to Allowlist / Run in Sandbox This Time]"

**Example `sandbox.json`:**

```json
{
  "filesystem": {
    "readWrite": ["$WORKSPACE_FOLDER", "$TMPDIR", "~/.local/lib"],
    "readOnly": ["/", "~/.ssh", "~/.aws", "~/.hyper", ".git"]
  },
  "network": {
    "default": "deny",
    "allow": [
      "*.github.com:443",
      "*.supabase.co:443",
      "registry.npmjs.org:443",
      "pypi.org:443"
    ],
    "deny": [
      "10.0.0.0/8",
      "192.168.0.0/16",
      "172.16.0.0/12"
    ]
  }
}
```

---

## 4. Security & Privacy Layer

These three systems interlock:

- **Privacy Mode** controls whether any data leaves the machine.
- **Sandbox policy** controls what agents can touch on disk and network.
- **Command execution mode** controls whether commands auto-run, sandbox-run, or always need approval.

**Trust Stack:**

```
User Trust Level
  ↓
Hard Privacy Mode → No external calls at all
  ↓
Sandbox ON → Constrained disk + network
  ↓
Command Allowlist → Trusted commands bypass sandbox
  ↓
High-Risk Classifier → Dangerous commands always intercepted
  ↓
Manual Review (always last resort)
```

---

## 5. Agent Governance Model

```
Agent Forge (who the agent is)
  + Rules Engine (what the agent knows / follows)
  + Context Hub (what the agent can see)
  + MCP Hub (what tools the agent can call)
  + Model Registry (what brain the agent uses)
  + Agent Command Centre (how the agent executes)
  + BROski Sandbox (what the agent is allowed to touch)
  = FULLY GOVERNED AGENT 🤖
```

Each layer is independently configurable per workspace:
- **Personal projects** — loose rules, full trust
- **Team projects** — shared rules, sandbox on, manual review for risky ops
- **Client / production** — strict rules, hard sandbox, always manual for destructive ops

---

## 6. Config Storage & Format

```
~/.hyper/
  config.json          ← global user settings
  sandbox.json         ← global sandbox policy
  rules/
    user.md            ← global user rules
  models/
    registry.json      ← custom model configs (no keys here)
  secrets/
    .env               ← API keys (never committed)

$WORKSPACE_FOLDER/.hyper/
  config.json          ← project-level overrides
  sandbox.json         ← project sandbox overrides
  rules/
    project.md
    AGENTS.md          ← auto-detected agent rules
  context/
    docs.json          ← list of doc sources
    ignore.json        ← additional ignore patterns
```

**Precedence (project > user > global defaults):**
- Project `.hyper/config.json` overrides `~/.hyper/config.json`
- Project sandbox overrides global sandbox
- Project rules *add* to user rules (they don't replace)

**CLI commands:**
```bash
# Export everything
hyper export-settings --include=all --output=hyper-settings-export.zip

# Import
hyper import-settings ./hyper-settings-export.zip --overwrite=ask

# Migrate from another IDE
hyper migrate --from=trae
hyper migrate --from=vscode
hyper migrate --from=cursor
```

---

## 7. Extensions System

- **BROski Extension Store**: curated first-party extensions (languages, frameworks, dev tools)
- **Side-load from marketplace**: enter `itemName@version`, system builds download URL, pulls `.vsix`, installs
- **Local VSIX install**: drag-drop or file picker
- **Compatibility layer**: flag extensions requiring newer VS Code API versions, offer auto-downgrade

**Extension config (per extension):**
- `extension.id`
- `extension.enabled` — bool
- `extension.workspace_scope` — `global` | `project`
- `extension.version` — pinned version or `"latest"`

---

## 8. Neuro-Friendly UX Principles

Apply to **every** settings screen:

- 🧩 **Progressive disclosure** — Show only key settings on load. "Advanced" toggle reveals deeper options.
- 🎯 **Presets first** — Every section ships with opinionated presets so you never start from blank.
- 💬 **Plain language** — No jargon. "Allow agent to run commands automatically" not "Auto-execute subprocess policy".
- 🔄 **One-click safe defaults** — "Reset to safe defaults" button per section.
- 🔴🟡🟢 **Visual status** — Color-coded status everywhere (MCP servers, sandbox state, privacy mode).
- 🔔 **Sound + visual task alerts** — Completion sounds, banner notifications, no modal interruptions.
- ❓ **Context-sensitive help** — Hover tooltips on every setting with a one-line plain-English description.

---

## 9. Implementation Roadmap

### Phase 1 — MVP (v0.1) 🟢
- Account, Privacy Mode, General/Theme, Model Registry, Basic Rules Engine
- File-based config (`~/.hyper/config.json`, per-project `.hyper/config.json`)

### Phase 2 — Agent Layer (v0.2) 🟡
- Agent Forge (create/edit/share agents)
- MCP Hub (register servers, live status, logs)
- Context Hub (code index, docs, ignores)

### Phase 3 — Security & Governance (v0.3) 🔴
- BROski Sandbox (filesystem + network policy, `sandbox.json`)
- Agent Command Centre (command modes, allowlist, denylist, sounds)
- Full trust stack (privacy → sandbox → allowlist → classifier → manual)

### Phase 4 — Extensions & Polish (v0.4) 🏴󠁧󠁢󠁷󠁬󠁳󠁥
- BROski Extension Store + side-load + local VSIX
- Config import/export/migration
- Neuro UX polish pass (presets, progressive disclosure, tooltips)

---

*Generated during HYPERFOCUS deep-dive session — WelshDog x Perplexity AI, June 2026* 🧠⚡🏴󠁧󠁢󠁷󠁬󠁳󠁥
