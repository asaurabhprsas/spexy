# Spexy Architecture & System Overview

## Vision & Problem Statement
**Spexy** is a local-first, human-in-the-loop (HITL) Spec-Driven Development (SDD) orchestration platform. It establishes a verifiable, executable contract between human software architects and autonomous AI coding agents (Claude Code, Cursor, Codex, OpenHands).

## Core Architecture Pillars

### 1. Zero-Database, Local-First Persistence (`.spexy/`)
All project specifications, steering rules, task graphs, review comments, and backup snapshots reside inside the repository's `.spexy/` directory:
- `config.yaml`: Global workspace configuration, security gates, and server settings.
- `steering/`: Foundational steering documents (`product.md`, `tech.md`, `structure.md`) with YAML frontmatter.
- `specs/{feature-id}/`: Feature-specific requirements, technical designs, `tasks.yaml` DAG, and implementation logs.
- `.cache/`: Git-ignored local runtime cache containing active task leases (`worktrees.json`), ephemeral comments (`pending-comments.yaml`), and rolling snapshots (`checkpoints/`).

### 2. Steering-First Gate
Autonomous agents are strictly blocked from creating feature specs or executing tasks until all foundational steering documents are explicitly approved by a human architect (`status: approved`, `approved_by: "human"`).

### 3. Task Dependency Graph (DAG) & Availability Engine
Tasks are declared in a flat hierarchy with support for arbitrary cross-group dependencies. The engine rejects cyclic dependencies ($A \to B \to A$) and dynamically computes availability:
- `available`: All prerequisite dependencies are human-verified as `done`.
- `blocked`: One or more prerequisite dependencies have not yet reached `done`.
- `claimed`: Leased by an agent in an active worktree.
- `in-review`: Submitted by an agent awaiting human verification.
- `done`: Verified and approved by a human.

### 4. Two-Tier Human-in-the-Loop (HITL) State Machine
Autonomous coding agents can claim available tasks (`todo` $\to$ `in-progress`) and submit finished work (`in-progress` $\to$ `to-review`). However, an agent cannot transition any task to `done`. Only human verification can transition work to `done` or reject it back to `todo`.

### 5. Central Git Worktree Coordination & Auto-Blocking Leases
Using `findCentralProjectRoot` and Git common directory discovery (`git rev-parse --git-common-dir`), Spexy ensures the primary repository's `.spexy/` directory acts as the single source of truth across all worktree sessions. When an agent attempts to start a task already in progress by another worktree, the concurrency engine auto-blocks the operation (`TASK_LEASE_CONFLICT`) and recommends ready, independent DAG candidate tasks (`spexy task next`).

### 6. Bounded Checkpoint Ring-Buffer
Any change to `.spexy/` automatically creates a rolling backup in `.cache/checkpoints/` bounded to a maximum limit (default 20 snapshots per file). Errant AI writes can be rolled back with a single CLI command: `spexy checkpoint restore <id>`.

### 7. Multi-File Context-Anchored Comment Engine & Soft-Delete
Human reviewers and agents anchor line comments across specification documents and arbitrary source code files (`.ts`, `.py`, `.json`, etc.). Comments are queued in `.cache/pending-comments.yaml` with 3-line fuzzy context hashing to maintain accuracy as files shift. Soft-deleted comments transition to history with a 50-item retention cap and can be restored seamlessly via CLI or web dashboard.

## Monorepo Package Map
- `packages/core`: Pure TypeScript domain logic, Zod schemas, DAG validation, worktree lease manager, and `.spexy/` filesystem I/O.
- `packages/cli`: Single-binary CLI (`spexy`) and native Node.js HTTP & WebSocket server.
- `packages/ui`: Modern React dashboard with ClickUp-style hierarchical task list, `@dnd-kit` Kanban, Markdown comment inspector, and interactive SVG DAG visualizer.
- `packages/vscode-extension`: Official VS Code extension (`@workspace/spexy-vscode`) with native editor gutter comments (`vscode.comments`), tree view providers, and embedded dashboard webview.
- `skills/spexy`: Agent skill package (`SKILL.md`) installable via `npx skills add asaurabhprasad/spexy`.
- `docs/`: Authoritative technical specifications, API guides, and workflow documentation.
