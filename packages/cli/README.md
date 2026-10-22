# spexy-cli

> **Local-First, Human-in-the-Loop Spec-Driven Development (SDD) Orchestration Platform for Autonomous AI Agents and Software Architects.**

[![TypeScript](https://img.shields.io/badge/TypeScript-7.0-blue.svg)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.3-black.svg)](https://bun.sh/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Zero-Database](https://img.shields.io/badge/Database-Zero--DB%20Git--Native-purple.svg)](#zero-database-local-first-architecture)
[![Token-Killer](https://img.shields.io/badge/Token%20Killer-80%25%20Savings-orange.svg)](#token-killer-cli-modes)

---

## 💡 What is Spexy?

Autonomous AI coding agents (Claude Code, Cursor, Codex, OpenHands) write code fast, but left unconstrained, they often drift from architecture guidelines, hallucinate dependencies, and produce merge conflicts.

**Spexy** solves this by establishing a verifiable, machine-executable contract between human software architects and AI agents:
1. **Constitution First**: Guarantees technical, product, and structural boundaries before a single line of feature code is written.
2. **DAG-Driven Workflow**: Decomposes features into atomic, directed acyclic graphs of tasks with dynamic prerequisite checking.
3. **Two-Tier HITL Safety**: Agents claim and submit tasks, but **only humans can approve tasks as done**.
4. **Zero-Database**: 100% stored in version-controlled markdown and YAML files inside `.spexy/`.
5. **Token-Optimized**: CLI compact modes that strip fluff and cut LLM context consumption by up to 80%.

---

## ⚡ Installation & Quickstart

### Running without global install:
```bash
# Run doctor check
npx spexy-cli@alpha doctor --compact

# Or with bunx
bunx spexy-cli@alpha doctor --compact
```

### Global Installation:
```bash
# With npm
npm install -g spexy-cli@alpha

# With bun
bun add -g spexy-cli@alpha

# With pnpm
pnpm add -g spexy-cli@alpha
```

---

## 🚀 Basic Workflow

### 1. Initialize a Workspace
```bash
spexy init
```
Scaffolds:
- `.spexy/`: Configuration, steering documents, and feature specs.
- `docs/`: Long-term architectural context and progress logs.

### 2. Workspace Health Diagnostic
Run the built-in doctor to audit specifications, schemas, and DAG graph dependencies:
```bash
spexy doctor
# Token-compact mode for LLM agents:
spexy doctor --compact
```

### 3. Launch the Interactive Dashboard
Launch the real-time local web UI:
```bash
spexy dashboard
# Or
spexy --dashboard
```

---

## 📖 CLI Commands Reference

| Command | Description | Token-Killer Compact Mode |
| :--- | :--- | :--- |
| `spexy doctor` | Run full workspace diagnostic | `spexy doctor --compact` |
| `spexy check` | Alias for doctor | `spexy check --compact` |
| `spexy init` | Initialize `.spexy/` constitution | — |
| `spexy status` | Workspace status & steering gate | `spexy status --compact` |
| `spexy steering approve <doc>` | Human approval for steering | — |
| `spexy spec create <id>` | Create a new specification | — |
| `spexy spec list` | List specifications | `spexy spec list --compact` |
| `spexy task list <spec>` | List tasks with DAG availability | `spexy task list <spec> --compact` |
| `spexy task claim <spec> <id>` | Agent leases available task | — |
| `spexy task submit <spec> <id>`| Agent submits work to review | — |
| `spexy task approve <spec> <id>`| **Human only** approval to done | — |
| `spexy comment list <spec>` | List anchored review comments | `spexy comment list <spec> --compact` |
| `spexy checkpoint list` | List rollback snapshots | — |
| `spexy checkpoint restore <id>`| Rollback changes | — |
| `spexy dashboard` | Start local web UI & WebSocket server | — |

---

## 📄 License
MIT © Saurabh Prasad
