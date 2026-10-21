# Spec-Flow Architecture & System Overview

## Vision & Problem Statement
**Spec-Flow** is a local-first, human-in-the-loop (HITL) Spec-Driven Development (SDD) orchestration platform. It establishes a verifiable, executable contract between human software architects and autonomous AI coding agents (Claude Code, Cursor, Codex, OpenHands).

## Core Architecture Pillars

### 1. Zero-Database, Local-First Persistence (`.specflow/`)
All project specifications, steering rules, task graphs, review comments, and backup snapshots reside inside the repository's `.specflow/` directory:
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

### 5. Git Worktree Awareness & Task Leases
By detecting the Git common directory (`git rev-parse --git-common-dir`), Spec-Flow enables concurrent agents to operate across multiple Git worktrees without split-brain state drift. Claimed tasks are locked with lease metadata (`worktree`, `branch`, `locked_at`), preventing concurrency conflicts.

### 6. Bounded Checkpoint Ring-Buffer
Any change to `.specflow/` automatically creates a rolling backup in `.cache/checkpoints/` bounded to a maximum limit (default 20 snapshots per file). Errant AI writes can be rolled back with a single CLI command: `spec-flow checkpoint restore <id>`.

### 7. Ephemeral Context-Anchored Comment Engine
Human reviewers highlight arbitrary lines across specification documents. Comments are queued in `.cache/pending-comments.yaml` with 3-line fuzzy context hashing, allowing highlights to stay accurate even when documents are modified. Once addressed and resolved, comments are automatically purged to keep the repository clean.

## Monorepo Package Map
- `packages/core`: Pure TypeScript domain logic, Zod schemas, DAG validation, and `.specflow/` filesystem I/O.
- `packages/cli`: Single-binary CLI (`spec-flow`) and Fastify WebSocket server.
- `packages/ui`: Modern React dashboard with `@dnd-kit` Kanban, Monaco/CodeMirror comment inspector, hierarchical task tree, and interactive SVG DAG viewer.
- `skills/spec-flow`: Agent skill package (`SKILL.md`) installable via `npx skills add ./skills/spec-flow`.
- `docs/`: Persistent project documentation and milestone progress tracking.
