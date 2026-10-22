# Spexy

> **Local-First, Human-in-the-Loop Spec-Driven Development (SDD) Orchestration Platform for Autonomous AI Agents and Software Architects.**

[![TypeScript](https://img.shields.io/badge/TypeScript-7.0-blue.svg)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.3-black.svg)](https://bun.sh/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Zero-Database](https://img.shields.io/badge/Database-Zero--DB%20Git--Native-purple.svg)](#zero-database-local-first-architecture)
[![Token-Killer](https://img.shields.io/badge/Token%20Killer-80%25%20Savings-orange.svg)](#token-killer-cli-modes)

---

## 💡 What is Spexy?

Autonomous AI coding agents (Claude Code, Cursor, Codex, OpenHands) write code fast, but left unconstrained, they often drift from architecture guidelines, hallucinate dependencies, and produce merge conflicts.

**Spexy** solves this by establishing a verifiable, machine-executable contract between human software architects and AI agents:
1. **Constitution First**: Guarantees technical, product, and structural boundaries before a single line of feature code is written.
2. **DAG-Driven Workflow**: Decomposes features into atomic, directed acyclic graphs of tasks with dynamic prerequisite checking.
3. **Two-Tier HITL Safety**: Agents claim and submit tasks, but **only humans can approve tasks as done**.
4. **Zero-Database**: 100% stored in version-controlled markdown and YAML files inside `.spexy/`.
5. **Token-Optimized**: CLI compact modes that strip fluff and cut LLM context consumption by up to 80%.

---

## ⚡ Quickstart

### 1. Install Spexy Agent Skill
Equip your AI coding agent (Claude Code, Cursor, Antigravity, OpenHands, etc.) with the Spexy SDD skill pack in any workspace:
```bash
npx skills add asaurabhprsas/spexy
# or with pnpm:
pnpx skills add asaurabhprsas/spexy
```

### 2. Global Installation & Initialization
```bash
# Clone the repository
git clone https://github.com/asaurabhprsas/spexy.git && cd spexy

# Build and link the CLI locally
bun install
bun run publish:local

# Initialize a workspace
spexy init
```

### 3. Workspace Health Diagnostic
Run the built-in doctor command to audit specifications, schemas, and DAG graph dependencies:
```bash
spexy doctor
# Or token-compact mode for AI agents:
spexy doctor --compact
```

### 4. Launch the Interactive Dashboard
Launch the real-time web dashboard running locally at `http://127.0.0.1:4200`:
```bash
spexy --dashboard
```

---

## 🌟 Key Capabilities

### 🗃️ Zero-Database, Local-First Architecture
All specifications, task graphs, review comments, and rollback checkpoints live directly in your repository:
- `.spexy/steering/`: Foundational constitution (`product.md`, `tech.md`, `structure.md`).
- `.spexy/specs/{feature}/`: Feature requirements, technical designs, `tasks.yaml` DAG, and reference assets.
- `.spexy/archived/`: Safe document archiving engine for superseded or discarded specs.
- `.spexy/.cache/`: Git-ignored ring-buffer snapshots (`checkpoints/`) and ephemeral task leases.

### 🛡️ Steering Gate & Two-Tier HITL State Machine
- **Steering Approval Gate**: Autonomous agents are blocked from creating feature specs until a human architect explicitly approves all steering documents.
- **Role-Guarded Transitions**:
  ```
  [todo]  ──(agent: claim)──>  [in-progress]  ──(agent: submit)──>  [to-review]  ──(human: approve)──>  [done]
                                                                                └──(human: reject)───>  [todo]
  ```
  - Agents can claim and submit work, but **cannot approve tasks to done**.
  - Human operators can also manually override and transition tasks backwards in case of accidental status changes.

### 📊 ClickUp-Style Tasks, Kanban & Real-Time DAG
The dashboard (`/tasks`) offers three synchronized views:
1. **Hierarchical List (ClickUp / Linear style)**: Parent tasks with collapsible subtask trees, subtask progress badges (e.g. `3 subtasks • 1/3 done`), priority tags, and transition action triggers.
2. **Kanban Board**: Drag-and-drop workflow with backwards transitions and a dedicated "Blocked Dependencies" queue.
3. **DAG Dependency Visualizer**: Interactive topological SVG graph with rank columns, smooth cubic-bezier connectors, and bidirectional dependency chain highlighting.

### ✂️ Token Killer CLI Modes
When AI agents query task lists, steering docs, or review comments, passing raw prose wastes thousands of expensive context tokens. Spexy includes token-optimized CLI modes:
```bash
spexy task list demo-spec --compact
spexy status --compact
spexy comment list demo-spec --compact
```

### 📝 Context-Anchored Line Comments
- Reviewers click any line in the document inspector to pin review feedback for AI agents.
- 3-line fuzzy hash realigns comments even when text or code shifts.
- Comments are resolvable via CLI or dashboard, with full resolution history archiving.

### 🎨 Themes & Customization
- Built-in popular theme palettes: Tokyo Night, Catppuccin, Gruvbox, Nord, Dracula, and GitHub Light/Dark.
- Popular monospace and sans-serif fonts: Inter, JetBrains Mono, Fira Code, and Geist.
- In-place full-width expansion with cross-route state persistence.

---

## 📁 Monorepo Layout

```text
spexy/
├── packages/
│   ├── core/              # Domain logic, Zod schemas, DAG engine, and filesystem I/O
│   ├── cli/               # Single-binary CLI (`spexy`) and Fastify WebSocket server
│   └── ui/                # React 19 SPA dashboard (Shadcn UI, Tailwind, Lucide, @dnd-kit)
├── skills/
│   └── spexy/         # Agent skill pack (SKILL.md) for Claude Code, Cursor, and Antigravity
├── templates/             # Turnkey bullet-point templates (steering & specs)
├── docs/                  # Persistent project documentation
│   ├── ARCHITECTURE.md    # System architecture and domain model
│   ├── CLI_REFERENCE.md   # Complete CLI manual and command guide
│   ├── WORKFLOW_GUIDE.md  # SDD stages, branching, and commit conventions
│   ├── API_REFERENCE.md   # REST and WebSocket API contracts
│   └── DASHBOARD_GUIDE.md # Web dashboard feature manual
└── AGENTS.md              # AI agent operating directives and rules
```

---

## 🤖 AI Agent Workflow

Autonomous agents executing tasks in this repository follow standard conventional patterns:
1. **Branch Naming**: `feature/<spec-id>/<task-id>` (e.g., `feature/demo-spec/2.1`)
2. **Commit Pattern**: `feat(<spec-id>): <task-title> (refs #<task-id>)`
3. **Pre-Flight Verification**: Run `spexy doctor` before committing or submitting tasks.

For detailed guidelines, see [**`AGENTS.md`**](AGENTS.md) and [**`docs/WORKFLOW_GUIDE.md`**](docs/WORKFLOW_GUIDE.md).

---

## 📜 License

MIT © 2026 Saurabh Pardeshi
