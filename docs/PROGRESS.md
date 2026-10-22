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

- [x] **Phase 2: CLI Binary & Agent Skills (`@spec-flow/cli` & `skills/spec-flow`)**
  - [x] Commander CLI binary with all 14 commands (`init`, `status`, `spec`, `task`, `comment`, `checkpoint`, `dashboard`).
  - [x] `--json` agent output format on all read/write commands.
  - [x] `skills/spec-flow/SKILL.md` agent skill contract and reference manual.
  - [x] Globally installed local binary at `~/.local/bin/spec-flow`.

- [x] **Phase 3: Fastify/Bun Real-Time Server & Bi-Directional Watcher**
  - [x] Bun HTTP & WebSocket `/ws` server engine (`packages/cli/src/server/index.ts`).
  - [x] Chokidar file watcher with 100ms write-loop lock-token inhibitor.
  - [x] Real-time event broadcasting (`DOC_UPDATED`, `TASK_UPDATED`, `COMMENTS_UPDATED`, `FILE_CORRUPTED`).
  - [x] Static SPA fallback asset serving from pre-bundled assets.
  - [x] Full REST API endpoints supporting UI compatibility (`/api/dashboard`, `/api/documents/:id/approve`, `/api/comments`).

- [x] **Phase 4: Web UI Dashboard Views & Static Bundling (`packages/ui`)**
  - [x] Split-pane Document Inspector with floating *"Add Comment for AI"* text selection toolbar.
  - [x] Hierarchical Accordion Task List with subtask line connectors and security/testing notes.
  - [x] Interactive SVG DAG Dependency Graph with cycle prevention and status highlighting.
  - [x] `@dnd-kit` Kanban Board with role-guarded human verification modal for `done`.
  - [x] WebSocket auto-reconnect and React Query real-time cache invalidation (`useWebSocketSync.ts`).
  - [x] Pre-bundled build into `packages/cli/static`.
  - [x] 37/37 automated tests passing across core, CLI, and server suites.

## Remaining Enhancements & Future Scope

- [ ] **MCP Adapter Layer**: Expose `@spec-flow/core` operations as standard Model Context Protocol (MCP) tools for environments that prefer JSON-RPC over CLI.
- [ ] **Worktree UI Switcher**: Expose active Git worktree heartbeats and lease switches in the dashboard navbar.
- [ ] **Custom Template CLI Command**: Dedicated `spec-flow template apply <name>` to instantiate custom user spec scaffolds.
- [ ] **Headless E2E Browser Suite**: Playwright end-to-end testing validating browser clicks, text selection, and drag-and-drop.
