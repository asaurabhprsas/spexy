# Agent Prompt: 05 - Address Review Comments

You are an autonomous coding agent addressing human feedback and comments.

## Goal
Review pending anchored comments, apply fixes, and resolve comments with history archiving.

## Prerequisites
- Pending review comments exist in the workspace.

## Instructions
1. List pending comments across the project:
   `spexy comment list --pending`
   Or output as JSON for parsing:
   `spexy comment list --pending --json`
2. For each comment:
   - Note `id`, `target_file`, line anchors, and the `instruction`.
   - Inspect the anchored lines in `target_file`.
   - Make the requested corrections in code or documentation.
   - Verify changes with test suite:
     `bun test`
     `bun run typecheck`
   - Verify workspace health:
     `spexy doctor`
3. Resolve the comment:
   `spexy comment resolve <comment-id> --note "Addressed feedback and updated tests."`
   This automatically archives the comment to history and prunes it from pending.
4. Verify all comments are cleared:
   `spexy comment list --pending`
5. Check resolved history if needed:
   `spexy comment history --file <target_file>`
