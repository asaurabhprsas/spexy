import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  validateTaskGraph,
  getTaskAvailability,
  getBlockingDependencies,
  transitionTask,
  WorkflowRuleError,
} from "./dag/workflow";
import {
  parseDocumentFrontmatter,
  serializeDocumentWithFrontmatter,
} from "./schemas/frontmatter";
import {
  initSpecFlowWorkspace,
  getSteeringStatus,
  createSpec,
  readTasksYaml,
  writeTasksYaml,
  flattenTasks,
  updateTaskInDoc,
} from "./fs/workspace";
import {
  createSnapshot,
  listSnapshots,
  restoreSnapshot,
} from "./checkpoint/ring-buffer";
import {
  addComment,
  listComments,
  resolveComment,
  realignAnchor,
} from "./comments/fuzzy-anchor";
import { acquireTaskLease } from "./git/worktree";
import { TaskItem } from "./schemas/tasks";

describe("@spec-flow/core Test Suite", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "specflow-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("DAG Engine & Cycle Detection", () => {
    const makeTask = (id: string, depends_on: string[] = [], parent_id: string | null = null): TaskItem => ({
      id,
      parent_id,
      title: `Task ${id}`,
      description: "",
      status: "todo",
      priority: "medium",
      depends_on,
      worktree: null,
      branch: null,
      locked_at: null,
      files: [],
      leverage: "",
      requirements_ref: [],
      notes: { security: null, testing: null },
    });

    it("rejects circular dependencies (A -> B -> A)", () => {
      const tasks = [
        makeTask("task-A", ["task-B"]),
        makeTask("task-B", ["task-A"]),
      ];
      expect(() => validateTaskGraph(tasks)).toThrow(/cycle/i);
    });

    it("rejects multi-node circular dependencies (A -> B -> C -> A)", () => {
      const tasks = [
        makeTask("task-A", ["task-B"]),
        makeTask("task-B", ["task-C"]),
        makeTask("task-C", ["task-A"]),
      ];
      expect(() => validateTaskGraph(tasks)).toThrow(/cycle/i);
    });

    it("accepts valid diamond DAGs", () => {
      const tasks = [
        makeTask("A"),
        makeTask("B", ["A"]),
        makeTask("C", ["A"]),
        makeTask("D", ["B", "C"]),
      ];
      expect(() => validateTaskGraph(tasks)).not.toThrow();
    });

    it("computes task availability and blockers dynamically", () => {
      const tasks = [
        makeTask("foundation"),
        makeTask("feature-ui", ["foundation"]),
      ];

      const availability = getTaskAvailability(tasks, { foundation: "in-progress" });
      expect(availability.get("foundation")).toBe("claimed");
      expect(availability.get("feature-ui")).toBe("blocked");

      const blockers = getBlockingDependencies("feature-ui", tasks, { foundation: "in-progress" });
      expect(blockers).toEqual(["foundation"]);

      const afterDone = getTaskAvailability(tasks, { foundation: "done", "feature-ui": "todo" });
      expect(afterDone.get("feature-ui")).toBe("available");
    });
  });

  describe("Two-Tier HITL State Machine", () => {
    it("permits agents to claim and submit, but strictly forbids agents from approving to done", () => {
      expect(transitionTask("todo", "claim", "agent")).toBe("in-progress");
      expect(transitionTask("in-progress", "submit", "agent")).toBe("to-review");

      // Agent trying to approve
      expect(() => transitionTask("to-review", "approve", "agent")).toThrow(/human/i);

      // Human approval
      expect(transitionTask("to-review", "approve", "human")).toBe("done");

      // Human rejection
      expect(transitionTask("to-review", "reject", "human")).toBe("todo");
    });
  });

  describe("Frontmatter Parsing & Serialization", () => {
    it("round-trips document frontmatter correctly", () => {
      const sample = `---
status: approved
updated_at: 2026-10-22T00:00:00Z
approved_by: "human"
---

# Title
Document body here.`;

      const parsed = parseDocumentFrontmatter(sample);
      expect(parsed.frontmatter.status).toBe("approved");
      expect(parsed.frontmatter.approved_by).toBe("human");
      expect(parsed.body).toContain("# Title");

      const serialized = serializeDocumentWithFrontmatter(parsed.frontmatter, parsed.body);
      const reParsed = parseDocumentFrontmatter(serialized);
      expect(reParsed.frontmatter.status).toBe("approved");
      expect(reParsed.frontmatter.approved_by).toBe("human");
    });
  });

  describe("Workspace File Operations (.specflow/ & docs/)", () => {
    it("initializes directory structure with steering docs and docs/ folder", () => {
      initSpecFlowWorkspace(tmpDir);

      expect(fs.existsSync(path.join(tmpDir, ".specflow", "config.yaml"))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, ".specflow", "steering", "product.md"))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, "docs", "ARCHITECTURE.md"))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, "docs", "PROGRESS.md"))).toBe(true);

      const status = getSteeringStatus(tmpDir);
      expect(status.approved).toBe(false);
      expect(status.total).toBe(3);
    });

    it("enforces steering gate before creating a spec unless forced", () => {
      initSpecFlowWorkspace(tmpDir);

      // Should be blocked because steering is draft
      expect(() => createSpec(tmpDir, "auth-system")).toThrow(/steering/i);

      // Can be forced or created after approval
      expect(() => createSpec(tmpDir, "auth-system", { force: true })).not.toThrow();

      const tasksDoc = readTasksYaml(tmpDir, "auth-system");
      expect(tasksDoc.feature).toBe("auth-system");
      expect(tasksDoc.groups.length).toBeGreaterThan(0);
    });
  });

  describe("Checkpoint Ring-Buffer", () => {
    it("creates snapshots and prunes oldest when exceeding limit", () => {
      initSpecFlowWorkspace(tmpDir);
      const testFile = path.join(tmpDir, "test-doc.md");
      fs.writeFileSync(testFile, "initial content", "utf-8");

      for (let i = 1; i <= 25; i++) {
        fs.writeFileSync(testFile, `content version ${i}`, "utf-8");
        createSnapshot(tmpDir, testFile, 5); // max 5
      }

      const snapshots = listSnapshots(tmpDir, testFile);
      expect(snapshots.length).toBe(5);

      // Restore snapshot
      restoreSnapshot(tmpDir, snapshots[0].id);
      expect(fs.readFileSync(testFile, "utf-8")).toBe("content version 25");
    });
  });

  describe("Context-Anchored Comments & Fuzzy Re-alignment", () => {
    it("adds, lists, and resolves comments", () => {
      initSpecFlowWorkspace(tmpDir);
      const comment = addComment(tmpDir, {
        target_file: "specs/demo/requirements.md",
        author: "human",
        anchor: {
          start_line: 10,
          end_line: 11,
          anchor_text: "Target text to be changed",
          context_before: "Section 2",
        },
        instruction: "Update requirement to be stricter",
      });

      const list = listComments(tmpDir, { pendingOnly: true });
      expect(list.length).toBe(1);
      expect(list[0].id).toBe(comment.id);

      resolveComment(tmpDir, comment.id, "Requirement updated");
      const after = listComments(tmpDir, { pendingOnly: true });
      expect(after.length).toBe(0);
    });

    it("fuzzy realigns line numbers when content shifts", () => {
      const original = `Header\nContext Before\nTarget anchor line\nAfter`;
      const shifted = `Added line 1\nAdded line 2\nHeader\nContext Before\nTarget anchor line\nAfter`;

      const result = realignAnchor(shifted, "Target anchor line", "Context Before", 3);
      expect(result.matched).toBe(true);
      expect(result.start_line).toBe(5);
    });
  });

  describe("Git Worktree Task Lease", () => {
    it("prevents lease conflict if another worktree owns the task", () => {
      const task: TaskItem = {
        id: "task-1",
        parent_id: null,
        title: "Test Task",
        description: "",
        status: "in-progress",
        priority: "medium",
        depends_on: [],
        worktree: "worktree-auth",
        branch: "feat-auth",
        locked_at: new Date().toISOString(),
        files: [],
        leverage: "",
        requirements_ref: [],
        notes: { security: null, testing: null },
      };

      // Same worktree claiming again is fine
      expect(() => acquireTaskLease(task, "worktree-auth", "feat-auth")).not.toThrow();

      // Another worktree claiming throws lease conflict
      expect(() => acquireTaskLease(task, "worktree-billing", "feat-billing")).toThrow(
        /already leased/i,
      );
    });
  });
});
