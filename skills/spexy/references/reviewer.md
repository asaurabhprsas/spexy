# Reviewer Playbook: Code Quality, Security & Human Review

You are an expert code reviewer and quality auditor in a Spexy SDD workspace.
Use this guide before submitting tasks to the human reviewer or when triaging human feedback.

---

## 🔍 Pre-Submission Audit Checklist

Before transitioning any task to `to-review` (`spexy task complete`), perform this rigorous three-pillar review:

### 1. Code Quality & Architecture
- **Spec Alignment**: Does the code faithfully satisfy the user story and acceptance criteria in `requirements.md`?
- **Monorepo Structure**: Does the code respect package boundaries and module imports defined in `.spexy/steering/structure.md`?
- **Type Safety & Integrity**: No untyped escapes without justification. Strict type/lint checks must pass cleanly according to the project's tooling (e.g., `bun run typecheck`, `pnpm typecheck`, or equivalent).
- **Conventional Commits**: Commits follow the format: `<type>(<spec-id>): <task-title> (refs #<task-id>)`.

### 2. Security & Defensive Engineering
- **Input Validation**: Are all external inputs, CLI flags, and API payloads strictly validated with Zod schemas?
- **Secret & Token Hygiene**: Ensure no API keys, credentials, or session tokens are hardcoded or leaked into git history or log files.
- **Path & Injection Traversal**: Verify file paths are sanitized and confined to workspace boundaries (e.g., prevent directory traversal attacks).
- **Graceful Error Handling**: Do not fail silently. Provide clear, actionable error messages.

### 3. Testing Quality Gate
- **High-Level Coverage**: Are the critical business flows, boundary conditions, and contract edges tested?
- **No Micro-Tests**: Verify that the test suite does not contain low-value micro-tests for trivial boilerplate or standard library functionality.
- **Clean Execution**: Run tests with isolated proxy environment:
  ```bash
  # Example: run the project's test suite
  pnpm test   # or npm test / yarn test
  ```

---

## 💬 Addressing Human Review Comments

Human reviewers inspect tasks in `to-review` and post feedback via the Spexy comment system.

### 1. Query Pending Comments (Token-Optimized)
```bash
spexy comment list --pending --compact --yaml
```

### 2. Address & Resolve Feedback
1. Read the comment details and review the targeted file lines.
2. Implement the requested modification following the TDD cycle.
3. Re-run tests (`pnpm test`) and pre-flight doctor (`spexy doctor --compact`).
4. Resolve the comment:
   ```bash
   spexy comment resolve <comment-id> --note "Addressed: sanitized path inputs and added integration test"
   ```
5. If all comments are resolved, re-submit the task if needed:
   ```bash
   spexy task complete <task-id> --note "Addressed reviewer comments"
   ```
