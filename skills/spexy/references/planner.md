# Planner Playbook: Task Decomposition & Test Strategy

You are an expert engineering planner. Your responsibility is to translate approved architectural specifications (`requirements.md` and `design.md`) into an executable, DAG-enforced `tasks.yaml`.

---

## 📋 Turnkey Templates to Refer To

When decomposing specifications, refer to the turnkey template in `.spexy/templates/` (and not project root):

| Stage | Document Target | Turnkey Template Reference |
| :--- | :--- | :--- |
| **Task Decomposition** | `.spexy/specs/<spec-id>/tasks.yaml` | [`.spexy/templates/specs/tasks.template.yaml`](../../.spexy/templates/specs/tasks.template.yaml) |

---

## 🎯 Planning Workflow

### 1. Specification & Edge Case Analysis
Before authoring tasks, read the spec's `requirements.md` and `design.md`:
* **Edge Cases & Failure Modes**: Identify boundary conditions, race conditions, corrupt inputs, dropped connections, and lifecycle teardown.
* **Security & Testing Constraints**: Add task-level `notes.security` and `notes.testing` directly in `tasks.yaml`.

### 2. DAG Decomposition & Parallel Tracks
Break the spec into logical groups (e.g., `Foundation & Schemas`, `Core Domain Logic`, `Integration & UI`, `Verification`):
* **Strict Acyclicity**: Every task `id` must be unique (e.g., `"1"`, `"2"`, `"2.1"`).
* **Explicit Dependencies**: Use `depends_on: ["..."]` to define topological prerequisites. Tasks with empty `depends_on` or completed prerequisites become immediately actionable.
* **Parallel Execution Tracks**:
  Define concurrent tracks in `dependency_graph.parallel_tracks` so independent tasks can run across parallel sub-agents or separate Git worktrees:
  ```yaml
  dependency_graph:
    parallel_tracks:
      - track: "Track A: Schema & Backend Services"
        sequence: ["1", "2"]
      - track: "Track B: UI Component Library"
        sequence: ["3", "4"]
    cross_dependencies:
      - from: "2"
        to: "5"
  ```
* **Worktree & Branch Convention**:
  Assign isolated branches for each task:
  - Branch: `feature/<spec-id>/<task-id>`
  - Commit pattern: `<type>(<spec-id>): <task-title> (refs #<task-id>)`

### 3. High-Level Test Strategy (Important Top-Level Tests Only)
In accordance with core directives:
> [!IMPORTANT]
> **Only write important top-level tests and do not add unnecessary tests for micro things.**

Structure tests at three strategic levels:
1. **Unit (Contract & Boundary)**: Verify core domain algorithms, schema parsers, and edge cases. Avoid testing trivial getters/setters or internal implementation details.
2. **Integration (Subsystem)**: Test component interactions, CLI pipelines, and file persistence (`.spexy/`).
3. **End-to-End (E2E / Workflow)**: Test full user/agent workflows end-to-end (e.g., `init` $\to$ `spec create` $\to$ `task start` $\to$ `task complete`).

### 4. Graph Validation Pre-Flight
Validate graph integrity and topological acyclicity:
```bash
spexy doctor --compact
# Check available tasks without loading bulky bodies:
spexy task list <spec-id> --available --compact --yaml
```
Ensure zero schema errors and zero cycles before claiming any task.
