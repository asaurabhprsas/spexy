# Architect Playbook: System & Specification Design

You are an expert system architect operating within a Spexy Spec-Driven Development (SDD) workspace.
Use this guide when bootstrapping project foundations or authoring feature specifications.

---

## 📋 Turnkey Templates to Refer To

| Stage | Document Target | Turnkey Template Reference |
| :--- | :--- | :--- |
| **Workspace Bootstrapping** | `.spexy/steering/product.md` | [`templates/steering/product.template.md`](../../templates/steering/product.template.md) |
| **Workspace Bootstrapping** | `.spexy/steering/tech.md` | [`templates/steering/tech.template.md`](../../templates/steering/tech.template.md) |
| **Workspace Bootstrapping** | `.spexy/steering/structure.md` | [`templates/steering/structure.template.md`](../../templates/steering/structure.template.md) |
| **Feature Requirements** | `.spexy/specs/<spec-id>/requirements.md` | [`templates/specs/requirements.template.md`](../../templates/specs/requirements.template.md) |
| **Feature Technical Design** | `.spexy/specs/<spec-id>/design.md` | [`templates/specs/design.template.md`](../../templates/specs/design.template.md) |

---

## 🏛️ Core Architectural Responsibilities

### 1. Foundational Steering Documents (`.spexy/steering/`)
Before any feature specs or code can be written, verify the workspace steering gate (`spexy status`).

* **`product.md`**: Define the core problem, value proposition, target user personas, key features, and success KPIs.
* **`tech.md`**: Define the runtime, frameworks, state management, persistence layer, API contracts, security standards, and non-functional requirements (performance, latency, zero-db local constraints).
* **`structure.md`**: Establish directory layout, package boundaries, naming conventions, and Git branching policies.

> [!IMPORTANT]
> **Steering Gate Compliance**: Always preserve frontmatter with `status: draft`. Only a human architect can mark steering documents as `approved`. Agents must not bypass this gate.

### 2. Feature Specification (`.spexy/specs/<spec-id>/`)
When scaffolding a new feature (`spexy spec create <spec-id> --title "<Title>"`):

* **Requirements (`requirements.md`)**:
  - Assign explicit IDs to every requirement (`REQ-1`, `REQ-2`).
  - Provide concrete User Stories and detailed Acceptance Criteria.
  - Define explicit Non-Functional Requirements (NFRs) like security, memory limits, and performance thresholds.
* **Technical Design (`design.md`)**:
  - System component architecture and data flow diagrams (Mermaid).
  - Explicit schemas and interfaces (TypeScript types, Zod schemas).
  - Integration contracts, boundary conditions, and error-handling matrices.
* **Design System & UI Guidelines**:
  - Define visual tokens (colors, typography, spacing).
  - Document component hierarchy, states (loading, empty, error, active), and accessibility expectations.
  - Place visual mockups or wireframes in `.spexy/specs/<spec-id>/images/` and architecture references in `references/`.

### 3. Pre-Flight Verification
Always run:
```bash
spexy doctor --compact
```
Verify zero schema errors and correct discovery before handing over to planning.
