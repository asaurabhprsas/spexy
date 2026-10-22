---
status: draft
updated_at: 2026-01-01T00:00:00.000Z
approved_by: null
---

# Project Structure & Conventions: [Project Name]

## 1. Monorepo Directory Organization
- **`packages/`**:
  - `packages/core/`: Domain logic, DAG workflow engine, Zod schemas, file operations.
  - `packages/cli/`: Command-line interface, server daemon, dashboard runner.
  - `packages/ui/`: Frontend single-page application dashboard.
- **`.specflow/`**:
  - `steering/`: Foundational product, tech, and structure steering documents.
  - `specs/`: Feature specifications with requirements, design, and tasks.yaml.
  - `prompts/`: Standardized AI agent prompt guides.
  - `archived/`: Archived steering and specification documents.
  - `.cache/`: Snapshot ring-buffer checkpoints and resolved comment history.
- **`templates/`**:
  - `steering/`: Turnkey templates for steering documents.
  - `specs/`: Turnkey templates for feature specifications and task graphs.
- **`docs/`**:
  - Long-term human documentation and architecture reference manuals.

## 2. Naming Conventions
- **Files & Directories**:
  - Source files: `kebab-case.ts` (e.g., `ring-buffer.ts`, `fuzzy-anchor.ts`).
  - Test files: `*.test.ts` co-located with source or in test suites.
  - Documentation: `kebab-case.md` or `.specflow/` standard conventions.
- **Source Code Symbols**:
  - Classes, interfaces, types: `PascalCase` (e.g., `TasksDocumentSchema`, `TaskItem`).
  - Functions, methods, variables: `camelCase` (e.g., `computeTaskAvailability`).
  - Constants & Enums: `UPPER_SNAKE_CASE` or `PascalCase` object enums.

## 3. Import & Export Patterns
- **Import Ordering**:
  - 1. Node.js built-ins (`node:fs`, `node:path`, `node:crypto`).
  - 2. External third-party packages (`yaml`, `zod`, `commander`).
  - 3. Internal monorepo package imports (`@spec-flow/core`).
  - 4. Relative file imports (`./server`, `../fs/workspace`).
- **Barrel Exports**:
  - Clean public APIs exported via root `index.ts` in each package.

## 4. Code Organization & Modularity Principles
- **Single Responsibility Principle**:
  - Each module focuses on a single domain (DAG, checkpoints, comments, workspace).
- **Service & Utility Decoupling**:
  - Separation between file-system mutation, data validation, and CLI rendering.
- **File & Function Size Budgets**:
  - Target modular files under 400 lines where practical.
  - Functions should perform a single logical operation with clear return types.

## 5. Branching & Commit Conventions
- **Branch Strategy**:
  - Feature task branches: `feature/<spec-id>/<task-id>` or `spec/<spec-id>`.
  - Main branch: `main` (always protected, verified via CI).
- **Commit Message Patterns**:
  - Format: `<type>(<spec-id>): <task-title> (refs #<task-id>)`.
  - Examples:
    - `feat(auth): Define Schemas and Interfaces (refs #1)`
    - `fix(auth): Resolve session expiration edge-case (refs #2)`
