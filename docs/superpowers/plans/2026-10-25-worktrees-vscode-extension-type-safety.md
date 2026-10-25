# Worktree Auto-Blocking, VSCode Extension & TypeScript Strictness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide centralized multi-worktree task concurrency control with auto-blocking, an official Spexy VSCode extension with native inline commenting across all repo files, and complete TypeScript strictness audit replacing `any` types.

**Architecture:** 
1. Git worktrees share central repository `.spexy` coordination (`findCentralProjectRoot`), auto-blocking claimed tasks with lease detection and recommending unblocked DAG tasks (`spexy task next`).
2. VS Code Extension package (`packages/vscode-extension`) integrating VS Code's `CommentController` to anchor inline comments on any repo file into `.spexy/comments/pending-comments.yaml`, coupled with Webview Dashboard integration.
3. Strict typed error handling (`unknown` + `getErrorMessage`), schema-backed API payloads, and elimination of `any` types across CLI, Core, and UI packages.

**Tech Stack:** TypeScript (strict mode), Node.js, VSCode Extension API (`vscode`), Commander.js, Zod, Vitest.

**Spec:** Referenced from user request and Spexy architecture docs (`docs/ARCHITECTURE.md`, `docs/CLI_REFERENCE.md`).

## Global Constraints
- Token efficiency first: use `rtk` prefix for commands, compact responses for CLI queries.
- Zero data loss: central `.spexy` directory in primary repository root must remain source of truth during worktree concurrency.
- Human-in-the-loop: Agents can claim (`in-progress`) and submit (`to-review`), only humans approve (`done`).
- No arbitrary `any` types: Use strict domain types or `unknown` with runtime type narrowing.
- Top-level tests only for critical paths; avoid unnecessary micro-tests.

## Review Focus
1. Worktree claiming a task that is already in progress by another worktree fails with a clear blocking error and recommends candidate independent tasks.
2. Central repository `.spexy/` remains consistent when multiple worktrees read/write tasks and comments.
3. `spexy comment add` correctly writes inline comments on arbitrary repository files with line ranges and snippet context.
4. VS Code extension registers comment controller and synchronizes comments with `.spexy/comments/pending-comments.yaml`.
5. TypeScript typecheck passes strictly with `any` removed from error handling and API surfaces.

---

### Task 1: Central Worktree Coordination & Auto-Blocking Engine

**Files:**
- Modify: `packages/core/src/fs/workspace.ts`
- Modify: `packages/core/src/git/worktree.ts`
- Modify: `packages/core/src/dag/workflow.ts`
- Modify: `packages/cli/src/bin.ts`
- Test: `packages/core/src/core.test.ts`
- Test: `packages/cli/src/cli.test.ts`

**Steps:**
- [ ] Add `findCentralProjectRoot(cwd?: string): string` to `packages/core/src/fs/workspace.ts` which inspects `git rev-parse --git-common-dir` and returns primary repository root even when inside a linked worktree.
- [ ] Enhance `acquireTaskLease` in `packages/core/src/git/worktree.ts` to inspect task status and leases across all worktrees. If task is already `in-progress` or leased:
  - Throw `TASK_LEASE_CONFLICT` containing active lease holder, worktree, branch, and timestamp.
  - Expose helper `getAlternativeAvailableTasks(projectRoot: string, specId: string, currentTaskId: string)` returning list of ready, unblocked tasks from the DAG.
- [ ] Update `packages/cli/src/bin.ts`:
  - `spexy task start <task-id>`: catch `TASK_LEASE_CONFLICT`, print detailed blocker banner and list alternative independent available tasks.
  - Add `spexy task next [spec-id]`: command to automatically recommend the next ready-to-claim task.
  - Add `spexy worktree list`: command to list registered worktrees and their active leases.
- [ ] Add integration test in `packages/core/src/core.test.ts` and `packages/cli/src/cli.test.ts` verifying worktree auto-blocking and alternative task suggestions.
- [ ] Verify test suite: `rtk pnpm test`.

---

### Task 2: Inline File Commenting CLI & Core Support

**Files:**
- Modify: `packages/core/src/schemas/comments.ts`
- Modify: `packages/core/src/comments/fuzzy-anchor.ts`
- Modify: `packages/cli/src/bin.ts`
- Test: `packages/cli/src/cli.test.ts`

**Steps:**
- [ ] Update `packages/core/src/schemas/comments.ts` to allow `target_type: z.enum(["document", "task", "general", "spec", "code", "file"])` so comments can target any source code file (`.ts`, `.py`, `.json`, etc.).
- [ ] Add `spexy comment add` command to `packages/cli/src/bin.ts` with options:
  - `--file <path>` (arbitrary file in repository)
  - `--instruction <text>`
  - `--line <start[-end]>` (optional line range)
  - `--snippet <text>` (optional code excerpt)
  - `--type <type>` (default `file` or `document`)
  - `--author <author>` (default `human`)
- [ ] Add tests in `packages/cli/src/cli.test.ts` verifying inline comments on arbitrary files and querying them via `spexy comment list --compact`.
- [ ] Verify test suite: `rtk pnpm test`.

---

### Task 3: VS Code Extension Scaffold & Comment Controller

**Files:**
- Create: `packages/vscode-extension/package.json`
- Create: `packages/vscode-extension/tsconfig.json`
- Create: `packages/vscode-extension/src/extension.ts`
- Create: `packages/vscode-extension/src/comments.ts`
- Create: `packages/vscode-extension/src/tree.ts`
- Create: `packages/vscode-extension/src/dashboard.ts`
- Modify: `package.json` (root build & package scripts)

**Steps:**
- [ ] Scaffold `packages/vscode-extension` with `package.json` configuring VS Code extension manifest, commands (`spexy.openDashboard`, `spexy.refreshTasks`, `spexy.addComment`), and view containers.
- [ ] Implement `src/comments.ts` using `vscode.comments.createCommentController`:
  - Watch `.spexy/comments/pending-comments.yaml` for file-anchored comments and render them in editor gutter / threads.
  - Implement commenting directly from the editor selection (saving new comments via `@workspace/spexy-core` or CLI).
  - Implement resolve comment action from VS Code comment thread.
- [ ] Implement `src/tree.ts`: sidebar TreeDataProvider showing Spexy specs, task statuses (with blocking indicators and worktree lease info), and pending comments.
- [ ] Implement `src/dashboard.ts`: Webview panel loading local Spexy dashboard (`http://127.0.0.1:4200` or bundled UI).
- [ ] Add build and package scripts in root `package.json` (`build:vscode`, `package:vscode`).
- [ ] Verify TypeScript compilation of VSCode extension: `pnpm --filter @workspace/spexy-vscode run build` or `pnpm run typecheck`.

---

### Task 4: TypeScript Strictness Audit & Elimination of `any`

**Files:**
- Modify: `packages/core/src/health/doctor.ts`
- Modify: `packages/cli/src/bin.ts`
- Modify: `packages/cli/src/server/index.ts`
- Modify: `packages/cli/src/server/watcher.ts`
- Modify: `packages/ui/src/components/inspector/DocumentInspector.tsx`
- Modify: `packages/ui/src/components/task/TaskDetailSheet.tsx`
- Modify: `packages/ui/src/pages/TasksPage.tsx`
- Modify: `packages/ui/src/pages/SpecificationsHub.tsx`

**Steps:**
- [ ] Implement `getErrorMessage(err: unknown): string` utility in `packages/core/src/errors.ts` or `workspace.ts` and replace `catch (err: any)` with `catch (err: unknown)` across all CLI, Core, and UI files.
- [ ] Replace `: any` in `packages/cli/src/server/index.ts` and `watcher.ts` with explicit types (`WebSocket`, `BroadcastEvent`, `TaskItem`, `CommentItem`, etc.).
- [ ] Replace `: any` in `packages/core/src/health/doctor.ts` with Zod-inferred document types.
- [ ] Replace loose `: any` in UI components (`DocumentInspector.tsx`, `TaskDetailSheet.tsx`, `TasksPage.tsx`) with strict domain interfaces (`CommentAttachment`, `TaskItem`, `SpecItem`).
- [ ] Run full typecheck and test verification: `rtk pnpm run typecheck && rtk pnpm test`.

---

### Task 5: Verification & End-to-End Validation

**Steps:**
- [ ] Run `spexy doctor --compact` to verify workspace integrity.
- [ ] Verify worktree auto-blocking: simulate claiming an in-progress task from another worktree context and confirm helpful rejection with alternative task suggestions.
- [ ] Verify CLI `spexy comment add` with file, lines, and snippet.
- [ ] Verify VSCode extension build and activation.
- [ ] Run complete test suite: `rtk pnpm test`.
