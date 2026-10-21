# Spec-Flow Milestones & Progress Tracker

## Milestone Status Overview

- [x] **Phase 1: Domain Core & Local Filesystem Engine (`@spec-flow/core`)**
  - [x] Zod schemas for `config.yaml`, `tasks.yaml`, `pending-comments.yaml`, and frontmatter.
  - [x] DAG cycle detection ($A \to B \to A$) and dependency resolution.
  - [x] Two-tier HITL state machine with strict agent role guards.
  - [x] Atomic disk writes (`.tmp` $\to$ rename) to prevent file corruption.
  - [x] Bounded checkpoint ring-buffer engine (`.cache/checkpoints/` max 20).
  - [x] Fuzzy 3-line context anchor hasher for comment resynchronization.
  - [x] Git worktree common directory resolver & lease locks.
  - [x] 12/12 unit tests passing in Bun test suite.

- [x] **Monorepo Cleanup & Reorganization**
  - [x] Decommissioned database and legacy `artifacts/api-server`.
  - [x] Clean packages layout: `packages/core`, `packages/cli`, `packages/ui`, `skills/spec-flow`.
  - [x] Cloned shadcn UI components and design system into `packages/ui`.

- [ ] **Phase 2: CLI Binary & Agent Skills (`@spec-flow/cli` & `skills/spec-flow`)** *(In Progress via Subagent)*
  - [ ] Commander CLI binary with all 14 commands (`init`, `status`, `spec`, `task`, `comment`, `checkpoint`, `dashboard`).
  - [ ] `--json` agent output format on all read commands.
  - [ ] `skills/spec-flow/SKILL.md` agent skill contract.

- [ ] **Phase 3: Fastify Real-Time Server & Bi-Directional Watcher** *(In Progress via Subagent)*
  - [ ] Fastify HTTP and WebSocket `/ws` server.
  - [ ] Chokidar file watcher with 100ms write-loop lock token.
  - [ ] Real-time event broadcasting and static dashboard asset serving.

- [ ] **Phase 4: Web UI Dashboard Views & Static Bundling (`@spec-flow/ui`)** *(In Progress via Subagent)*
  - [ ] Split-pane Document Inspector with floating *"Add Comment for AI"* button.
  - [ ] Hierarchical Accordion Task List with subtask connectors.
  - [ ] Interactive SVG DAG Dependency Graph.
  - [ ] `@dnd-kit` Kanban Board connected to WebSocket.
  - [ ] Pre-bundled build into `packages/cli/static`.
