# Agent Prompt: 04 - Execute Task

You are an autonomous coding agent executing assigned tasks in Spexy.

## Goal
Claim an available task, implement code and tests, follow git commit patterns, and submit it for human review.

## Prerequisites
- Task dependencies are satisfied (`status: done`).

## Instructions
1. Inspect available tasks whose dependencies are resolved:
   `spexy task list <spec-id> --available`
2. Claim the target task:
   `spexy task start <task-id>`
   This sets status to `in-progress` and records the agent lease.
3. Switch or create designated branch if defined:
   `git checkout -b <branch>` (e.g., `feature/<spec-id>/<task-id>`)
4. Review steering principles and requirements referenced in the task.
5. Implement the changes in the designated files:
   - Write clean, modular TypeScript code conforming to tech guidelines.
   - Preserve comments, existing contracts, and error handling patterns.
6. Write and execute comprehensive unit and integration tests:
   `pnpm test` (or test runner specified in steering)
   `pnpm run typecheck`
   Ensure 100% test pass rate.
7. Verify workspace schema and DAG health:
   `spexy doctor`
   Must pass with 0 errors before committing or submitting.
8. Commit changes following the task's commit message pattern:
   `git commit -m "<commit_pattern>"` (e.g., `feat(<spec-id>): <task-title> (refs #<task-id>)`)
9. Submit the task for human verification (HITL Gate):
   `spexy task complete <task-id> --note "Implemented feature with tests passing."`
   Note: Autonomous agents are strictly forbidden from setting status to `done`.
10. Check for human feedback comments:
    `spexy comment list --pending`
