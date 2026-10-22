# Spec-Flow Agent Operating Guide

## Non-Negotiable Core Directives
- **Use superpowers for planning & execution.**
- **Sub-agents parallel execution, test driven development (TDD).**
- **Only write important top level tests and don't add unnecessary tests for micro things.**

---

## 📚 Project Documentation (`docs/`)
All technical specifications, guides, and architectural contracts reside inside the [`docs/`](docs/) directory. Consult these authoritative sources before designing or modifying functionality:

| Document | Purpose & Description |
| :--- | :--- |
| [**`docs/ARCHITECTURE.md`**](docs/ARCHITECTURE.md) | System architecture overview, zero-database local persistence model (`.specflow/`), DAG dependency engine, two-tier HITL state machine, and monorepo structure. |
| [**`docs/CLI_REFERENCE.md`**](docs/CLI_REFERENCE.md) | Comprehensive reference for all 10 CLI suites (`doctor`, `check`, `init`, `status`, `steering`, `spec`, `task`, `comment`, `checkpoint`, `doc archive`), flags, and token-killer compact output. |
| [**`docs/WORKFLOW_GUIDE.md`**](docs/WORKFLOW_GUIDE.md) | Spec-Driven Development (SDD) lifecycle stages, agent execution workflow, branching conventions, and conventional commit patterns. |
| [**`docs/API_REFERENCE.md`**](docs/API_REFERENCE.md) | Full REST & WebSocket API specification for backend integration, state transitions, and real-time event broadcasting. |
| [**`docs/DASHBOARD_GUIDE.md`**](docs/DASHBOARD_GUIDE.md) | Guide to the local web UI (`http://127.0.0.1:4200`): ClickUp-style hierarchical list, Kanban board, DAG visualizer, themes, and inspector settings. |
| [**`docs/PROGRESS.md`**](docs/PROGRESS.md) | Project milestones, completed phases, and future scope. |

---

## 🛠️ Mandatory Pre-Flight Verification (`doctor` / `check`)
Before submitting any task for review, creating a pull request, or declaring work finished, you **MUST** run the health diagnostic tool:

```bash
spec-flow doctor
# or for token-optimized verification:
spec-flow doctor --compact
```

### What `doctor` Verifies:
1. **Steering Documents**: Ensures `product.md`, `tech.md`, and `structure.md` exist with valid YAML frontmatter.
2. **Specification Files**: Verifies `requirements.md`, `design.md`, and `tasks.yaml` in `.specflow/specs/*`.
3. **Zod Schema Validation**: Validates `tasks.yaml` against `TasksDocumentSchema`.
4. **DAG Graph & Cycle Detection**: Validates topological acyclicity and dynamic availability (`validateTaskGraph`).
5. **Checkpoints Ring-Buffer**: Verifies integrity of `.specflow/.cache/checkpoints/`.

If `spec-flow doctor` reports any errors, resolve them before proceeding.

---

## 🌿 Git Branching & Conventional Commit Standards

### Branch Naming Conventions
- **Feature Specification**: `spec/<spec-id>`
- **Task Implementation**: `feature/<spec-id>/<task-id>`
- *Example*: `feature/demo-spec/2.1`

### Conventional Commit Message Pattern
Commit messages must reference the specification and task ID:
- **Format**: `<type>(<spec-id>): <task-title> (refs #<task-id>)`
- **Examples**:
  - `feat(demo-spec): implement JWT token rotation middleware (refs #2.1)`
  - `test(demo-spec): add unit tests for RBAC permission evaluator (refs #2.2)`
  - `fix(demo-spec): resolve connection pool cleanup on socket drop (refs #3.1)`

---

## 🛡️ Two-Tier Human-in-the-Loop (HITL) State Machine
- **Agent Capabilities**:
  - `spec-flow task claim <spec> <task-id> --actor agent` $\to$ transitions `todo` to `in-progress`.
  - `spec-flow task submit <spec> <task-id> --actor agent --note "..."` $\to$ transitions `in-progress` to `to-review`.
- **Human Only Gate**:
  - **Agents are strictly forbidden from approving tasks to `done`.**
  - Only a human reviewer can approve (`approve` $\to$ `done`) or request changes (`reject` $\to$ `todo`).

---

## 🧪 Testing & Quality Commands
- **Run Unit & Integration Tests**: `NO_PROXY="*" bun test`
- **Strict TypeScript Check**: `bun run typecheck`
- **Build Web UI Assets**: `bun run ./scripts/publish-local.ts` (or `cd packages/ui && bun run build`)
