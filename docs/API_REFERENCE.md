# Spec-Flow Server API Reference

Spec-Flow exposes a lightweight, local-first REST and WebSocket API at `http://127.0.0.1:4200` powered by Bun and Fastify.

---

## 1. REST Endpoints

### Workspace Status & Health
- `GET /api/status`: Returns steering document statuses, active specifications, workspace configuration, and overall health.
- `GET /api/dashboard`: Aggregated dashboard summary with active features, task progress percentages, and recent activities.
- `GET /api/preferences`: Retrieves persisted user preferences (theme, font, compact mode, expanded view).
- `PUT /api/preferences`: Updates and saves user preferences to `.specflow/config.json`.

### Steering Documents
- `GET /api/steering`: Lists all steering documents with metadata and approval status.
- `GET /api/steering/:id`: Retrieves steering document body and YAML frontmatter.
- `PUT /api/steering/:id`: Updates steering document content (triggers atomic write lock and checkpoint snapshot).
- `POST /api/steering/:id/approve`: Human-in-the-loop approval gate marking document approved.

### Specifications Hub & Auxiliary Files
- `GET /api/specs`: Lists all feature specifications.
- `POST /api/specs`: Creates a new specification folder with template files (validates steering gate unless `force: true`).
- `GET /api/specs/:id/files`: Discovers and lists all files associated with a specification:
  - Requirements (`requirements.md`)
  - Design (`design.md`)
  - Tasks (`tasks.yaml`)
  - Logs (`logs/*.md`)
  - References (`references/**`)
  - Images (`images/**`)
- `GET /api/specs/:id/files/content?file=<subpath>`: Serves raw markdown, text, or binary file content with strict path-traversal security guards.

### Tasks & State Machine
- `GET /api/specs/:id/tasks`: Computes topological DAG availability, blocker list, and returns tasks for a specific spec. Supports `?format=array`.
- `GET /api/tasks` or `GET /api/specs/all/tasks`: Aggregates all tasks across all active specifications.
- `POST /api/specs/:id/tasks`: Creates a new task in a specification.
- `POST /api/specs/:id/tasks/:taskId/transition`: Transitions a task through the HITL state machine:
  - `action: "claim"` (Actor: `agent` or `human`, payload: `{ branch, worktree }`)
  - `action: "submit"` (Actor: `agent`, payload: `{ note }`)
  - `action: "approve"` (Actor: `human`, payload: `{ note }`)
  - `action: "reject"` (Actor: `human`, payload: `{ note }`)
  - `action: "set_status"` (Actor: `human`, payload: `{ status: "todo" | "in-progress" | "to-review" | "done" }`)
- `POST /api/tasks/:taskId/transition`: Cross-spec task transition endpoint.

### Context-Anchored Comments
- `GET /api/comments?documentId=<id>`: Lists active unresolved comments anchored to a document.
- `POST /api/comments`: Creates an anchored comment with line number and 3-line fuzzy anchor hash.
- `PUT /api/comments/:id`: Updates comment content.
- `DELETE /api/comments/:id`: Removes a comment.
- `POST /api/comments/:id/resolve`: Resolves a comment and moves it to historical archive.
- `GET /api/comments/history`: Retrieves resolved comment history.

### Document Archiving
- `POST /api/documents/:id/archive`: Safely moves a document to `.specflow/archived/` and broadcasts `DOC_ARCHIVED`.

---

## 2. WebSocket Real-time Protocol (`/ws`)

Clients connect via `ws://127.0.0.1:4200/ws` for sub-millisecond bidirectional reactive synchronization.

### Server-to-Client Broadcast Events

| Event Type | Description | Payload Example |
| :--- | :--- | :--- |
| `DOC_UPDATED` | Fired when steering or spec document is modified. | `{ documentId: "tech", path: "..." }` |
| `TASK_UPDATED` | Fired when task status or graph changes. | `{ specId: "demo-spec", tasks: [...] }` |
| `COMMENT_CREATED` | Fired when an anchored review comment is added. | `{ comment: { id: "c-1", ... } }` |
| `COMMENT_RESOLVED` | Fired when a comment is resolved. | `{ commentId: "c-1" }` |
| `SPEC_FILES_UPDATED` | Fired when references or images are added/deleted. | `{ specId: "demo-spec" }` |
| `DOC_ARCHIVED` | Fired when a document is archived. | `{ sourcePath: "...", archivePath: "..." }` |
| `LOG_EVENT` | Broadcasts real-time workspace activity logs. | `{ id: "log-1", category: "task", ... }` |
