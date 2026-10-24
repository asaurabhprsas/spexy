#!/usr/bin/env node
import path from "node:path";
import fs from "node:fs";
import { Command } from "commander";
import YAML from "yaml";
import packageJson from "../package.json";
import {
  findProjectRoot,
  getSpecflowDir,
  initSpexyWorkspace,
  getSteeringStatus,
  listSpecs,
  createSpec,
  readTasksYaml,
  writeTasksYaml,
  flattenTasks,
  updateTaskInDoc,
  getTaskAvailability,
  getBlockingDependencies,
  transitionTask,
  listComments,
  resolveComment,
  deleteComment,
  updateComment,
  listCommentHistory,
  listSnapshots,
  restoreSnapshot,
  acquireTaskLease,
  releaseTaskLease,
  resolveGitContext,
  registerWorktree,
  listDocuments,
  findDocument,
  archiveDocument,
  parseDocumentFrontmatter,
  serializeDocumentWithFrontmatter,
  runHealthCheck,
  formatHealthReport,
  WorkflowRuleError,
  type TaskItem,
  type TasksDocument,
  type HealthReport,
} from "@spexy/core";
import { startServer } from "./server";

type OutputFormat = "json" | "yaml" | "text";

function resolveFormat(options: {
  format?: string;
  json?: boolean;
  yaml?: boolean;
}): OutputFormat {
  if (options.format) {
    const fmt = options.format.toLowerCase();
    if (fmt === "json" || fmt === "yaml") {
      return fmt;
    }
    throw new Error(`Invalid format "${options.format}". Supported formats are: json, yaml.`);
  }
  if (options.yaml) return "yaml";
  if (options.json) return "json";
  return "text";
}

function dumpYaml(data: unknown): string {
  try {
    const jsYaml = require("js-yaml");
    if (typeof jsYaml.dump === "function") {
      return jsYaml.dump(data).trimEnd() + "\n";
    }
  } catch {
    // fallback to YAML
  }
  return YAML.stringify(data).trimEnd() + "\n";
}

const program = new Command();

program
  .name("spexy")
  .description("Spexy CLI: Spec-Driven Development orchestration for AI agents and human architects")
  .version(packageJson.version || "0.1.0")
  .option("--dashboard", "Start the local dashboard server")
  .option("--port <port>", "Port for dashboard server", (v) => parseInt(v, 10))
  .option("--host <host>", "Host for dashboard server")
  .option("--doctor", "Run workspace health checks")
  .option("--check", "Run workspace health checks (alias for --doctor)");

function getRoot(): string {
  return findProjectRoot(process.cwd());
}

function handleDoctor(options: { compact?: boolean; json?: boolean }): void {
  try {
    const projectRoot = getRoot();
    const report = runHealthCheck(projectRoot);
    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else if (options.compact) {
      console.log(formatHealthReport(report, { compact: true }));
    } else {
      console.log(formatHealthReport(report));
    }
    if (!report.valid) {
      process.exit(1);
    }
  } catch (err: any) {
    console.error(`Error executing health check: ${err.message}`);
    process.exit(1);
  }
}

function appendToImplementationLog(specDir: string, message: string): void {
  const logPath = path.join(specDir, "implementation.log");
  const entry = `- [${new Date().toISOString()}] ${message}\n`;
  try {
    fs.appendFileSync(logPath, entry, "utf-8");
  } catch {
    // ignore
  }
}

function findTaskAcrossSpecs(projectRoot: string, taskId: string): {
  specId: string;
  tasksDoc: TasksDocument;
  task: TaskItem;
  specDir: string;
} {
  const specs = listSpecs(projectRoot);
  for (const spec of specs) {
    try {
      const tasksDoc = readTasksYaml(projectRoot, spec.id);
      const tasks = flattenTasks(tasksDoc);
      const found = tasks.find((t) => t.id === taskId);
      if (found) {
        const specDir = path.join(getSpecflowDir(projectRoot), "specs", spec.id);
        return { specId: spec.id, tasksDoc, task: found, specDir };
      }
    } catch {
      // ignore
    }
  }
  throw new Error(`Task "${taskId}" not found in any active spec.`);
}

// 1. init
program
  .command("init")
  .description("Initialize .spexy/ workspace")
  .argument("[dir]", "Target workspace directory", ".")
  .action((dir) => {
    try {
      const targetDir = path.resolve(process.cwd(), dir);
      initSpexyWorkspace(targetDir);
      console.log(`✓ Spexy workspace initialized at: ${targetDir}`);
      console.log(`  • Created .spexy/ (steering, specs, templates, .cache)`);
      console.log(`\nNext step: Run "spexy status" to review steering documents.`);
    } catch (err: any) {
      console.error(`Error initializing workspace: ${err.message}`);
      process.exit(1);
    }
  });

// 2. status
program
  .command("status")
  .description("Output steering document approval status and active spec summary")
  .option("--json", "Output status as JSON")
  .action((options) => {
    try {
      const projectRoot = getRoot();
      const steering = getSteeringStatus(projectRoot);
      const specs = listSpecs(projectRoot);

      if (options.json) {
        console.log(JSON.stringify({ projectRoot, steering, specs }, null, 2));
        return;
      }

      console.log(`=== Spexy Workspace Status ===`);
      console.log(`Root: ${projectRoot}\n`);

      const steeringStatusLabel = steering.approved
        ? "APPROVED"
        : `DRAFT (${steering.approvedCount}/${steering.total} approved - Human approval required)`;

      console.log(`Steering Documents Gate: [${steeringStatusLabel}]`);
      if (steering.documents.length === 0) {
        console.log(`  (No steering documents found. Run "spexy init".)`);
      } else {
        for (const doc of steering.documents) {
          const badge = doc.status === "approved" ? "APPROVED" : "DRAFT   ";
          const approver = doc.approved_by ? ` (approved by: ${doc.approved_by})` : "";
          console.log(`  [${badge}] ${doc.filename.padEnd(14)} ${doc.title}${approver}`);
        }
      }

      console.log(`\nActive Specs (${specs.length}):`);
      if (specs.length === 0) {
        console.log(`  (No specs found. Create one with "spexy spec create <id>".)`);
      } else {
        for (const spec of specs) {
          const percent = spec.taskCount > 0 ? Math.round((spec.completedTaskCount / spec.taskCount) * 100) : 0;
          console.log(`  • ${spec.id} [${spec.status}]: ${spec.completedTaskCount}/${spec.taskCount} tasks done (${percent}%)`);
        }
      }
    } catch (err: any) {
      console.error(`Error checking status: ${err.message}`);
      process.exit(1);
    }
  });

// 3. spec list & spec create
const specCmd = program.command("spec").description("Manage specifications");

specCmd
  .command("list")
  .description("List all specs with status and task completion percentage")
  .option("-c, --compact", "Output minimal spec fields ({ id, status, tasks })")
  .option("--format <format>", "Format output as json or yaml")
  .option("--yaml", "Output spec list as YAML")
  .option("--json", "Output spec list as JSON")
  .action((options) => {
    try {
      const projectRoot = getRoot();
      const format = resolveFormat(options);
      const specs = listSpecs(projectRoot);

      const outputSpecs = options.compact
        ? specs.map((s) => ({
            id: s.id,
            status: s.status,
            tasks: `${s.completedTaskCount}/${s.taskCount}`,
          }))
        : specs.map((s) => ({
            ...s,
            completionPercentage: s.taskCount > 0 ? Math.round((s.completedTaskCount / s.taskCount) * 100) : 0,
          }));

      if (format === "json") {
        console.log(JSON.stringify(outputSpecs, null, 2));
        return;
      }

      if (format === "yaml") {
        console.log(dumpYaml(outputSpecs));
        return;
      }

      if (outputSpecs.length === 0) {
        console.log(`No specs found. Create a spec with "spexy spec create <id>".`);
        return;
      }

      if (options.compact) {
        console.log(`ID`.padEnd(20) + `STATUS`.padEnd(15) + `TASKS`);
        console.log(`-`.repeat(50));
        for (const s of outputSpecs as any[]) {
          console.log(s.id.padEnd(20) + s.status.padEnd(15) + s.tasks);
        }
      } else {
        console.log(`ID`.padEnd(20) + `STATUS`.padEnd(15) + `PROGRESS`.padEnd(15) + `NAME`);
        console.log(`-`.repeat(65));
        for (const s of outputSpecs as any[]) {
          const progress = `${s.completedTaskCount}/${s.taskCount} (${s.completionPercentage}%)`;
          console.log(s.id.padEnd(20) + s.status.padEnd(15) + progress.padEnd(15) + s.name);
        }
      }
    } catch (err: any) {
      console.error(`Error listing specs: ${err.message}`);
      process.exit(1);
    }
  });

specCmd
  .command("create <id>")
  .description("Create a new feature spec")
  .option("--title <title>", "Human-readable title for the feature spec")
  .option("--force", "Bypass steering document approval gate")
  .action((id, options) => {
    try {
      const projectRoot = getRoot();
      createSpec(projectRoot, id, { force: options.force, title: options.title });
      console.log(`✓ Spec "${id}" created successfully.`);
      console.log(`  Files created under: .spexy/specs/${id}/`);
      console.log(`  • requirements.md`);
      console.log(`  • design.md`);
      console.log(`  • tasks.yaml`);
      console.log(`  • implementation.log`);
    } catch (err: any) {
      console.error(`Error creating spec "${id}": ${err.message}`);
      process.exit(1);
    }
  });

// 4. task commands: list, start, complete, approve, reject
const taskCmd = program.command("task").description("Manage tasks, availability, and HITL lifecycle");

taskCmd
  .command("list [spec-id]")
  .description("List tasks with status, priority, availability, and blocking dependencies")
  .option("-c, --compact", "Output minimal task fields ({ id, spec_id, title, status, priority, availability, blockers })")
  .option("--format <format>", "Format output as json or yaml")
  .option("--yaml", "Output task list as YAML")
  .option("--available", "Filter to only tasks available for execution")
  .option("--json", "Output task list as JSON")
  .action((specId, options) => {
    try {
      const projectRoot = getRoot();
      const format = resolveFormat(options);
      const specs = specId ? [{ id: specId }] : listSpecs(projectRoot);

      if (specs.length === 0) {
        if (format === "json") {
          console.log(JSON.stringify([]));
        } else if (format === "yaml") {
          console.log(dumpYaml([]));
        } else {
          console.log(`No specs found. Create a spec with "spexy spec create <id>".`);
        }
        return;
      }

      interface TaskWithDetails extends TaskItem {
        spec_id: string;
        availability: string;
        blockers: string[];
      }

      const allTasks: TaskWithDetails[] = [];

      for (const s of specs) {
        try {
          const doc = readTasksYaml(projectRoot, s.id);
          const tasks = flattenTasks(doc);
          const statuses = Object.fromEntries(tasks.map((t) => [t.id, t.status]));
          const availabilityMap = getTaskAvailability(tasks, statuses);

          for (const t of tasks) {
            const avail = availabilityMap.get(t.id) ?? "available";
            const blockers = getBlockingDependencies(t.id, tasks, statuses);

            if (options.available && avail !== "available") {
              continue;
            }

            allTasks.push({
              ...t,
              spec_id: s.id,
              availability: avail,
              blockers,
            });
          }
        } catch (err: any) {
          if (specId) throw err;
        }
      }

      const outputTasks = options.compact
        ? allTasks.map((t) => ({
            id: t.id,
            spec_id: t.spec_id,
            title: t.title,
            status: t.status,
            priority: t.priority,
            availability: t.availability,
            blockers: t.blockers,
          }))
        : allTasks;

      if (format === "json") {
        console.log(JSON.stringify(outputTasks, null, 2));
        return;
      }

      if (format === "yaml") {
        console.log(dumpYaml(outputTasks));
        return;
      }

      if (allTasks.length === 0) {
        console.log(options.available ? `No tasks currently available for claiming.` : `No tasks found.`);
        return;
      }

      console.log(
        `ID`.padEnd(10) +
          `SPEC`.padEnd(16) +
          `AVAILABILITY`.padEnd(15) +
          `STATUS`.padEnd(14) +
          `PRIORITY`.padEnd(10) +
          `BLOCKERS`.padEnd(15) +
          `TITLE`,
      );
      console.log(`-`.repeat(95));
      for (const t of allTasks) {
        const blockerStr = t.blockers.length > 0 ? t.blockers.join(",") : "-";
        console.log(
          t.id.padEnd(10) +
            t.spec_id.slice(0, 14).padEnd(16) +
            t.availability.padEnd(15) +
            t.status.padEnd(14) +
            t.priority.padEnd(10) +
            blockerStr.padEnd(15) +
            t.title,
        );
      }
    } catch (err: any) {
      console.error(`Error listing tasks: ${err.message}`);
      process.exit(1);
    }
  });

taskCmd
  .command("start <task-id>")
  .alias("claim")
  .description("Claim task and lock Git worktree lease (transitions to in-progress)")
  .option("--actor <actor>", "Actor claiming the task: agent or human", "agent")
  .option("--force", "Bypass AI spec approval checks", false)
  .action((taskId, options) => {
    try {
      const projectRoot = getRoot();
      const { specId, tasksDoc, task, specDir } = findTaskAcrossSpecs(projectRoot, taskId);

      // Validate availability and transition
      if (task.status !== "todo") {
        throw new WorkflowRuleError(
          "TASK_NOT_CLAIMABLE",
          `Cannot start task "${taskId}": task status is "${task.status}". Only "todo" tasks can be claimed.`,
        );
      }

      // Check blockers
      const allTasks = flattenTasks(tasksDoc);
      const statuses = Object.fromEntries(allTasks.map((t) => [t.id, t.status]));
      const blockers = getBlockingDependencies(task.id, allTasks, statuses);
      if (blockers.length > 0) {
        throw new WorkflowRuleError(
          "TASK_BLOCKED",
          `Cannot start task "${taskId}": blocked by incomplete dependencies: ${blockers.join(", ")}.`,
        );
      }

      // AI Gate: agents cannot claim tasks if steering or parent spec requirements/design are not approved
      const actor = options.actor || "agent";
      if (actor === "agent" && !options.force) {
        const steering = getSteeringStatus(projectRoot);
        if (!steering.approved) {
          throw new WorkflowRuleError(
            "STEERING_NOT_APPROVED",
            `Cannot claim task "${taskId}": Workspace steering documents are not approved. Steering docs must be approved before feature tasks can be executed. Check status with: spexy status`,
          );
        }

        const reqPath = path.join(specDir, "requirements.md");
        const desPath = path.join(specDir, "design.md");
        let reqApproved = false;
        let desApproved = false;

        if (fs.existsSync(reqPath)) {
          const { frontmatter } = parseDocumentFrontmatter(fs.readFileSync(reqPath, "utf-8"));
          reqApproved = frontmatter.status === "approved";
        }
        if (fs.existsSync(desPath)) {
          const { frontmatter } = parseDocumentFrontmatter(fs.readFileSync(desPath, "utf-8"));
          desApproved = frontmatter.status === "approved";
        }

        if (!reqApproved || !desApproved) {
          const unapprovedDocs: string[] = [];
          if (!reqApproved) unapprovedDocs.push("requirements.md");
          if (!desApproved) unapprovedDocs.push("design.md");
          throw new WorkflowRuleError(
            "SPEC_NOT_APPROVED",
            `Cannot claim task "${taskId}": Spec "${specId}" has draft document(s): ${unapprovedDocs.join(", ")}. Requirements and design must be approved by a human before AI execution. Check status with: spexy doc get ${specId}:requirements or approve with: spexy doc approve ${specId}:requirements`,
          );
        }
      }

      // Check state machine
      transitionTask(task.status, "claim", actor as any);

      const git = resolveGitContext(process.cwd());
      const leasedTask = acquireTaskLease(task, git.currentWorktree, git.branch);

      const updatedDoc = updateTaskInDoc(tasksDoc, leasedTask);
      writeTasksYaml(projectRoot, specId, updatedDoc);
      registerWorktree(projectRoot, process.cwd());
      appendToImplementationLog(
        specDir,
        `Task ${taskId} claimed by worktree "${git.currentWorktree}" on branch "${git.branch}". Status: in-progress.`,
      );

      console.log(`✓ Task "${taskId}" claimed successfully.`);
      console.log(`  • Spec:     ${specId}`);
      console.log(`  • Status:   in-progress`);
      console.log(`  • Worktree: ${git.currentWorktree}`);
      console.log(`  • Branch:   ${git.branch}`);
    } catch (err: any) {
      console.error(`Error starting task "${taskId}": ${err.message}`);
      process.exit(1);
    }
  });

taskCmd
  .command("complete <task-id>")
  .description("Submit task for human review (transitions to to-review; strictly rejects agents marking done)")
  .option("--note <note>", "Implementation and verification notes for the human reviewer", "")
  .action((taskId, options) => {
    try {
      const projectRoot = getRoot();
      const { specId, tasksDoc, task, specDir } = findTaskAcrossSpecs(projectRoot, taskId);

      // Strictly enforce state machine (agents can only transition in-progress -> to-review)
      const nextStatus = transitionTask(task.status, "submit", "agent");

      const updatedTask: TaskItem = {
        ...task,
        status: nextStatus,
      };

      const updatedDoc = updateTaskInDoc(tasksDoc, updatedTask);
      writeTasksYaml(projectRoot, specId, updatedDoc);

      const noteText = options.note ? options.note : "Implementation completed and ready for human review.";
      appendToImplementationLog(
        specDir,
        `Task ${taskId} submitted for review by agent. Status: to-review. Note: ${noteText}`,
      );

      console.log(`✓ Task "${taskId}" submitted for human review.`);
      console.log(`  • Spec:   ${specId}`);
      console.log(`  • Status: to-review`);
      if (options.note) {
        console.log(`  • Note:   ${options.note}`);
      }
      console.log(`\nNotice: Only a human reviewer can verify and mark tasks as "done" (spexy task approve ${taskId} --human).`);
    } catch (err: any) {
      console.error(`Error completing task "${taskId}": ${err.message}`);
      process.exit(1);
    }
  });

taskCmd
  .command("approve <task-id>")
  .description("Human verification: approve submitted task and mark as done (requires --human)")
  .option("--human", "Confirm human verification authority")
  .action((taskId, options) => {
    try {
      if (!options.human) {
        console.error(`Error: Human verification required. Re-run with the --human flag to approve tasks.`);
        process.exit(1);
      }

      const projectRoot = getRoot();
      const { specId, tasksDoc, task, specDir } = findTaskAcrossSpecs(projectRoot, taskId);

      const nextStatus = transitionTask(task.status, "approve", "human");

      const updatedTask: TaskItem = {
        ...releaseTaskLease(task),
        status: nextStatus,
      };

      const updatedDoc = updateTaskInDoc(tasksDoc, updatedTask);
      writeTasksYaml(projectRoot, specId, updatedDoc);
      appendToImplementationLog(specDir, `Task ${taskId} verified and approved by human reviewer. Status: done.`);

      console.log(`✓ Task "${taskId}" approved by human reviewer.`);
      console.log(`  • Spec:   ${specId}`);
      console.log(`  • Status: done`);
    } catch (err: any) {
      console.error(`Error approving task "${taskId}": ${err.message}`);
      process.exit(1);
    }
  });

taskCmd
  .command("reject <task-id>")
  .description("Human rejection: reject submitted task and return to todo (requires --human)")
  .option("--human", "Confirm human verification authority")
  .option("--note <note>", "Feedback note explaining why task was rejected", "")
  .action((taskId, options) => {
    try {
      if (!options.human) {
        console.error(`Error: Human verification required. Re-run with the --human flag to reject tasks.`);
        process.exit(1);
      }

      const projectRoot = getRoot();
      const { specId, tasksDoc, task, specDir } = findTaskAcrossSpecs(projectRoot, taskId);

      const nextStatus = transitionTask(task.status, "reject", "human");

      const updatedTask: TaskItem = {
        ...releaseTaskLease(task),
        status: nextStatus,
        worktree: null,
        branch: null,
        locked_at: null,
      };

      const updatedDoc = updateTaskInDoc(tasksDoc, updatedTask);
      writeTasksYaml(projectRoot, specId, updatedDoc);

      const noteText = options.note ? options.note : "Task rejected during human review.";
      appendToImplementationLog(
        specDir,
        `Task ${taskId} rejected by human reviewer. Status: todo. Note: ${noteText}`,
      );

      console.log(`✓ Task "${taskId}" rejected by human reviewer.`);
      console.log(`  • Spec:   ${specId}`);
      console.log(`  • Status: todo`);
      if (options.note) {
        console.log(`  • Note:   ${options.note}`);
      }
    } catch (err: any) {
      console.error(`Error rejecting task "${taskId}": ${err.message}`);
      process.exit(1);
    }
  });

// 5. comment commands: list, resolve
const commentCmd = program.command("comment").description("Manage review comments and fuzzy anchors");

commentCmd
  .command("list")
  .description("List comments across documents")
  .option("-c, --compact", "Output minimal comment fields ({ id, status, author, target_file, lines, instruction })")
  .option("--format <format>", "Format output as json or yaml")
  .option("--yaml", "Output comments as YAML")
  .option("--pending", "Show only pending comments")
  .option("--json", "Output comments as JSON")
  .action((options) => {
    try {
      const projectRoot = getRoot();
      const format = resolveFormat(options);
      const comments = listComments(projectRoot, { pendingOnly: options.pending });

      const outputComments = options.compact
        ? comments.map((c) => ({
            id: c.id,
            status: c.status,
            author: c.author,
            target_file: c.target_file,
            lines: c.anchor ? `${c.anchor.start_line}-${c.anchor.end_line}` : "-",
            instruction: c.instruction,
          }))
        : comments;

      if (format === "json") {
        console.log(JSON.stringify(outputComments, null, 2));
        return;
      }

      if (format === "yaml") {
        console.log(dumpYaml(outputComments));
        return;
      }

      if (comments.length === 0) {
        console.log(options.pending ? `No pending comments found.` : `No comments found.`);
        return;
      }

      console.log(
        `ID`.padEnd(14) +
          `STATUS`.padEnd(12) +
          `AUTHOR`.padEnd(10) +
          `FILE`.padEnd(30) +
          `LINES`.padEnd(10) +
          `INSTRUCTION`,
      );
      console.log(`-`.repeat(95));
      for (const c of comments) {
        const lines = c.anchor ? `${c.anchor.start_line}-${c.anchor.end_line}` : "-";
        console.log(
          c.id.padEnd(14) +
            c.status.padEnd(12) +
            c.author.padEnd(10) +
            c.target_file.slice(0, 28).padEnd(30) +
            lines.padEnd(10) +
            c.instruction,
        );
      }
    } catch (err: any) {
      console.error(`Error listing comments: ${err.message}`);
      process.exit(1);
    }
  });

commentCmd
  .command("resolve <id>")
  .description("Resolve a comment and auto-purge it from the active pending queue")
  .option("--note <note>", "Resolution note detailing how feedback was addressed", "Addressed and resolved.")
  .action((id, options) => {
    try {
      const projectRoot = getRoot();
      const note = options.note || "Addressed and resolved.";
      resolveComment(projectRoot, id, note, { purge: true });
      console.log(`✓ Comment "${id}" resolved and purged from pending queue.`);
      console.log(`  • Resolution Note: ${note}`);
    } catch (err: any) {
      console.error(`Error resolving comment "${id}": ${err.message}`);
      process.exit(1);
    }
  });

commentCmd
  .command("delete <id>")
  .description("Delete a pending comment")
  .action((id) => {
    try {
      const projectRoot = getRoot();
      deleteComment(projectRoot, id);
      console.log(`✓ Comment "${id}" deleted.`);
    } catch (err: any) {
      console.error(`Error deleting comment "${id}": ${err.message}`);
      process.exit(1);
    }
  });

commentCmd
  .command("edit <id>")
  .description("Edit an existing pending comment instruction")
  .requiredOption("--instruction <text>", "Updated comment instruction")
  .action((id, options) => {
    try {
      const projectRoot = getRoot();
      const updated = updateComment(projectRoot, id, { instruction: options.instruction });
      console.log(`✓ Comment "${id}" updated.`);
      console.log(`  • Instruction: ${updated.instruction}`);
    } catch (err: any) {
      console.error(`Error updating comment "${id}": ${err.message}`);
      process.exit(1);
    }
  });

commentCmd
  .command("history")
  .description("List resolved comment history")
  .option("--file <file>", "Filter history by target file")
  .option("--json", "Output history as JSON")
  .action((options) => {
    try {
      const projectRoot = getRoot();
      const history = listCommentHistory(projectRoot, options.file);

      if (options.json) {
        console.log(JSON.stringify(history, null, 2));
        return;
      }

      if (history.length === 0) {
        console.log(options.file ? `No comment history for file: ${options.file}` : `No comment history found.`);
        return;
      }

      console.log(
        `ID`.padEnd(14) +
          `RESOLVED_AT`.padEnd(25) +
          `AUTHOR`.padEnd(10) +
          `FILE`.padEnd(30) +
          `RESOLUTION NOTE`,
      );
      console.log(`-`.repeat(100));
      for (const c of history) {
        const resolvedAt = (c.resolved_at || c.created_at || "").slice(0, 19).padEnd(25);
        console.log(
          c.id.padEnd(14) +
            resolvedAt +
            c.author.padEnd(10) +
            c.target_file.slice(0, 28).padEnd(30) +
            (c.resolution_note || "-"),
        );
      }
    } catch (err: any) {
      console.error(`Error listing comment history: ${err.message}`);
      process.exit(1);
    }
  });

// 6. checkpoint commands: list, restore
const checkpointCmd = program.command("checkpoint").description("Manage snapshot checkpoints and rollbacks");

checkpointCmd
  .command("list [file]")
  .description("List file snapshots with hashes, timestamps, and sizes")
  .option("--json", "Output snapshots as JSON")
  .action((file, options) => {
    try {
      const projectRoot = getRoot();
      const snapshots = listSnapshots(projectRoot, file);

      if (options.json) {
        console.log(JSON.stringify(snapshots, null, 2));
        return;
      }

      if (snapshots.length === 0) {
        console.log(file ? `No checkpoints found for file "${file}".` : `No checkpoints found.`);
        return;
      }

      console.log(
        `SNAPSHOT ID`.padEnd(28) +
          `HASH`.padEnd(14) +
          `SIZE`.padEnd(10) +
          `TIMESTAMP`.padEnd(26) +
          `FILE`,
      );
      console.log(`-`.repeat(95));
      for (const s of snapshots) {
        const sizeStr = `${(s.size / 1024).toFixed(1)} KB`;
        console.log(
          s.id.padEnd(28) +
            s.hash.padEnd(14) +
            sizeStr.padEnd(10) +
            s.timestamp.padEnd(26) +
            s.relativePath,
        );
      }
    } catch (err: any) {
      console.error(`Error listing checkpoints: ${err.message}`);
      process.exit(1);
    }
  });

checkpointCmd
  .command("restore <id>")
  .description("Restore file from a snapshot checkpoint")
  .action((id) => {
    try {
      const projectRoot = getRoot();
      const { restoredFile, entry } = restoreSnapshot(projectRoot, id);
      console.log(`✓ Restored snapshot "${id}".`);
      console.log(`  • Target File: ${restoredFile}`);
      console.log(`  • Timestamp:   ${entry.timestamp}`);
      console.log(`  • Hash:        ${entry.hash}`);
    } catch (err: any) {
      console.error(`Error restoring checkpoint "${id}": ${err.message}`);
      process.exit(1);
    }
  });

// 7. doc commands: list, get
const docCmd = program.command("doc").description("Manage and inspect steering and specification documents");

docCmd
  .command("list")
  .description("List all documents found in steering and specs")
  .option("-c, --compact", "Output minimal document fields ({ id, path, status })")
  .option("--format <format>", "Format output as json or yaml")
  .option("--yaml", "Output document list as YAML")
  .option("--json", "Output document list as JSON")
  .action((options) => {
    try {
      const projectRoot = getRoot();
      const format = resolveFormat(options);
      const docs = listDocuments(projectRoot);

      const outputDocs = options.compact
        ? docs.map((d) => ({
            id: d.id,
            path: d.path,
            status: d.status,
          }))
        : docs.map((d) => ({
            id: d.id,
            path: d.path,
            kind: d.kind,
            status: d.status,
            title: d.title,
          }));

      if (format === "json") {
        console.log(JSON.stringify(outputDocs, null, 2));
        return;
      }

      if (format === "yaml") {
        console.log(dumpYaml(outputDocs));
        return;
      }

      if (outputDocs.length === 0) {
        console.log("No documents found.");
        return;
      }

      if (options.compact) {
        console.log(`ID`.padEnd(25) + `STATUS`.padEnd(14) + `PATH`);
        console.log(`-`.repeat(70));
        for (const d of outputDocs as any[]) {
          console.log(d.id.padEnd(25) + d.status.padEnd(14) + d.path);
        }
      } else {
        console.log(`ID`.padEnd(25) + `KIND`.padEnd(16) + `STATUS`.padEnd(14) + `TITLE`);
        console.log(`-`.repeat(80));
        for (const d of outputDocs as any[]) {
          console.log(d.id.padEnd(25) + d.kind.padEnd(16) + d.status.padEnd(14) + d.title);
        }
      }
    } catch (err: any) {
      console.error(`Error listing documents: ${err.message}`);
      process.exit(1);
    }
  });

docCmd
  .command("get <path-or-id>")
  .description("Get a document by ID or path")
  .option("-c, --compact", "Output only frontmatter ({ status, updated_at, approved_by, title })")
  .option("--format <format>", "Format output as json or yaml")
  .option("--yaml", "Output document as YAML")
  .option("--json", "Output document as JSON")
  .action((pathOrId, options) => {
    try {
      const projectRoot = getRoot();
      const format = resolveFormat(options);
      const doc = findDocument(projectRoot, pathOrId);

      const raw = fs.readFileSync(doc.fullPath, "utf-8");

      if (options.compact) {
        let compactData: {
          status: string;
          updated_at?: string;
          approved_by?: string | null;
          title?: string;
        };

        if (doc.kind === "tasks" || doc.fullPath.endsWith(".yaml") || doc.fullPath.endsWith(".yml")) {
          try {
            const parsed = YAML.parse(raw);
            compactData = {
              status: parsed?.status ?? doc.status,
              updated_at: fs.statSync(doc.fullPath).mtime.toISOString(),
              approved_by: null,
            };
          } catch {
            compactData = {
              status: doc.status,
              updated_at: fs.statSync(doc.fullPath).mtime.toISOString(),
              approved_by: null,
            };
          }
        } else {
          const { frontmatter } = parseDocumentFrontmatter(raw);
          compactData = {
            status: frontmatter.status,
            updated_at: frontmatter.updated_at,
            approved_by: frontmatter.approved_by,
          };
        }

        if (doc.title) {
          compactData.title = doc.title;
        }

        if (format === "json") {
          console.log(JSON.stringify(compactData, null, 2));
          return;
        }

        if (format === "yaml") {
          console.log(dumpYaml(compactData));
          return;
        }

        console.log(`Status:      ${compactData.status}`);
        if (compactData.title) console.log(`Title:       ${compactData.title}`);
        if (compactData.updated_at) console.log(`Updated At:  ${compactData.updated_at}`);
        console.log(`Approved By: ${compactData.approved_by ?? "none"}`);
        return;
      }

      if (format === "json") {
        console.log(
          JSON.stringify(
            {
              id: doc.id,
              path: doc.path,
              kind: doc.kind,
              status: doc.status,
              title: doc.title,
              content: raw,
            },
            null,
            2,
          ),
        );
        return;
      }

      if (format === "yaml") {
        console.log(
          dumpYaml({
            id: doc.id,
            path: doc.path,
            kind: doc.kind,
            status: doc.status,
            title: doc.title,
            content: raw,
          }),
        );
        return;
      }

      process.stdout.write(raw.endsWith("\n") ? raw : raw + "\n");
    } catch (err: any) {
      console.error(`Error reading document "${pathOrId}": ${err.message}`);
      process.exit(1);
    }
  });

docCmd
  .command("approve <path-or-id>")
  .description("Approve a steering or specification document as a human")
  .action((pathOrId) => {
    try {
      const projectRoot = getRoot();
      const doc = findDocument(projectRoot, pathOrId);
      const raw = fs.readFileSync(doc.fullPath, "utf-8");
      const { frontmatter, body } = parseDocumentFrontmatter(raw);
      frontmatter.status = "approved";
      frontmatter.approved_by = "human";
      frontmatter.updated_at = new Date().toISOString();
      const serialized = serializeDocumentWithFrontmatter(frontmatter, body);
      fs.writeFileSync(doc.fullPath, serialized, "utf-8");
      console.log(`✓ Document "${doc.id}" approved successfully by human.`);
    } catch (err: any) {
      console.error(`Error approving document "${pathOrId}": ${err.message}`);
      process.exit(1);
    }
  });

docCmd
  .command("archive <path-or-id>")
  .description("Archive a document into .spexy/archived/ and remove the source file")
  .action((pathOrId) => {
    try {
      const projectRoot = getRoot();
      const res = archiveDocument(projectRoot, pathOrId);
      console.log(`Archived ${res.originalPath} -> ${res.archivedPath}`);
    } catch (err: any) {
      console.error(`Error archiving document "${pathOrId}": ${err.message}`);
      process.exit(1);
    }
  });

// 8. dashboard command
program
  .command("dashboard")
  .description("Start the local Spexy dashboard server")
  .option("--port <port>", "Port to listen on", (v) => parseInt(v, 10))
  .option("--host <host>", "Host interface to bind")
  .option("-l, --logs", "Stream server activity and watcher logs to stdout")
  .action(async (options) => {
    try {
      const projectRoot = getRoot();
      await startServer(projectRoot, { port: options.port, host: options.host, logs: options.logs });
    } catch (err: any) {
      console.error(`Error starting dashboard: ${err.message}`);
      process.exit(1);
    }
  });

// 9. logs command
program
  .command("logs")
  .description("Display recent workspace activity, task transitions, and error logs")
  .option("-s, --spec <spec-id>", "Filter logs by specification ID")
  .option("-n, --limit <number>", "Number of log lines to show", (v) => parseInt(v, 10), 30)
  .action((options) => {
    try {
      const projectRoot = getRoot();
      const specs = options.spec ? [{ id: options.spec }] : listSpecs(projectRoot);
      const allEntries: Array<{ specId: string; entry: string }> = [];

      for (const s of specs) {
        const logFile = path.join(getSpecflowDir(projectRoot), "specs", s.id, "implementation.log");
        if (fs.existsSync(logFile)) {
          const lines = fs.readFileSync(logFile, "utf-8").split("\n").filter((l) => l.trim().startsWith("- [") || l.trim().startsWith("- "));
          for (const line of lines) {
            allEntries.push({ specId: s.id, entry: line.trim().replace(/^-\s*/, "") });
          }
        }
      }

      if (allEntries.length === 0) {
        console.log("No implementation logs found.");
        return;
      }

      const recent = allEntries.slice(-options.limit);
      for (const item of recent) {
        console.log(`[${item.specId}] ${item.entry}`);
      }
    } catch (err: any) {
      console.error(`Error fetching logs: ${err.message}`);
      process.exit(1);
    }
  });

// 10. doctor and check commands
program
  .command("doctor")
  .description("Run comprehensive health and diagnostic checks on the Spexy workspace")
  .option("--compact", "Output token-optimized compact single-line report")
  .option("--json", "Output full diagnostic report as JSON")
  .action((options) => {
    handleDoctor(options);
  });

program
  .command("check")
  .description("Alias for 'doctor': run workspace health and diagnostic checks")
  .option("--compact", "Output token-optimized compact single-line report")
  .option("--json", "Output full diagnostic report as JSON")
  .action((options) => {
    handleDoctor(options);
  });

// Handle root flags: --dashboard, --doctor, --check
const rawArgs = process.argv.slice(2);
if (rawArgs.includes("--dashboard")) {
  const projectRoot = getRoot();
  const portIdx = rawArgs.indexOf("--port");
  const hostIdx = rawArgs.indexOf("--host");
  const port = portIdx !== -1 && rawArgs[portIdx + 1] ? parseInt(rawArgs[portIdx + 1], 10) : undefined;
  const host = hostIdx !== -1 && rawArgs[hostIdx + 1] ? rawArgs[hostIdx + 1] : undefined;
  const logs = rawArgs.includes("--logs") || rawArgs.includes("-l");
  startServer(projectRoot, { port, host, logs }).catch((err) => {
    console.error(`Error starting dashboard: ${err.message}`);
    process.exit(1);
  });
} else if (rawArgs.includes("--doctor") || rawArgs.includes("--check")) {
  const compact = rawArgs.includes("--compact");
  const json = rawArgs.includes("--json");
  handleDoctor({ compact, json });
} else {
  program.parse();
}
