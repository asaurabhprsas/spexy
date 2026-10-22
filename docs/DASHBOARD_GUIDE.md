# Spec-Flow Dashboard Guide

The Spec-Flow dashboard is an interactive web interface running locally at `http://127.0.0.1:4200` designed for human architects and engineering leads to monitor, review, and guide autonomous agent workflows.

---

## 1. Top-Level Hubs

### Steering Constitution (`/steering`)
- Displays all foundational documents (`product.md`, `tech.md`, `structure.md`).
- Shows document approval status and revision count.
- Includes one-click **Human Approval** button to unlock the specification gate.
- Document Inspector with live editing, unsaved change alerts, and context-anchored commenting.

### Specifications Hub (`/specs`)
- Left sidebar lists all feature specifications with completion percentages and active task counters.
- **Specification View Filter**:
  - `Requirements`: Preview and edit `requirements.md`.
  - `Design`: Preview and edit `design.md`.
  - `Tasks`: Direct quick-link to the tasks hub for this specification.
  - `References`: Attached reference documentation and markdown files.
  - `Images`: Live gallery and image viewer for diagrams, mockups, and UI assets.
  - `All Files`: Comprehensive file browser for the spec.
- **Document Archiving**: Archive any unwanted or superseded document directly to `.specflow/archived/` with automatic collision handling.

### Tasks Hub (`/tasks`)
Switch between three visual modes for managing tasks and subtasks:
1. **Hierarchical List (ClickUp / Linear style)**:
   - Root tasks with expandable/collapsible chevrons for their subtasks.
   - Subtask counter pill (e.g. `2 subtasks • 1/2 completed`).
   - Priority badges (`critical`, `high`, `medium`, `low`).
   - Direct action triggers (Claim, Submit, Approve, Request Changes).
2. **Kanban Board**:
   - 4-lane workflow: *To Do*, *In Progress*, *To Review*, *Done*.
   - Drag-and-drop task progression (including backwards manual transitions for human error recovery).
   - Dedicated "Blocked Dependencies" indicator for tasks with unmet prerequisites.
3. **DAG Dependency Visualizer**:
   - Real-time SVG topological graph with rank columns.
   - Smooth cubic-bezier connecting curves and directional arrowheads.
   - Interactive dependency chain highlighting (click any node to highlight upstream prerequisites and downstream dependents).
   - Zoom controls and node inspector drawer.

---

## 2. Document Inspector Features

- **Triple View Modes**:
  - `Rendered`: Clean GitHub-flavored markdown with syntax highlighting.
  - `Split`: Side-by-side markdown source code and rendered preview.
  - `Source`: Raw markdown with aligned line numbers and contextual comment pins.
- **Context-Anchored Line Comments**:
  - Click any line number to anchor a review comment.
  - 3-line fuzzy hash realigns comments even when code or text shifts.
  - Review comments are visible to agents via CLI and archived upon resolution.
- **In-Place Full Width Expansion**:
  - Click the expand icon to toggle edge-to-edge view without modal popups.
  - Persisted across navigation sessions and browser reloads.
- **Unsaved Changes Shield**:
  - Displays a modal warning dialog if unsaved document edits exist when switching documents or specifications.

---

## 3. Themes & Personalization (`/settings`)

- **Popular Theme Palettes**:
  - Tokyo Night
  - Catppuccin Macchiato
  - Gruvbox Dark
  - Nord
  - GitHub Light / Dark
  - Dracula
- **Popular Typography**:
  - Inter
  - JetBrains Mono
  - Fira Code
  - Geist Sans
  - System Font Stack
- **Persistence**: Preferences are automatically saved in browser `localStorage` and synchronized with `.specflow/config.json`.
