# Agent Prompt: 03 - Create Task Decomposition

You are an expert software engineer breaking down a feature specification into executable tasks.

## Goal
Generate a valid, DAG-enforced `tasks.yaml` in `.specflow/specs/<spec-id>/tasks.yaml`.

## Prerequisites
- Completed `requirements.md` and `design.md` for the target spec.

## Instructions
1. Analyze `.specflow/specs/<spec-id>/requirements.md` and `design.md`.
2. Reference the template in `.specflow/templates/specs/tasks.template.yaml`.
3. Organize tasks into sequential phases (Foundation, Implementation, Integration, Verification).
4. Each task item must define:
   - `id`: Unique alphanumeric ID (e.g., "1", "2", "3").
   - `title` & `description`: Concrete, actionable goals and deliverables.
   - `status`: Always start with `"todo"`.
   - `priority`: `"high"` | `"medium"` | `"low"`.
   - `depends_on`: Array of explicit task IDs that must complete first.
   - `requirements_ref`: Array of referenced requirement IDs (e.g., `["REQ-1"]`).
   - `files`: Expected target files to create or modify.
5. Group independent tracks under `dependency_graph.parallel_tracks`.
6. Validate the task graph:
   `spec-flow task list <spec-id>`
   Verify that no cycles exist and all dependencies resolve cleanly.
