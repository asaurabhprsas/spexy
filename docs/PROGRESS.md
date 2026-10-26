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

- [x] **Phase 3: Node.js Native HTTP & WebSocket Server & Bi-Directional Watcher**
  - [x] Native Node.js HTTP & WebSocket `/ws` server engine (`packages/cli/src/server/index.ts`).
  - [x] Chokidar file watcher with write-loop lock-token inhibitor and FIFO promise write mutex.
  - [x] Real-time event broadcasting (`DOC_UPDATED`, `TASK_UPDATED`, `SPEC_FILES_UPDATED`, `DOC_ARCHIVED`, `LOG_EVENT`, `COMMENTS_UPDATED`).
  - [x] Multi-spec task aggregation endpoints (`/api/tasks`, `/api/specs/all/tasks`).
  - [x] Human manual status overrides and backwards transitions (`set_status`).
  - [x] User preferences API with dual persistence (`localStorage` + `.spexy/config.json`).

- [x] **Phase 4: Web UI Dashboard Views & Static Bundling (`packages/ui`)**
  - [x] ClickUp-style hierarchical task list with collapsible subtasks and progress indicators.
  - [x] True topological SVG DAG dependency graph with rank-based columns, cubic bezier curves, and node highlight chains.
  - [x] `@dnd-kit` Kanban Board with backwards drag-and-drop transitions and dedicated blocked dependencies queue.
  - [x] In-place edge-to-edge Document Inspector expansion with route persistence.
  - [x] Markdown source mode with line numbers, top save button, and context-anchored commenting toolbar.
  - [x] Theme manager featuring popular themes (Tokyo Night, Catppuccin, Gruvbox, Nord, Dracula) and custom typography.
  - [x] Settings management page for appearance and workflow defaults.
  - [x] Comprehensive documentation in `docs/` (`ARCHITECTURE.md`, `CLI_REFERENCE.md`, `API_REFERENCE.md`, `WORKFLOW_GUIDE.md`, `DASHBOARD_GUIDE.md`).

- [x] **Phase 5: Worktrees Concurrency, VS Code Extension, Multi-File Comments & Strict Type Safety**
  - [x] Git worktree auto-blocking engine (`findCentralProjectRoot`, `acquireTaskLease`, `TASK_LEASE_CONFLICT`) with DAG candidate recommendations (`spexy task next`).
  - [x] Worktree registry command (`spexy worktree list`) and status indicators.
  - [x] Context-anchored review comments on arbitrary repo files (`spexy comment add --file ... --instruction ... --line ... --snippet ... --type ...`).
  - [x] Comments soft-delete with 50-item retention cap and restore capability (`POST /api/comments/:id/restore`).
  - [x] Task Composer smart next ID sequence engine (`computeSmartId`) with comprehensive unit tests.
  - [x] Official VS Code Extension (`packages/vscode-extension`) with native comment controller (`vscode.comments`), tree view providers, and embedded dashboard webview.
  - [x] Comprehensive TypeScript strictness audit (elimination of `any` types across CLI, Core, UI, and extension packages).
  - [x] Complete test suite passing with 87 unit and integration tests across 4 packages.
