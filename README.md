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
5. **Instant Live Dashboard**: Real-time ClickUp-style hierarchical tasks, Kanban board, DAG visualizer, and inline document editor.
6. **Token-Optimized Skills**: Lightweight TDD skill pack with a CLI proxy, eliminating heavy, memory-hungry MCP servers.

---

## ⚡ Quickstart

Get up and running in seconds with the Spexy CLI:

### 1. Install Spexy CLI
```bash
npm install -g spexy-cli
```

### 2. Install Agent Skills
Equip your AI agent (Claude Code, Cursor, Antigravity, OpenHands) with the Spexy SDD skill pack:
```bash
npx skills add asaurabhprsas/spexy
```

### 3. Initialize Your Workspace
Run `spexy init` in your project root to generate the constitutional steering corpus (`product.md`, `tech.md`, `structure.md`) and directory structure:
```bash
spexy init
```

### 4. Launch the Interactive Dashboard
Launch the real-time local web dashboard at `http://127.0.0.1:4200`:
```bash
spexy dashboard
```

---

## 🌟 Key Features

### 🖥️ Real-Time Interactive Dashboard & Unified Workspace
- **Executive Overview**: Minimalist high-signal dashboard displaying steering approval gates, spec counts, task completion rates, execution pulse bars, and active comments.
- **Direct Document Editing & Live Preview**: Edit steering documents and feature specs directly inside the dashboard with synchronized, real-time rendered markdown preview.
- **Filtered Document Explorer (`/documents`)**: Filter documents across scope (`All`, `Steering`, `Specs`), specific specifications, and sub-types (`Requirements`, `Design`), backed by instant full-text search.
- **Instant Live Updates**: Built-in file watcher and WebSocket server automatically broadcast file changes to the UI instantaneously with zero manual polling.

### 💬 Unified Comments & Directive Review Queue (`/comments`)
- **Dedicated Comments Page**: Centralized view for review directives across constitutional steering, specification documents, tasks, and unanchored workspace feedback.
- **Inline Directive Composer**: Sleek composer with auto-expanding textarea, file attachments, author toggle (`Human` / `Agent`), and `Ctrl+Enter` shortcut.
- **Streamlined Status & Filter Toolbar**: Status tabs (`Pending`, `All`, `Resolved`, `Deleted`) with live counters, target selector (`Directives`, `Steering`, `Specs`, `Tasks`), spec dropdown, author filter, and instant reset.
- **Soft-Deletion with Retention Cap**: Deleting a comment moves it to history with status `"deleted"` rather than permanent loss. Automatically enforces a FIFO cap of **maximum 50 deleted comments** (`MAX_DELETED_RETENTION = 50`), while pending comments remain completely unlimited.
- **Deferred Attachments & 1-Click Promotion**: Files staged in `.temp/` during review discussions can be permanently promoted to repository assets with 1 click ("Keep in repo").

### 📊 Three-Way Synchronized Task Views & Smart Task Composer
- **Hierarchical List View (ClickUp / Linear Style)**:
  - Multi-level nested task hierarchies (`parent_id`) with progress badges, visual completion meters, priority chips, and quick action menus.
  - Direct 1-click subtask creation (`+ Subtask`) on any parent or child task.
- **Enhanced Task Composer (`TaskComposerSheet`)**:
  - **Pre-selected Spec**: Automatically pre-selects the active specification from `/tasks`, dynamically re-syncing groups, parent tasks, and dependencies.
  - **Smart Auto-Generated Task IDs**:
    - *Parent task selected*: Scans parent subtasks and auto-suggests `<parentId>.<availableNumber>` (e.g. `1.1` $\to$ `1.1.1` or next unused `1.1.2`).
    - *No parent selected*: Auto-suggests next group-level ID (e.g. group 2 with tasks `2.1`, `2.2` $\to$ `2.3`).
  - **Searchable Selects & Multi-Select**: Popover dropdowns with real-time text search for Specifications, Groups, Parent tasks, and `depends_on` dependencies (with checkbox toggles and removable chip badges).
- **Kanban Board**: Drag-and-drop workflow across `todo`, `in-progress`, `to-review`, and `done` columns, complete with a dedicated blocked dependencies queue.
- **DAG Dependency Visualizer**: Interactive node-based graph showing prerequisite chains, dynamic availability, and topological execution order. Includes canvas zoom in/out/reset controls and captured keyboard shortcuts (`Ctrl/Cmd + +`, `Ctrl/Cmd + -`, `Ctrl/Cmd + 0`, `Ctrl + Wheel`).

### ⚙️ Developer Settings & Browser vs Repo Config Isolation
- **Dual Storage Targets**:
  - **Browser Local (`localStorage`) [Default]**: Keeps all theme selections, font configurations, dark/light modes, and layout preferences private to the browser. **Zero automatic writes to `.spexy/config.json`**, keeping repository Git status completely clean.
  - **Project Repository (`.spexy/config.json`)**: Persists configuration directly to version control for team sharing.
- **Bi-Directional Synchronization**:
  - **"Sync to Local / Browser"**: Pulls repo configuration from `/api/preferences` into the browser profile.
  - **"Sync to Project Repo"**: Pushes browser preferences to `.spexy/config.json` on demand.

### 🛡️ Spec Approval Gate & Two-Tier HITL Safety
- **Drafting Freedom with AI Guardrails**:
  - Architects can generate and decompose tasks into `tasks.yaml` even while `requirements.md` and `design.md` are in `draft` mode.
  - However, **AI agents (`--actor agent`) are strictly blocked** from claiming or starting tasks until human architects formally approve the steering guidelines, requirements, and design docs via `spexy doc approve <spec-id>`.
- **Role-Guarded State Transitions**:
  ```
  [todo]  ──(agent: claim)──>  [in-progress]  ──(agent: submit)──>  [to-review]  ──(human: approve)──>  [done]
                                                                                └──(human: reject)───>  [todo]
  ```
- **Autonomous Safe Execution**: AI agents can claim unblocked tasks (`spexy task claim`) and submit them with implementation notes (`spexy task submit`), but **agents are strictly forbidden from approving tasks to `done`**. Only human reviewers can approve tasks or request revisions.

### 📜 Immutable Audit Trail (`implementation.log`)
- Every task transition (`claim`, `submit`, `approve`, `reject`, `set_status`), document edit, and file upload is automatically recorded to `.spexy/specs/<spec-id>/implementation.log`.
- Tracks exact ISO timestamps, actors (`human` or `agent`), Git worktrees, and review feedback notes.

### 🚀 Lightweight TDD Skills vs Heavy MCP
- **Zero Heavy MCP Overhead**: Rather than running bloated MCP server daemons that waste system memory and clutter LLM context windows, Spexy provides a fast, native single-binary CLI and portable Agent Skills (`SKILL.md`).
- **Equip Your Agent with Skills**:
  ```bash
  npx skills add asaurabhprsas/spexy
  ```
- **Test-Driven Development (TDD) Core**: Encourages agents to write failing tests first, implement minimal code to pass, and verify before submitting.
- **Token Killer CLI Modes**:
  ```bash
  spexy task list <spec-id> --compact
  spexy status --compact
  spexy comment list <spec-id> --compact
  spexy doc list --compact
  spexy doctor --compact
  ```

---

## 🚧 Features in Progress & Status

### 🧩 Official VS Code Extension `[@workspace/spexy-vscode]`
> **Status: 🟡 Work in Progress / Active Development (v0.1.1)**

The VS Code extension brings the Spexy Spec-Driven Development lifecycle into your editor sidebar and gutters. While functional in developer builds, it is actively evolving:

- **What's Implemented**:
  - **Sidebar Tree Views**: Dedicated panels for Constitutional Steering, Specifications & Tasks, Comments, and Quick Actions.
  - **Comments Explorer**: Filter toggle between `Pending`, `Reviewed` (resolved history), and `All` comments.
  - **Click-to-Navigate**: Clicking any comment in the tree opens the exact file location in the editor, auto-centering on the anchored line (supports code files, steering docs, spec docs, and task YAML).
  - **Comment Review Widget**: Integrated "Save Comment" and "Cancel" buttons (`comments/commentThread/context`), plus inline resolve and dismiss actions.
  - **Embedded Webviews**: Open full interactive dashboard, Kanban board, task list, or DAG viewer directly inside VS Code tabs.
  - **Daemon Lifecycle**: Background dashboard server auto-started and managed by the extension.
- **Remaining Work for Finalization**:
  - Official VS Code Marketplace release packaging & automated CI publishing.
  - Direct test runner report ingestion (Vitest/Jest) into task review submission sheets.
  - Multi-root workspace support refinements.

---

### 🌿 Git Worktree Multi-Agent Coordination
> **Status: 🟡 Work in Progress / Experimental Phase**

Spexy includes a zero-database concurrency lease engine to allow multiple parallel AI agents or human developers to execute independent tasks simultaneously in separate Git worktrees (`git worktree`) without branch collisions or dirty workspace corruption:

- **What's Implemented**:
  - **Zero-Config Root Resolution (`findCentralProjectRoot`)**: The CLI and server resolve the primary repository root automatically using native Git common directory resolution (`git rev-parse --git-common-dir`). **No hardcoded paths, environment variables, or pre-worktree copy scripts are required.**
  - **Task Concurrency Leases**: Claiming a task (`spexy task claim <spec> <id> --actor agent`) locks the task to that worktree in `.spexy/.cache/worktrees.json`. Concurrent claim attempts by other worktrees immediately throw `TASK_LEASE_CONFLICT`.
  - **CLI from Worktrees**: Running CLI commands (`spexy status`, `spexy doctor`, `spexy dashboard`) from inside any sub-worktree operates against the central project repository seamlessly.
- **Remaining Work for Finalization**:
  - Automated ephemeral worktree lifecycle management commands (`spexy worktree allocate` and `spexy worktree clean` turnkey wrappers).
  - Cross-worktree branch merge validation hooks before approving tasks to `done`.

---

## 🛠️ CLI Command Reference Summary

| Command | Purpose |
| :--- | :--- |
| `spexy init` | Initialize `.spexy/` directory with steering templates and configuration |
| `spexy dashboard [--port N] [--logs]` | Launch the real-time local web UI (`http://127.0.0.1:4200`) with live server logs |
| `spexy logs [--lines N]` | Tail and view recent dashboard and server background activity logs |
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
| `spexy comment add <spec>` | Add context-anchored line comment, task comment, or general directive |
| `spexy comment list <spec>` | List active review comments (`--compact` for token-killer output) |
| `spexy comment resolve <spec> <id>` | Resolve a review comment |
| `spexy checkpoint list` | List automatic rollback snapshots in the ring-buffer cache |
| `spexy checkpoint restore <id>` | Safely restore workspace state from a snapshot |
| `spexy worktree list` | List registered Git worktrees and active task concurrency leases |

---

## 📜 License

MIT © 2026 Saurabh Pardeshi
