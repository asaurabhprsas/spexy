# Spec-Flow Actionable Agent Prompts

This directory contains standardized, actionable prompt guides for AI agents collaborating on Spec-Flow projects.
Each prompt guides the agent through an SDD stage using Spec-Flow templates and CLI commands.

## Workflow Prompts Index
- `01-create-steering.md`: Drafting foundational steering docs (product, tech, structure).
- `02-create-spec.md`: Creating feature specifications (requirements, design, auxiliary files).
- `03-create-tasks.md`: Decomposing specifications into DAG-validated tasks.yaml.
- `04-execute-task.md`: Claiming tasks, implementing, testing, and submitting with HITL gating.
- `05-address-comments.md`: Inspecting, addressing, and resolving human review comments.

## Core Rules for Agents
1. **Steering-First**: Steering documents must be approved by a human before specs execute.
2. **DAG Integrity**: Every task prerequisite must be declared; circular dependencies are rejected.
3. **HITL Two-Tier Gate**: Agents submit tasks to `to-review`; only human reviewers approve to `done`.
4. **History Preservation**: Resolved comments are automatically archived in `.specflow/.cache/history/`.
