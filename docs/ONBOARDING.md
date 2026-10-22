# Developer & Agent Onboarding Guide

## Quickstart

### Prerequisites
- [Bun](https://bun.sh) (v1.3+ recommended) or Node.js v20+

### 1. Build and Test
```bash
# Run unit tests across domain core
bun test packages/core

# Run linting
bun run lint
```

### 2. Initializing a Repository
To start using Spexy in any repository:
```bash
bun packages/cli/src/bin.ts init
```
This scaffolds:
- `.spexy/`: Configuration, steering documents, and feature specifications.
- `docs/`: Long-term architectural context and progress logs.

### 3. Launching the Web Dashboard
```bash
bun packages/cli/src/bin.ts dashboard
```
Opens the real-time Spexy dashboard at `http://127.0.0.1:4200`.

---

## Autonomous Agent Workflow

```mermaid
sequenceDiagram
    autonumber
    actor Human as Human Architect
    actor Agent as Autonomous Agent
    participant CLI as spexy CLI
    participant FS as .spexy/ Files

    Human->>FS: Approves steering/ documents
    Agent->>CLI: spexy status --json
    CLI-->>Agent: Steering approved: true
    Agent->>CLI: spexy task list <spec-id> --available --json
    CLI-->>Agent: List of unblocked tasks
    Agent->>CLI: spexy task start <task-id>
    CLI->>FS: Locks lease, status: in-progress
    Agent->>Agent: Implements code & runs unit tests
    Agent->>CLI: spexy task complete <task-id> --note "Implemented & tested"
    CLI->>FS: Status: to-review
    Human->>CLI: spexy task approve <task-id> --human
    CLI->>FS: Status: done, unblocks dependent tasks
```

### Golden Rules for Agents
1. Always check `spexy status` first. Never write code if steering is not approved.
2. Only claim tasks that are marked `available`. Never jump blocked tasks.
3. You **cannot** mark tasks as `done`. You must submit via `spexy task complete <task-id>`.
4. Monitor human feedback frequently: `spexy comment list --pending`.
