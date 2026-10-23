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

### 📊 Three-Way Synchronized Task Views
- **Kanban Board**: Drag-and-drop workflow across `todo`, `in-progress`, `to-review`, and `done` columns, complete with a dedicated blocked dependencies queue.
- **Hierarchical List View (ClickUp / Linear style)**: Parent tasks with collapsible subtask trees, subtask progress meters (e.g. `1/3 done`), priority indicators, and quick status action buttons.
- **DAG Dependency Visualizer**: Interactive node-based directed acyclic graph diagram showing prerequisite chains, dynamic availability, and topological execution order.

### 📝 Zero-Database & Transparent YAML Tasks
- All tasks are stored cleanly in human-readable `tasks.yaml` under `.spexy/specs/<spec-id>/`.
- Even when the dashboard is closed, human developers can easily inspect, track, and edit task graphs directly in their favorite code editor or Git diff.
- Complete version control: all tasks, specs, comments, and steering guidelines are committed directly to your repository.

### 🛡️ Two-Tier Human-in-the-Loop (HITL) State Machine
- **Role-Guarded Transitions**:
  ```
  [todo]  ──(agent: claim)──>  [in-progress]  ──(agent: submit)──>  [to-review]  ──(human: approve)──>  [done]
                                                                                └──(human: reject)───>  [todo]
  ```
- **Autonomous Safe Execution**: AI agents can claim tasks (`spexy task claim`) and submit them with implementation notes (`spexy task submit`), but **agents are strictly forbidden from approving tasks to `done`**.
- Only human reviewers can approve tasks to `done` or request changes back to `todo`.

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

- [ ] **Multi-Agent Centralized Status Management**:
  - Unified dashboard coordination for multi-AI agent setups working concurrently across isolated Git worktrees or remote agent environments.
  - Distributed task leases and real-time cross-worktree lock coordination to prevent merge collisions.
- [ ] **Automated Test Report Ingestion**:
  - Seamless ingestion of test runner results (Vitest, Jest, Pytest) directly into task review submissions.
- [ ] **Interactive Visual Spec Generator**:
  - AI-assisted visual canvas to generate initial `requirements.md` and `design.md` from prompt briefs with human review checkpoints.

---

## 🛠️ CLI Command Reference Summary

| Command | Purpose |
| :--- | :--- |
| `spexy init` | Initialize `.spexy/` directory with steering templates and configuration |
| `spexy dashboard` | Launch the real-time local web UI (`http://127.0.0.1:4200`) |
| `spexy doctor` | Run comprehensive health check on specs, schemas, and DAG graph integrity |
| `spexy status` | Display workspace summary, steering status, and specification progress |
| `spexy spec create <id>` | Create a new specification with requirements, design, and task templates |
| `spexy spec list` | List all active specifications (`--compact` for token-killer output) |
| `spexy task list <spec>` | Display task graph in formatted table or `--compact` token-killer mode |
| `spexy task claim <spec> <id>` | Claim a task (`todo` $\to$ `in-progress`) |
| `spexy task submit <spec> <id>` | Submit completed work for review (`in-progress` $\to$ `to-review`) |
| `spexy task approve <spec> <id>` | Approve task (**human only**, `to-review` $\to$ `done`) |
| `spexy task reject <spec> <id>` | Reject task with feedback (**human only**, `to-review` $\to$ `todo`) |
| `spexy comment add <spec>` | Add context-anchored line comment on requirements or design |
| `spexy comment list <spec>` | List active review comments (`--compact` for token-killer output) |
| `spexy comment resolve <spec> <id>` | Resolve a review comment |
| `spexy checkpoint list` | List automatic rollback snapshots in the ring-buffer cache |
| `spexy checkpoint restore <id>` | Safely restore workspace state from a snapshot |

For full CLI documentation, flags, and options, see [**`docs/CLI_REFERENCE.md`**](docs/CLI_REFERENCE.md).

---

## 📁 Repository Layout

```text
spexy/
├── packages/
│   ├── core/              # Domain logic, Zod schemas, DAG engine, and filesystem I/O
│   ├── cli/               # Single-binary CLI (`spexy`) and HTTP/WebSocket server
│   └── ui/                # React 19 SPA dashboard (Shadcn UI, Tailwind, Lucide, @dnd-kit)
├── skills/
│   └── spexy/             # Portable Agent Skill (SKILL.md) for Claude Code, Cursor, Antigravity
├── templates/             # Starter templates for steering documents and specifications
├── docs/                  # In-depth architectural and developer documentation
│   ├── ARCHITECTURE.md    # System architecture and domain model
│   ├── CLI_REFERENCE.md   # Complete CLI manual and command guide
│   ├── WORKFLOW_GUIDE.md  # SDD stages, branching, and commit conventions
│   ├── API_REFERENCE.md   # REST and WebSocket API contracts
│   └── DASHBOARD_GUIDE.md # Web dashboard feature manual
└── AGENTS.md              # AI agent operating directives and rules
```

---

## 📜 License

MIT © 2026 Saurabh Pardeshi
