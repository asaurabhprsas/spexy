# Spexy CLI Reference Guide

The `spexy` command-line interface provides full control over the Spec-Driven Development (SDD) orchestration lifecycle. It includes high-throughput token-saving compact modes, health diagnostics, git-aware worktree leasing, document archiving, and interactive server hosting.

---

## Global Options

| Flag | Description |
| :--- | :--- |
| `-v, --version` | Output the current version of Spexy. |
| `-h, --help` | Display command usage and descriptions. |
| `--dashboard` | Launch the local-first web dashboard at `http://127.0.0.1:4200`. |
| `--port <number>` | Specify the port for the dashboard server (default: `4200`). |
| `--check, --doctor` | Run the comprehensive workspace diagnostic health-check. |

---

## Commands

### 1. Health Diagnostics: `doctor` / `check`
Audits the entire `.spexy/` workspace, steering documents, specification directories, task schemas, and DAG graph dependencies.

```bash
spexy doctor
# or
spexy check
spexy doctor --compact
spexy doctor --json
```

**Checks Performed:**
- **Steering Integrity**: Verifies existence and valid frontmatter for `product.md`, `tech.md`, and `structure.md`.
- **Specification Files**: Verifies `requirements.md`, `design.md`, and `tasks.yaml` across all specs.
- **Zod Schema Validation**: Validates `tasks.yaml` against `TasksDocumentSchema`.
- **DAG Topological Integrity**: Runs cycle detection (`validateTaskGraph`) to guarantee no circular dependencies.
- **Checkpoints Ring-Buffer**: Verifies health of `.spexy/.cache/checkpoints/`.

---

### 2. Workspace Initialization: `init`
Scaffolds the `.spexy/` directory structure, turnkey templates, and agent prompts.

```bash
spexy init
```

**Options:**
- `--force`: Overwrite existing `.spexy/` directory and recreate default templates.

---

### 3. Workspace Status: `status`
Displays summary of approved steering documents, active specs, task counts, and token killer analytics.

```bash
spexy status
spexy status --compact
spexy status --json
```

---

### 4. Steering Management: `steering`
Lists, inspects, and approves foundational constitution documents.

```bash
# List all steering documents
spexy steering list

# View steering document content
spexy steering get product
spexy steering get product --compact

# Approve steering document (Human only)
spexy steering approve tech
```

---

### 5. Specifications Management: `spec`
Creates, lists, and manages feature specifications.

```bash
# List all specifications
spexy spec list
spexy spec list --compact

# Create a new specification
spexy spec create auth-system
# Bypass steering approval gate (if needed during bootstrapping)
spexy spec create auth-system --force
```

---

### 6. Task Lifecycle Management: `task`
Manages the two-tier HITL state machine (`todo` $\to$ `in-progress` $\to$ `to-review` $\to$ `done`), worktree lease auto-blocking, and DAG candidate task recommendations.

```bash
# Recommend next ready-to-claim unblocked task in DAG
spexy task next [spec-id]

# List tasks for a specification
spexy task list demo-spec
spexy task list demo-spec --compact
spexy task list demo-spec --available

# Start/Claim task with worktree lease acquisition and concurrency conflict check
spexy task start 2.1
# (If leased by another worktree, outputs conflict banner and suggests independent alternative tasks)

# Claim task explicitly specifying actor and branch
spexy task claim demo-spec 2.1 --actor agent --branch feature/demo-spec/2.1

# Submit completed task for human review (Agent only; transitions to to-review)
spexy task complete 2.1 --note "Added JWT middleware with test coverage"
spexy task submit demo-spec 2.1 --actor agent --note "Added JWT middleware with test coverage"

# Approve task as done (Human only gate)
spexy task approve demo-spec 2.1 --note "Verified middleware implementation and passing tests"

# Reject task back to todo with feedback (Human only)
spexy task reject demo-spec 2.1 --note "Missing constant-time token comparison"

# Manual status override (Human only)
spexy task set-status demo-spec 2.1 --status in-progress
```

---

### 7. Git Worktrees & Leases: `worktree`
Coordinates concurrency across parallel Git worktrees sharing the central `.spexy` directory.

```bash
# List all registered worktrees and their active task leases
spexy worktree list
```

---

### 8. Context-Anchored Review Comments: `comment`
Creates context-anchored line comments on arbitrary repository files (`.ts`, `.py`, `.json`, `.md`) with 3-line fuzzy hash re-alignment.

```bash
# Add anchored comment on any file with optional line range and code snippet
spexy comment add --file packages/core/src/auth.ts --instruction "Verify token expiry claims" --line 45-52 --snippet "verifyJwt(token)" --type code

# Add general or task review comment
spexy comment add --file README.md --instruction "Update installation prerequisites" --line 12

# List review comments with token-saving compact modes
spexy comment list
spexy comment list --compact
spexy comment list --pending --format yaml

# Resolve comment (moves to history with purge option)
spexy comment resolve <comment-id> --note "Addressed and verified" --purge
```

---

### 9. Checkpoint Ring-Buffer: `checkpoint`
Lists and restores automatic rolling file snapshots.

```bash
# List snapshots for a file
spexy checkpoint list --file .spexy/specs/demo-spec/tasks.yaml

# Restore from a snapshot ID
spexy checkpoint restore <snapshot-id>
```

---

### 10. Document Archiving: `doc archive`
Safely archives obsolete or regenerated steering and specification documents into `.spexy/archived/`.

```bash
# Archive steering document
spexy doc archive product

# Archive feature specification file
spexy doc archive demo-spec/requirements.md

# Archive by arbitrary path
spexy doc archive .spexy/specs/feature-1/design.md
```
- Preserves directory hierarchy in `.spexy/archived/steering/` or `.spexy/archived/specs/`.
- Automatically handles filename collisions with `_1`, `_2` suffixing.

---

### 11. Dashboard Server: `serve` / `--dashboard`
Runs the native Node.js HTTP and WebSocket server hosting the dashboard UI and live file watchers.

```bash
spexy --dashboard
spexy serve --port 4200
```

---

### 12. VS Code Extension Integration
Spexy includes an official VS Code extension (`packages/vscode-extension`) integrating editor comment threads and sidebar activity views.

```bash
# Symlink local extension into VS Code extensions directory
pnpm run link:vscode

# Build extension distribution package
pnpm run build:vscode
```
