# Spec-Flow CLI Reference Guide

The `spec-flow` command-line interface provides full control over the Spec-Driven Development (SDD) orchestration lifecycle. It includes high-throughput token-saving compact modes, health diagnostics, git-aware worktree leasing, document archiving, and interactive server hosting.

---

## Global Options

| Flag | Description |
| :--- | :--- |
| `-v, --version` | Output the current version of Spec-Flow. |
| `-h, --help` | Display command usage and descriptions. |
| `--dashboard` | Launch the local-first web dashboard at `http://127.0.0.1:4200`. |
| `--port <number>` | Specify the port for the dashboard server (default: `4200`). |
| `--check, --doctor` | Run the comprehensive workspace diagnostic health-check. |

---

## Commands

### 1. Health Diagnostics: `doctor` / `check`
Audits the entire `.specflow/` workspace, steering documents, specification directories, task schemas, and DAG graph dependencies.

```bash
spec-flow doctor
# or
spec-flow check
spec-flow doctor --compact
spec-flow doctor --json
```

**Checks Performed:**
- **Steering Integrity**: Verifies existence and valid frontmatter for `product.md`, `tech.md`, and `structure.md`.
- **Specification Files**: Verifies `requirements.md`, `design.md`, and `tasks.yaml` across all specs.
- **Zod Schema Validation**: Validates `tasks.yaml` against `TasksDocumentSchema`.
- **DAG Topological Integrity**: Runs cycle detection (`validateTaskGraph`) to guarantee no circular dependencies.
- **Checkpoints Ring-Buffer**: Verifies health of `.specflow/.cache/checkpoints/`.

---

### 2. Workspace Initialization: `init`
Scaffolds the `.specflow/` directory structure, turnkey templates, and agent prompts.

```bash
spec-flow init
```

**Options:**
- `--force`: Overwrite existing `.specflow/` directory and recreate default templates.

---

### 3. Workspace Status: `status`
Displays summary of approved steering documents, active specs, task counts, and token killer analytics.

```bash
spec-flow status
spec-flow status --compact
spec-flow status --json
```

---

### 4. Steering Management: `steering`
Lists, inspects, and approves foundational constitution documents.

```bash
# List all steering documents
spec-flow steering list

# View steering document content
spec-flow steering get product
spec-flow steering get product --compact

# Approve steering document (Human only)
spec-flow steering approve tech
```

---

### 5. Specifications Management: `spec`
Creates, lists, and manages feature specifications.

```bash
# List all specifications
spec-flow spec list
spec-flow spec list --compact

# Create a new specification
spec-flow spec create auth-system
# Bypass steering approval gate (if needed during bootstrapping)
spec-flow spec create auth-system --force
```

---

### 6. Task Lifecycle Management: `task`
Manages the two-tier HITL state machine (`todo` $\to$ `in-progress` $\to$ `to-review` $\to$ `done`).

```bash
# List tasks for a specification
spec-flow task list demo-spec
spec-flow task list demo-spec --compact
spec-flow task list demo-spec --all

# Claim task (Agent or Human)
spec-flow task claim demo-spec 2.1 --actor agent --branch feature/demo-spec/2.1

# Submit completed task for human review (Agent only)
spec-flow task submit demo-spec 2.1 --actor agent --note "Added JWT middleware with test coverage"

# Approve task as done (Human only)
spec-flow task approve demo-spec 2.1 --note "Verified middleware implementation and passing tests"

# Reject task back to todo with feedback (Human only)
spec-flow task reject demo-spec 2.1 --note "Missing constant-time token comparison"

# Manual status override (Human only)
spec-flow task set-status demo-spec 2.1 --status in-progress
```

---

### 7. Anchored Review Comments: `comment`
Creates context-anchored line comments with 3-line fuzzy hash re-alignment.

```bash
# Add anchored comment
spec-flow comment add demo-spec requirements.md --line 24 --text "Include rate limit thresholds"

# List active unresolved comments
spec-flow comment list demo-spec
spec-flow comment list demo-spec --compact

# Resolve comment (Human only)
spec-flow comment resolve <comment-id>
```

---

### 8. Checkpoint Ring-Buffer: `checkpoint`
Lists and restores automatic rolling file snapshots.

```bash
# List snapshots for a file
spec-flow checkpoint list --file .specflow/specs/demo-spec/tasks.yaml

# Restore from a snapshot ID
spec-flow checkpoint restore <snapshot-id>
```

---

### 9. Document Archiving: `doc archive`
Safely archives obsolete or regenerated steering and specification documents into `.specflow/archived/`.

```bash
# Archive steering document
spec-flow doc archive product

# Archive feature specification file
spec-flow doc archive demo-spec/requirements.md

# Archive by arbitrary path
spec-flow doc archive .specflow/specs/feature-1/design.md
```
- Preserves directory hierarchy in `.specflow/archived/steering/` or `.specflow/archived/specs/`.
- Automatically handles filename collisions with `_1`, `_2` suffixing.

---

### 10. Dashboard Server: `serve` / `--dashboard`
Runs the Fastify and WebSocket server hosting the dashboard UI and live file watchers.

```bash
spec-flow --dashboard
spec-flow serve --port 4200
```
