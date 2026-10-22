# Spexy Milestones & Progress Tracker

## Milestone Status Overview

- [x] **Phase 1: Domain Core & Local Filesystem Engine (`@spexy/core`)**
  - [x] Zod schemas for `config.yaml`, `tasks.yaml`, `pending-comments.yaml`, and frontmatter.
  - [x] DAG cycle detection ($A \to B \to A$) and dependency resolution.
  - [x] Two-tier HITL state machine with strict agent role guards.
  - [x] Atomic disk writes (`.tmp` $\to$ rename) to prevent file corruption.
  - [x] Bounded checkpoint ring-buffer engine (`.cache/checkpoints/` max 20).
  - [x] Fuzzy 3-line context anchor hasher for comment resynchronization.
  - [x] Git worktree common directory resolver & lease locks.
  - [x] Document archiving engine with collision handling (`.spexy/archived/`).
  - [x] Turnkey templates and actionable agent prompts.

- [x] **Phase 2: CLI Binary & Token Optimization Engine (`@spexy/cli`)**
  - [x] Commander CLI binary with all commands (`init`, `status`, `spec`, `task`, `comment`, `checkpoint`, `doc archive`, `doctor`, `check`, `serve`).
  - [x] Token Killer compact mode (`--compact`) cutting up to 80% tokens on status, tasks, docs, and comments.
  - [x] Health diagnostic tool (`spexy doctor` / `check`) validating steering, specs, schemas, and graph topology.
  - [x] `skills/spexy/SKILL.md` agent skill contract and reference manual.
  - [x] Globally installed local binary at `~/.local/bin/spexy`.

- [x] **Phase 3: Fastify/Bun Real-Time Server & Bi-Directional Watcher**
  - [x] Bun HTTP & WebSocket `/ws` server engine (`packages/cli/src/server/index.ts`).
  - [x] Chokidar file watcher with write-loop lock-token inhibitor.
  - [x] Real-time event broadcasting (`DOC_UPDATED`, `TASK_UPDATED`, `SPEC_FILES_UPDATED`, `DOC_ARCHIVED`, `LOG_EVENT`).
  - [x] Multi-spec task aggregation endpoints (`/api/tasks`, `/api/specs/all/tasks`).
  - [x] Human manual status overrides and backwards transitions (`set_status`).
  - [x] User preferences API with persistence in `.spexy/config.json`.

- [x] **Phase 4: Web UI Dashboard Views & Static Bundling (`packages/ui`)**
  - [x] ClickUp-style hierarchical task list with collapsible subtasks and progress indicators.
  - [x] True topological SVG DAG dependency graph with rank-based columns, cubic bezier curves, and node highlight chains.
  - [x] `@dnd-kit` Kanban Board with backwards drag-and-drop transitions and dedicated blocked dependencies queue.
  - [x] In-place edge-to-edge Document Inspector expansion with route persistence.
  - [x] Markdown source mode with line numbers, top save button, and context-anchored commenting toolbar.
  - [x] Theme manager featuring popular themes (Tokyo Night, Catppuccin, Gruvbox, Nord, Dracula) and custom typography.
  - [x] Settings management page for appearance and workflow defaults.
  - [x] Comprehensive documentation in `docs/` (`ARCHITECTURE.md`, `CLI_REFERENCE.md`, `API_REFERENCE.md`, `WORKFLOW_GUIDE.md`, `DASHBOARD_GUIDE.md`).
