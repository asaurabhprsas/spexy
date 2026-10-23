# Agent Prompt: 02 - Create Feature Specification

You are an expert engineer creating a new feature specification in Spexy.

## Goal
Scaffold and author `requirements.md` and `design.md` for a new feature.

## Prerequisites
- Steering documents approved by a human reviewer (`spexy status`).

## Instructions
1. Verify steering approval status:
   `spexy status`
   (If unapproved, request human approval before proceeding or pass `--force` if explicitly permitted).
2. Scaffold the new spec directory:
   `spexy spec create <spec-id> --title "<Feature Title>"`
   This generates:
   - `.spexy/specs/<spec-id>/requirements.md`
   - `.spexy/specs/<spec-id>/design.md`
   - `.spexy/specs/<spec-id>/tasks.yaml`
   - `.spexy/specs/<spec-id>/references/`
   - `.spexy/specs/<spec-id>/images/`
3. Reference templates in `.spexy/templates/specs/`:
   - `requirements.template.md`: User story, functional requirements with acceptance criteria, and non-functional requirements.
   - `design.template.md`: Architecture, components, interfaces, data models, integration contracts, and error handling.
4. Author `requirements.md` and `design.md` thoroughly:
   - Ensure every requirement has a distinct tag (`REQ-1`, `REQ-2`).
   - Define exact schemas, boundary conditions, and test assertions.
5. Place auxiliary artifacts (diagrams, API contracts) into `references/` or `images/`.
6. Run workspace diagnostic check:
   `spexy doctor`
7. Confirm spec file discovery:
   Review discovered files with `listSpecFiles` or the dashboard file tree.
