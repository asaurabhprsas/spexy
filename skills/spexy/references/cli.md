# Spexy CLI Command Reference

The `spexy` CLI provides deterministic, structured commands for humans and autonomous coding agents.
All query commands support `--json` and `--yaml` (or `--format <json|yaml>`), as well as `--compact` (`-c`) for token-efficient agent consumption.

---

## Command Catalog

### `spexy init [dir]`
Scaffolds the `.spexy/` structure (config, steering, specs, .cache), root `templates/`, and companion `docs/` folder in the target directory.
- `[dir]`: Target directory (defaults to current directory `.`).

### `spexy status [--json]`
Displays overall workspace gate health:
- Steering documents status (`product.md`, `tech.md`, `structure.md`) and approval counts.
- Active feature specs and completion progress.

### `spexy spec list [-c, --compact] [--format <json|yaml>] [--yaml] [--json]`
Lists all feature specs in `.spexy/specs/`:
- `ID`: Unique kebab-case spec identifier.
- `STATUS`: Overall spec status (`draft`, `in-progress`, `to-review`, `done`).
- `PROGRESS`: Ratio and percentage of completed tasks.
- `--compact`: Outputs minimal records `{ id, status, tasks: "completed/total" }`.

### `spexy spec create <id> [--title <title>] [--force]`
Scaffolds a new feature spec folder `.spexy/specs/<id>/`:
- Generates `requirements.md`, `design.md`, `tasks.yaml`, `implementation.log`, `references/`, and `images/`.
- **Steering Gate**: Fails with exit code 1 if steering documents are not approved, unless `--force` is provided.

### `spexy task list [spec-id] [--available] [-c, --compact] [--format <json|yaml>] [--yaml] [--json]`
Lists tasks from `tasks.yaml`:
- `[spec-id]`: Filter by specific spec ID.
- `--available`: Only return tasks that are currently unblocked and ready to claim (`todo` with all dependencies `done`).
- `-c, --compact`: Strips large markdown descriptions, file arrays, and requirementsRef to save context tokens. Outputs `{ id, spec_id, title, status, priority, availability, blockers }`.
- `--format yaml` / `--yaml`: Formats output as YAML for concise token parsing.

### `spexy task start <task-id>`
Claims a task for execution:
- Records active worktree lease (`worktree`, `branch`, `locked_at`).
- Sets task status to `in-progress`.
- Rejects if another agent or worktree holds an active lease.

### `spexy task complete <task-id> [--note <text>]`
Submits an `in-progress` task for human verification:
- Sets status to `to-review`.
- Records review note and audit trail entry.
- **Role Guard**: Autonomous agents cannot mark tasks `done`.

### `spexy task approve <task-id> --human`
Human verification gate:
- Transitions `to-review` task to `done`.
- Automatically unlocks dependent tasks across parallel tracks.
- Requires `--human` flag; rejected if executed without human authorization.

### `spexy task reject <task-id> --human [--note <text>]`
Human reviewer requests changes:
- Transitions task back from `to-review` to `todo`.

### `spexy comment list [--pending] [-c, --compact] [--format <json|yaml>] [--yaml] [--json]`
Lists review comments anchored to documents:
- `--pending`: Filter to unresolved comments only.
- `-c, --compact`: Returns minimal fields: `{ id, status, author, target_file, lines, instruction }`, omitting snippets and context blocks.
- `--format yaml` / `--yaml`: Outputs compact YAML.

### `spexy comment resolve <id> --note <text>`
Marks an anchored comment as addressed:
- Records resolution note into `.spexy/.cache/history/comments-history.yaml`.
- Purges comment from active pending queue to keep repository clean.

### `spexy doc list [-c, --compact] [--format <json|yaml>] [--yaml] [--json]`
Lists all documents across steering and active specs:
- Discovers documents in `.spexy/steering/` and `.spexy/specs/**`.
- `-c, --compact`: Returns minimal `{ id, path, status }`.
- Useful for agents to map context before requesting specific document files.

### `spexy doc get <path-or-id> [-c, --compact] [--format <json|yaml>] [--yaml] [--json]`
Fetches document contents or frontmatter:
- `<path-or-id>`: Can be an ID (`tech`, `requirements`), relative path (`steering/product.md`), or filename (`product.md`).
- `-c, --compact`: **Token Saver**: Extracts and outputs ONLY frontmatter `{ status, updated_at, approved_by, title }`, completely omitting the long markdown body!
- In full mode: Outputs raw markdown or serialized object if format is json/yaml.

### `spexy doc archive <path-or-id>`
Archives a steering or specification document:
- Moves file into `.spexy/archived/` preserving the relative path hierarchy.
- Automatically handles naming collisions by adding incremental numeric suffixes (`_1.md`, `_2.md`).
- Deletes the original source file and broadcasts real-time document updates.

### `spexy checkpoint list [file] [--json]`
Lists rolling file snapshots from `.spexy/.cache/checkpoints/`:
- Displays snapshot ID, SHA-256 hash, timestamp, size, and target file.

### `spexy checkpoint restore <snapshot-id>`
Reverts the specified file to the historical snapshot state and triggers real-time UI notification.

### `spexy dashboard [--port <port>] [--host <host>]`
Launches the embedded Fastify WebSocket daemon and opens the web dashboard in the default browser (`http://127.0.0.1:4200`).
