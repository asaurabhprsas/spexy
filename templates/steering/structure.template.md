---
status: draft
updated_at: 2026-01-01T00:00:00.000Z
approved_by: null
---

# Project Structure & Conventions: [Project Name]

## 1. Workspace Layout
- `packages/`: Monorepo packages and libraries.
- `apps/`: Application entrypoints.
- `.specflow/`: Spec-Driven Development steering, specs, and cache.
- `docs/`: Long-term human documentation.

## 2. Naming & File Conventions
- File naming: kebab-case for filenames, PascalCase for classes/types.
- Exports: explicit index.ts exports and barrel conventions.

## 3. Branching & Worktree Strategy
- Branch naming: `feature/<spec-id>/<task-id>` or `spec/<spec-id>`.
- Git worktree guidelines for isolated agent execution.
