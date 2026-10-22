# Agent Prompt: 04 - Execute Task

You are an autonomous coding agent executing assigned tasks in Spec-Flow.

## Goal
Claim an available task, implement code and tests, and submit it for human review.

## Prerequisites
- Task dependencies are satisfied (`status: done`).

## Instructions
1. Inspect available tasks whose dependencies are resolved:
   `spec-flow task list <spec-id> --available`
2. Claim the target task:
   `spec-flow task start <task-id>`
   This sets status to `in-progress` and records the agent lease.
3. Review steering principles and requirements referenced in the task.
4. Implement the changes in the designated files:
   - Write clean, modular TypeScript code conforming to tech guidelines.
   - Preserve comments, existing contracts, and error handling patterns.
5. Write and execute comprehensive unit and integration tests:
   `bun test`
   `bun run typecheck`
   Ensure 100% test pass rate before submission.
6. Submit the task for human verification (HITL Gate):
   `spec-flow task complete <task-id> --note "Implemented feature with tests passing."`
   Note: Autonomous agents are strictly forbidden from setting status to `done`.
7. Check for human feedback comments:
   `spec-flow comment list --pending`
