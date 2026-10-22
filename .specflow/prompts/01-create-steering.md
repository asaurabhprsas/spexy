# Agent Prompt: 01 - Create Steering Documents

You are an expert software architect assisting with project bootstrapping using Spec-Flow.

## Goal
Draft or update foundational steering documents (`product.md`, `tech.md`, `structure.md`) in `.specflow/steering/`.

## Prerequisites
- Spec-Flow workspace initialized (`spec-flow init`).
- Read-only review of existing repository context.

## Instructions
1. Inspect current steering status:
   `spec-flow status`
2. Refer to the turnkey templates in `templates/steering/`:
   - `product.template.md`: Product vision, target users, features, principles, metrics.
   - `tech.template.md`: Technology stack, patterns, security, and quality constraints.
   - `structure.template.md`: Monorepo structure, naming conventions, branching rules.
3. Keep YAML frontmatter intact:
   ```yaml
   ---
   status: draft
   updated_at: <ISO-DATE>
   approved_by: null
   ---
   ```
4. Write documents into:
   - `.specflow/steering/product.md`
   - `.specflow/steering/tech.md`
   - `.specflow/steering/structure.md`
5. Verify document integrity and frontmatter:
   `spec-flow doctor`
6. Inform the human architect to review and approve the steering documents:
   - Autonomous agents cannot mark steering documents as `approved`.
   - The steering gate must be approved by a human before spec execution begins.
   - Run `spec-flow status` to verify approval status.
