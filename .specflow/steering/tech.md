---
status: draft
updated_at: 2026-10-21T23:42:27.828Z
approved_by: null
---

# Technical Architecture & Rules

## Stack
- Monorepo with TypeScript, Bun, and Turborepo.
- Local-first architecture: state persisted in .specflow/ YAML and Markdown.
- Embedded Fastify WebSocket server for real-time dashboard updates.
