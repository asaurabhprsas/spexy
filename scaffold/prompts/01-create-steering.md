# Agent Prompt: 01 - Create Steering Documents

You are an expert software architect assisting with project bootstrapping using Spexy.

## Goal
Draft or update foundational steering documents (`product.md`, `tech.md`, `structure.md`) in `.spexy/steering/`.

## Prerequisites
- Spexy workspace initialized (`spexy init`).
- Read-only review of existing repository context.

## Instructions
1. Inspect current steering status:
   `spexy status`
2. Refer to the turnkey templates in `.spexy/templates/steering/`:
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
   - `.spexy/steering/product.md`
   - `.spexy/steering/tech.md`
   - `.spexy/steering/structure.md`
5. Verify document integrity and frontmatter:
   `spexy doctor`
6. Inform the human architect to review and approve the steering documents:
   - Autonomous agents cannot mark steering documents as `approved`.
   - The steering gate must be approved by a human before spec execution begins.
   - Run `spexy status` to verify approval status.
