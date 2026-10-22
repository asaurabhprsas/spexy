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
  listSpecFiles,
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
  deleteComment,
  updateComment,
  listCommentHistory,
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
    it("adds, lists, and resolves comments with history archiving", () => {
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

      const resolved = resolveComment(tmpDir, comment.id, "Requirement updated");
      expect(resolved.status).toBe("addressed");
      expect(resolved.resolution_note).toBe("Requirement updated");
      expect(resolved.resolved_by).toBe("human");
      expect(resolved.resolved_at).toBeDefined();

      const after = listComments(tmpDir, { pendingOnly: true });
      expect(after.length).toBe(0);

      // Verify history file was written
      const history = listCommentHistory(tmpDir);
      expect(history.length).toBe(1);
      expect(history[0].id).toBe(comment.id);
      expect(history[0].resolution_note).toBe("Requirement updated");
      expect(history[0].resolved_by).toBe("human");

      // Test filtering by target_file
      const filtered = listCommentHistory(tmpDir, "specs/demo/requirements.md");
      expect(filtered.length).toBe(1);
      const none = listCommentHistory(tmpDir, "other.md");
      expect(none.length).toBe(0);
    });

    it("deletes and updates pending comments", () => {
      initSpecFlowWorkspace(tmpDir);
      const comment = addComment(tmpDir, {
        target_file: "specs/demo/design.md",
        author: "human",
        anchor: {
          start_line: 5,
          end_line: 6,
          anchor_text: "Original architecture",
          context_before: "",
        },
        instruction: "Clarify API gateway",
      });

      // Update instruction and anchor
      const updated = updateComment(tmpDir, comment.id, {
        instruction: "Clarify API gateway and rate limits",
        anchor: { start_line: 8, end_line: 9 },
      });
      expect(updated.instruction).toBe("Clarify API gateway and rate limits");
      expect(updated.anchor.start_line).toBe(8);
      expect(updated.anchor.anchor_text).toBe("Original architecture");

      // Delete comment
      deleteComment(tmpDir, comment.id);
      const remaining = listComments(tmpDir);
      expect(remaining.length).toBe(0);

      // Expect throws when not found
      expect(() => deleteComment(tmpDir, "non-existent")).toThrow(/not found/i);
      expect(() => updateComment(tmpDir, "non-existent", { instruction: "test" })).toThrow(/not found/i);
    });

    it("fuzzy realigns line numbers when content shifts", () => {
      const original = `Header\nContext Before\nTarget anchor line\nAfter`;
      const shifted = `Added line 1\nAdded line 2\nHeader\nContext Before\nTarget anchor line\nAfter`;

      const result = realignAnchor(shifted, "Target anchor line", "Context Before", 3);
      expect(result.matched).toBe(true);
      expect(result.start_line).toBe(5);
    });
  });

  describe("Spec Auxiliary Files Discovery (listSpecFiles)", () => {
    it("discovers requirements, design, tasks, logs, and recursive references/images", () => {
      initSpecFlowWorkspace(tmpDir);
      createSpec(tmpDir, "auth-feature", { force: true, title: "Authentication" });

      // Add files in references/ and images/
      const specDir = path.join(tmpDir, ".specflow", "specs", "auth-feature");
      fs.writeFileSync(path.join(specDir, "references", "architecture.txt"), "System diagram notes", "utf-8");
      fs.mkdirSync(path.join(specDir, "references", "nested"), { recursive: true });
      fs.writeFileSync(path.join(specDir, "references", "nested", "api-contract.json"), "{}", "utf-8");
      fs.writeFileSync(path.join(specDir, "images", "wireframe.png"), "fake png binary", "utf-8");

      const files = listSpecFiles(tmpDir, "auth-feature");
      expect(files.length).toBeGreaterThanOrEqual(7);

      const reqFile = files.find((f) => f.kind === "requirements");
      expect(reqFile).toBeDefined();
      expect(reqFile?.name).toBe("requirements.md");
      expect(reqFile?.relativePath).toBe("requirements.md");
      expect(reqFile?.extension).toBe("md");

      const designFile = files.find((f) => f.kind === "design");
      expect(designFile).toBeDefined();
      expect(designFile?.name).toBe("design.md");

      const tasksFile = files.find((f) => f.kind === "tasks");
      expect(tasksFile).toBeDefined();
      expect(tasksFile?.name).toBe("tasks.yaml");
      expect(tasksFile?.extension).toBe("yaml");

      const logFile = files.find((f) => f.kind === "log");
      expect(logFile).toBeDefined();
      expect(logFile?.name).toBe("implementation.log");

      const refFile = files.find((f) => f.name === "architecture.txt");
      expect(refFile).toBeDefined();
      expect(refFile?.kind).toBe("reference");
      expect(refFile?.relativePath).toBe("references/architecture.txt");

      const nestedRef = files.find((f) => f.name === "api-contract.json");
      expect(nestedRef).toBeDefined();
      expect(nestedRef?.kind).toBe("reference");
      expect(nestedRef?.relativePath).toBe("references/nested/api-contract.json");

      const imgFile = files.find((f) => f.name === "wireframe.png");
      expect(imgFile).toBeDefined();
      expect(imgFile?.kind).toBe("image");
      expect(imgFile?.relativePath).toBe("images/wireframe.png");
      expect(imgFile?.extension).toBe("png");
    });
  });

  describe("Turnkey Templates & Actionable Agent Prompts", () => {
    it("scaffolds turnkey templates and actionable agent prompts on workspace init", () => {
      initSpecFlowWorkspace(tmpDir);

      const sfDir = path.join(tmpDir, ".specflow");
      // Verify templates exist
      expect(fs.existsSync(path.join(sfDir, "templates", "steering", "product.template.md"))).toBe(true);
      expect(fs.existsSync(path.join(sfDir, "templates", "steering", "tech.template.md"))).toBe(true);
      expect(fs.existsSync(path.join(sfDir, "templates", "steering", "structure.template.md"))).toBe(true);
      expect(fs.existsSync(path.join(sfDir, "templates", "specs", "requirements.template.md"))).toBe(true);
      expect(fs.existsSync(path.join(sfDir, "templates", "specs", "design.template.md"))).toBe(true);
      expect(fs.existsSync(path.join(sfDir, "templates", "specs", "tasks.template.yaml"))).toBe(true);

      // Verify prompts exist
      expect(fs.existsSync(path.join(sfDir, "prompts", "README.md"))).toBe(true);
      expect(fs.existsSync(path.join(sfDir, "prompts", "01-create-steering.md"))).toBe(true);
      expect(fs.existsSync(path.join(sfDir, "prompts", "02-create-spec.md"))).toBe(true);
      expect(fs.existsSync(path.join(sfDir, "prompts", "03-create-tasks.md"))).toBe(true);
      expect(fs.existsSync(path.join(sfDir, "prompts", "04-execute-task.md"))).toBe(true);
      expect(fs.existsSync(path.join(sfDir, "prompts", "05-address-comments.md"))).toBe(true);

      // Verify createSpec creates references and images dirs
      createSpec(tmpDir, "test-spec", { force: true });
      expect(fs.existsSync(path.join(sfDir, "specs", "test-spec", "references"))).toBe(true);
      expect(fs.existsSync(path.join(sfDir, "specs", "test-spec", "images"))).toBe(true);
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
