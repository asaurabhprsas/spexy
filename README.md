# Spexy

> **Local-First, Human-in-the-Loop Spec-Driven Development (SDD) Platform for Autonomous AI Agents and Software Architects.**

[![npm version](https://img.shields.io/npm/v/spexy-cli.svg?style=flat-square&color=cb3837)](https://www.npmjs.com/package/spexy-cli)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.0.0-339933.svg?style=flat-square&logo=node.js)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg?style=flat-square)](LICENSE)
[![Zero-Database](https://img.shields.io/badge/Database-Zero--DB%20Git--Native-purple.svg?style=flat-square)](#-zero-database--transparent-yaml-tasks)
[![Token-Killer](https://img.shields.io/badge/Token%20Killer-Compact%20Modes-orange.svg?style=flat-square)](#-lightweight-tdd-skills-vs-heavy-mcp)

---

## 💡 What is Spexy?

Autonomous AI coding agents (Claude Code, Cursor, Codex, OpenHands, Antigravity) write code fast, but left unconstrained, they often drift from architectural guidelines, hallucinate dependencies, and produce merge conflicts.

**Spexy** fixes this by establishing a verifiable, machine-executable contract between human software architects and AI agents:
1. **Constitution First**: Guarantees technical, product, and structural boundaries before any feature code is written.
2. **DAG-Driven Workflow**: Decomposes features into atomic, directed acyclic graphs of tasks with dynamic prerequisite checking.
3. **Two-Tier HITL Safety**: Agents claim and submit tasks, but **only humans can approve tasks as done**.
4. **Zero-Database & YAML-First**: 100% stored in version-controlled markdown and YAML files inside `.spexy/`.
5. **Instant Live Dashboard**: Real-time ClickUp-style tasks, Kanban board, DAG visualizer, and inline document editor.
6. **Token-Optimized Skills**: Lightweight TDD skill pack with a CLI proxy, eliminating heavy, memory-hungry MCP servers.

---

## ⚡ Quickstart

Get up and running in seconds with the Spexy CLI:

### 1. Install Spexy CLI
```bash
npm install -g spexy-cli
```

### 2. Initialize Your Workspace
Run `spexy init` in your project root to generate the constitutional steering corpus (`product.md`, `tech.md`, `structure.md`) and directory structure:
```bash
spexy init
```

### 3. Launch the Interactive Dashboard
Launch the real-time local web dashboard at `http://127.0.0.1:4200`:
```bash
spexy dashboard
```

---

## 🌟 Key Features

### 🖥️ Real-Time Interactive Dashboard
- **Comprehensive Spec Management**: Browse and manage project specifications, requirements, architecture, and feature definitions from a modern, responsive web UI.
- **Direct Document Editing & Live Preview**: Edit steering documents and feature specs directly inside the dashboard with synchronized, real-time rendered markdown preview.
- **Inline Line-Anchored Comments**: Click any line in the document inspector to pin feedback or architectural questions. AI agents can read, address, and resolve comments directly (`spexy comment list` / `spexy comment resolve`).
- **Instant Live Updates**: Built-in file watcher and WebSocket server automatically broadcast file changes to the UI instantaneously with zero manual polling.

### 🧩 Official VS Code Extension
- **Native Editor Integration**: Complete Spexy SDD lifecycle directly within VS Code via `packages/vscode-extension`.
- **Sidebar Explorer**: Interactive Tree Views for **Active Specifications** (with status badges, quick actions) and **Pending Review Comments**.
- **Inline Editor Commenting**: Add line-anchored comments directly on *any* repo file or spec from the editor context menu (`Spexy: Add Inline Comment`) with live fuzzy anchoring and line tracking.
- **Embedded Webview Dashboard**: Launch the full real-time dashboard or dedicated views (Kanban, DAG Visualizer, Hierarchical Tasks, Specs, Steering) seamlessly within editor panels.
- **Automatic Daemon Lifecycle**: Automatically starts, monitors, and stops the local Spexy dashboard server in the background.

### 🌿 Multi-Worktree Task Coordination & Auto-Blocking
- **Centralized Hub Architecture**: Main repository serves as the central coordination hub when multiple agents operate concurrently in parallel Git worktrees (`git worktree`).
- **Conflict Prevention & Active Lease Tracking**: If an agent starts a task in one worktree, Spexy's central engine automatically marks it in-progress across all worktrees. Subsequent claim attempts in other worktrees are immediately blocked with informative guidance, redirecting agents to independent tasks.
- **Clean Worktree Allocation**: `spexy worktree allocate` & `spexy worktree clean` commands provide turnkey agent worktree isolation without merge collisions.

### 📊 Three-Way Synchronized Task Views & Hierarchical Sub-Tasks
- **Hierarchical List View (ClickUp / TickTick Style)**:
  - Multi-level nested task hierarchies (`parent_id`) allowing main tasks to be broken down into granular sub-tasks.
  - Interactive collapsible trees with progress badges (`1/3 subtasks`), visual progress bars, priority badges, and quick status action menus.
  - Direct 1-click subtask creation (`+ Subtask`) on any parent or child task.
- **DAG Dependency-Based Blocking**:
  - Full directed acyclic graph resolution (`depends_on`). If any prerequisite task is not `done`, dependent tasks and sub-tasks are marked as blocked with visual lock indicators.
  - Real-time dynamic availability calculation (`spexy task list` and dashboard) guarantees agents and humans only work on unblocked, actionable items.
- **Kanban Board**: Drag-and-drop workflow across `todo`, `in-progress`, `to-review`, and `done` columns, complete with a dedicated blocked dependencies queue.
- **DAG Dependency Visualizer**: Interactive node-based graph showing prerequisite chains, dynamic availability, and topological execution order. Includes canvas zoom in/out/reset controls and captured keyboard shortcuts (`Ctrl/Cmd + +`, `Ctrl/Cmd + -`, `Ctrl/Cmd + 0`, `Ctrl + Wheel`) that prevent browser-level page scaling.

### 🛡️ Spec Approval Gate & Two-Tier HITL Safety
- **Drafting Freedom with AI Guardrails**:
  - Architects can generate and decompose tasks into `tasks.yaml` even while `requirements.md` and `design.md` are in `draft` mode.
  - However, **AI agents (`--actor agent`) are strictly blocked** from claiming or starting tasks until human architects formally approve the steering guidelines, requirements, and design docs via `spexy doc approve <spec-id>`.
- **Role-Guarded Transitions**:
  ```
  [todo]  ──(agent: claim)──>  [in-progress]  ──(agent: submit)──>  [to-review]  ──(human: approve)──>  [done]
                                                                                └──(human: reject)───>  [todo]
  ```
- **Autonomous Safe Execution**: AI agents can claim unblocked tasks (`spexy task claim`) and submit them with implementation notes (`spexy task submit`), but **agents are strictly forbidden from approving tasks to `done`**. Only human reviewers can approve tasks or request revisions.

### 💬 Unified Comments, Document Uploads & Temp-to-Permanent Staging
- **Targeted Line, Task & General Comments**:
  - Add inline line-anchored comments directly on markdown specs, task-specific feedback on task detail sheets, or general spec-level architectural discussions.
  - Review comments support deferred file attachments (images, logs, documents) staged in-browser and written to disk only upon user confirmation ("Post Comment"), preventing orphaned disk bloat.
- **Smart Staging (`.temp`) & 1-Click Preservation**:
  - Uploaded reference documents and images default to `.temp/` subdirectories (automatically git-ignored to prevent repo bloat).
  - A 1-click **"Preserve in repo" / "Keep"** action allows humans to permanently promote important assets into tracked `references/` or `images/` directories.

### 🔍 Background Error Observability & Real-Time Logs
- **Instant Corrupted-File & Background Alerts**:
  - If a file watcher detects invalid YAML syntax, broken markdown frontmatter, or background runtime errors, a destructive toast notification pops up in the bottom-right corner of the dashboard immediately.
- **CLI Log Streaming**:
  - Launch dashboard with live output via `spexy dashboard --logs` or inspect recent server activity anytime using `spexy logs`.

### 📜 Immutable Audit Trail (`implementation.log`)
- Every task transition (`claim`, `submit`, `approve`, `reject`, `set_status`), document edit, and file upload is automatically recorded to `.spexy/specs/<spec-id>/implementation.log`.
- Tracks exact ISO timestamps, actors (`human` or `agent`), Git worktrees, and review feedback notes, providing an audit trail for autonomous agent development.

### 🚀 Lightweight TDD Skills vs Heavy MCP
- **Zero Heavy MCP Overhead**: Rather than running bloated MCP server daemons that waste system memory and clutter LLM context windows, Spexy provides a fast, native single-binary CLI and portable Agent Skills (`SKILL.md`).
- **Test-Driven Development (TDD) Core**: Encourages agents to write failing tests first, implement minimal code to pass, and verify before submitting.
- **Specialized Agent Roles**:
  - 📋 **Planner**: Decomposes requirements into atomic DAG task graphs with dependency links.
  - ⚙️ **Executor**: Implements individual tasks in isolated Git worktrees following strict TDD.
  - 🔍 **Reviewer**: Evaluates code against requirements, security, and architectural invariants.
  - 🐞 **Debugger**: Systematic root-cause analysis without random trial-and-error guessing.
- Equip your agent with the Spexy skill pack:
  ```bash
  npx skills add asaurabhprsas/spexy
  ```

### ✂️ Token Killer CLI Modes
When AI agents query task lists, steering docs, or review comments, passing raw formatted prose wastes valuable context tokens. Spexy includes compact CLI modes optimized for token savings:
```bash
spexy task list <spec-id> --compact
spexy status --compact
spexy comment list <spec-id> --compact
spexy doc list --compact
spexy doctor --compact
```

---

## 🗺️ Future Roadmap & Planned Evolution

Track upcoming architectural milestones and planned enhancements:

- [x] **Multi-Agent Centralized Status Management & Worktree Auto-Blocking** *(Implemented in latest release - see commits `b03c20b` & `HEAD`)*:
  - Central repository hub coordination for multi-AI agent setups working concurrently across isolated Git worktrees.
  - Cross-worktree conflict prevention and active lease tracking (`spexy worktree allocate`).
- [x] **Official VS Code Extension Release**:
  - Embedded real-time dashboard webviews, sidebar trees for active specifications and pending comments, inline editor line comments.
- [ ] **Automated Test Report Ingestion**:
  - Seamless ingestion of test runner results (Vitest, Jest, Pytest) directly into task review submissions.
- [ ] **Interactive Visual Spec Generator**:
  - AI-assisted visual canvas to generate initial `requirements.md` and `design.md` from prompt briefs with human review checkpoints.

---

## 🛠️ CLI Command Reference Summary

| Command | Purpose |
| :--- | :--- |
| `spexy init` | Initialize `.spexy/` directory with steering templates and configuration |
| `spexy dashboard [--port N] [--logs]` | Launch the real-time local web UI (`http://127.0.0.1:4200`) with optional live server log output |
| `spexy logs [--lines N]` | Tail and view recent dashboard and server background logs from terminal |
| `spexy doctor` / `spexy check` | Comprehensive health check on specs, Zod schemas, steering, and DAG graph integrity |
| `spexy status` | Display workspace summary, steering status, and specification progress |
| `spexy spec create <id>` | Create a new specification with requirements, design, and task templates |
| `spexy spec list` | List all active specifications (`--compact` for token-killer output) |
| `spexy doc approve <path-or-id>` | Human approval of steering or spec documents (unlocks AI execution) |
| `spexy doc archive <path-or-id>` | Archive specifications or documents into `.spexy/archive/` |
| `spexy task list <spec>` | Display task graph in formatted table or `--compact` token-killer mode |
| `spexy task claim <spec> <id>` | Claim a task (`todo` $\to$ `in-progress`, enforces approval gate for agents) |
| `spexy task submit <spec> <id>` | Submit completed work for review (`in-progress` $\to$ `to-review`) |
| `spexy task approve <spec> <id>` | Approve task (**human only**, `to-review` $\to$ `done`) |
| `spexy task reject <spec> <id>` | Reject task with feedback (**human only**, `to-review` $\to$ `todo`) |
| `spexy comment add <spec>` | Add context-anchored line comment, task comment, or general comment |
| `spexy comment list <spec>` | List active review comments (`--compact` for token-killer output) |
| `spexy comment resolve <spec> <id>` | Resolve a review comment |
| `spexy checkpoint list` | List automatic rollback snapshots in the ring-buffer cache |
| `spexy checkpoint restore <id>` | Safely restore workspace state from a snapshot |
| `spexy worktree allocate <spec> <id>` | Allocate isolated Git worktree for an unblocked task with central conflict leasing |
| `spexy worktree clean` | Remove merged/stale agent worktrees and release active locks |

### CLI Help & Introspection
Every command and subcommand features built-in self-documenting help:
```bash
spexy --help
spexy doc --help
spexy task --help
spexy dashboard --help
```

For full CLI documentation, flags, and options, see [**`docs/CLI_REFERENCE.md`**](docs/CLI_REFERENCE.md).
For architectural details and monorepo structure, see [**`docs/ARCHITECTURE.md`**](docs/ARCHITECTURE.md).

---

## 📜 License

MIT © 2026 Saurabh Pardeshi
