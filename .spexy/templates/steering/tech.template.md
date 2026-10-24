---
status: draft
updated_at: 2026-01-01T00:00:00.000Z
approved_by: null
---

# Technical Architecture & Constraints: [Project Name]

## 1. Project Type & Classification
- **Archetype**:
  - Web application, CLI tool, API service, library package, or distributed system.
- **Target Runtime**:
  - Bun, Node.js, browser runtime, or multi-platform targets.

## 2. Core Technologies
- **Primary Language & Tools**:
  - Language: TypeScript / ECMAScript target.
  - Package manager and task orchestrator (e.g., Bun, Turborepo).
- **Frameworks & Libraries**:
  - Web/Server framework (e.g., Fastify, native Bun HTTP).
  - Validation engine (e.g., Zod schemas).
  - Serialization: YAML, JSON, frontmatter.
- **Application Architecture**:
  - Layered architecture: Core domain logic vs CLI presentation vs server adapters.
  - State management: File system as single source of truth (.spexy/).
  - Event model: Reactive WebSocket broadcasting and file watchers.
- **Storage & Data Formats**:
  - Primary storage: Local-first Markdown files and YAML documents.
  - Cache: Ring-buffer snapshot backups in `.spexy/.cache/checkpoints/`.
- **Integrations & Protocols**:
  - Local WebSocket server (`ws://` and `http://`).
  - Git integration: branch isolation, worktrees, and commit hooks.

## 3. Development Environment & Quality Standards
- **Build & Dev Tooling**:
  - Test runner: `pnpm test` (or `npm test`).
  - Type checking: `tsc --noEmit`.
- **Static Analysis & Formatting**:
  - Linter and formatter configurations.
  - Zero-warning policy for production branches.
- **Testing Requirements**:
  - Unit tests for core domain logic and DAG engines.
  - Integration tests for CLI commands and HTTP/WebSocket endpoints.
  - 100% test pass rate required before human review submission.

## 4. Technical Constraints & Security
- **Performance Benchmarks**:
  - Sub-second CLI command startup and execution.
  - Token-optimized outputs (`--compact` and `--json` modes).
- **Security & Sandboxing**:
  - Path traversal validation and sandboxing.
  - Strict input sanitization and schema parsing.
- **Reliability & Resilience**:
  - File locking with mutex inhibitors to avoid watcher echo loops.
  - Atomic file writes and ring-buffer checkpoint rollback.

## 5. Architectural Decision Log & Limitations
- **Key Decisions**:
  - ADR 1: Local-first file-backed storage over remote database.
  - ADR 2: Two-tier human-in-the-loop (HITL) approval gate for tasks.
- **Known Limitations**:
  - Documented technical constraints and planned remediations.
