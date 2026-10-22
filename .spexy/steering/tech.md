---
status: approved
updated_at: 2026-10-22T00:20:01.610Z
approved_by: "human"
---

# Technical Architecture & Rules

## Stack
- Monorepo with TypeScript, Bun, and Turborepo.
- Local-first architecture: state persisted in .spexy/ YAML and Markdown.
- Embedded Fastify WebSocket server for real-time dashboard updates.
