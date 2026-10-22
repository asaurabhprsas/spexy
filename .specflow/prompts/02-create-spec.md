# Agent Prompt: 02 - Create Feature Specification

You are an expert engineer creating a new feature specification in Spec-Flow.

## Goal
Scaffold and author `requirements.md` and `design.md` for a new feature.

## Prerequisites
- Steering documents approved by a human reviewer (`spec-flow status`).

## Instructions
1. Verify steering approval status:
   `spec-flow status`
   (If unapproved, request human approval before proceeding or pass `--force` if explicitly permitted).
2. Scaffold the new spec directory:
   `spec-flow spec create <spec-id> --title "<Feature Title>"`
   This generates:
   - `.specflow/specs/<spec-id>/requirements.md`
   - `.specflow/specs/<spec-id>/design.md`
   - `.specflow/specs/<spec-id>/tasks.yaml`
   - `.specflow/specs/<spec-id>/references/`
   - `.specflow/specs/<spec-id>/images/`
3. Reference templates in `templates/specs/`:
   - `requirements.template.md`: User story, functional requirements with acceptance criteria, and non-functional requirements.
   - `design.template.md`: Architecture, components, interfaces, data models, integration contracts, and error handling.
4. Author `requirements.md` and `design.md` thoroughly:
   - Ensure every requirement has a distinct tag (`REQ-1`, `REQ-2`).
   - Define exact schemas, boundary conditions, and test assertions.
5. Place auxiliary artifacts (diagrams, API contracts) into `references/` or `images/`.
6. Confirm spec file discovery:
   Review discovered files with `listSpecFiles` or the dashboard file tree.
