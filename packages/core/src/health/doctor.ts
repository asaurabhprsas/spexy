import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { getSpecflowDir } from "../fs/workspace";
import { parseDocumentFrontmatter } from "../schemas/frontmatter";
import { TasksDocumentSchema, type TaskStatus } from "../schemas/tasks";
import { flattenTasks } from "../fs/workspace";
import { validateTaskGraph, computeTaskAvailability } from "../dag/workflow";

export interface DiagnosticCheck {
  id: string;
  category: "workspace" | "steering" | "specs" | "tasks" | "graph" | "checkpoints";
  name: string;
  status: "pass" | "fail" | "warn";
  message: string;
  actionable?: string;
  details?: string[];
}

export interface HealthReport {
  valid: boolean;
  timestamp: string;
  summary: {
    total: number;
    passed: number;
    failed: number;
    warnings: number;
  };
  checks: DiagnosticCheck[];
}

export function runHealthCheck(projectRoot: string): HealthReport {
  const checks: DiagnosticCheck[] = [];
  const sfDir = getSpecflowDir(projectRoot);

  // 1. Workspace directory check
  if (!fs.existsSync(sfDir)) {
    checks.push({
      id: "workspace-dir",
      category: "workspace",
      name: ".spexy directory existence",
      status: "fail",
      message: "The .spexy/ directory was not found in the project root.",
      actionable: "Run `spexy init` to initialize the Spexy workspace.",
    });

    return buildReport(checks);
  } else {
    checks.push({
      id: "workspace-dir",
      category: "workspace",
      name: ".spexy directory existence",
      status: "pass",
      message: ".spexy/ directory exists.",
    });
  }

  // 2. Steering documents check
  const steeringDir = path.join(sfDir, "steering");
  const requiredSteering = ["product.md", "tech.md", "structure.md"];

  if (!fs.existsSync(steeringDir)) {
    checks.push({
      id: "steering-dir",
      category: "steering",
      name: "Steering directory",
      status: "fail",
      message: "Steering directory .spexy/steering/ is missing.",
      actionable: "Run `spexy init` to generate foundational steering documents.",
    });
  } else {
    for (const file of requiredSteering) {
      const filePath = path.join(steeringDir, file);
      if (!fs.existsSync(filePath)) {
        checks.push({
          id: `steering-${file}`,
          category: "steering",
          name: `Steering doc: ${file}`,
          status: "fail",
          message: `Missing steering document: .spexy/steering/${file}`,
          actionable: `Create .spexy/steering/${file} with valid YAML frontmatter or run \`spexy init\`.`,
        });
        continue;
      }

      try {
        const content = fs.readFileSync(filePath, "utf-8");
        const parsed = parseDocumentFrontmatter(content);
        if (!parsed.frontmatter || Object.keys(parsed.frontmatter).length === 0) {
          checks.push({
            id: `steering-${file}-frontmatter`,
            category: "steering",
            name: `Steering doc frontmatter: ${file}`,
            status: "fail",
            message: `Document .spexy/steering/${file} lacks valid YAML frontmatter.`,
            actionable: `Add YAML frontmatter (e.g. --- status: draft ---) to .spexy/steering/${file}.`,
          });
        } else if (!parsed.frontmatter.status) {
          checks.push({
            id: `steering-${file}-status`,
            category: "steering",
            name: `Steering doc status: ${file}`,
            status: "fail",
            message: `Document .spexy/steering/${file} missing required 'status' field in frontmatter.`,
            actionable: `Add 'status: draft' (or 'approved') to frontmatter of .spexy/steering/${file}.`,
          });
        } else {
          checks.push({
            id: `steering-${file}`,
            category: "steering",
            name: `Steering doc: ${file}`,
            status: "pass",
            message: `${file} exists with valid frontmatter (status: ${parsed.frontmatter.status}).`,
          });
        }
      } catch (err: any) {
        checks.push({
          id: `steering-${file}-error`,
          category: "steering",
          name: `Steering doc: ${file}`,
          status: "fail",
          message: `Failed to read or parse .spexy/steering/${file}: ${err.message}`,
          actionable: `Check file permissions and YAML frontmatter syntax in .spexy/steering/${file}.`,
        });
      }
    }
  }

  // 3. Spec docs in .spexy/specs/*
  const specsDir = path.join(sfDir, "specs");
  let specDirs: string[] = [];
  if (fs.existsSync(specsDir)) {
    try {
      specDirs = fs
        .readdirSync(specsDir, { withFileTypes: true })
        .filter((ent) => ent.isDirectory() && !ent.name.startsWith("."))
        .map((ent) => ent.name);
    } catch {
      specDirs = [];
    }
  }

  if (specDirs.length === 0) {
    checks.push({
      id: "specs-count",
      category: "specs",
      name: "Specifications directory",
      status: "pass",
      message: "No specifications created yet (.spexy/specs is empty or clean).",
    });
  } else {
    for (const specId of specDirs) {
      const specPath = path.join(specsDir, specId);

      // 3a. requirements.md
      const reqPath = path.join(specPath, "requirements.md");
      if (!fs.existsSync(reqPath)) {
        checks.push({
          id: `spec-${specId}-requirements`,
          category: "specs",
          name: `Spec "${specId}" requirements.md`,
          status: "fail",
          message: `Missing requirements.md in spec "${specId}".`,
          actionable: `Create .spexy/specs/${specId}/requirements.md with frontmatter.`,
        });
      } else {
        try {
          const content = fs.readFileSync(reqPath, "utf-8");
          const parsed = parseDocumentFrontmatter(content);
          if (!parsed.frontmatter || Object.keys(parsed.frontmatter).length === 0) {
            checks.push({
              id: `spec-${specId}-requirements-frontmatter`,
              category: "specs",
              name: `Spec "${specId}" requirements.md frontmatter`,
              status: "fail",
              message: `Invalid YAML frontmatter in .spexy/specs/${specId}/requirements.md.`,
              actionable: `Add YAML frontmatter (e.g. --- status: draft ---) to requirements.md.`,
            });
          } else {
            checks.push({
              id: `spec-${specId}-requirements`,
              category: "specs",
              name: `Spec "${specId}" requirements.md`,
              status: "pass",
              message: `requirements.md exists with valid frontmatter.`,
            });
          }
        } catch (err: any) {
          checks.push({
            id: `spec-${specId}-requirements-read`,
            category: "specs",
            name: `Spec "${specId}" requirements.md`,
            status: "fail",
            message: `Error reading requirements.md in spec "${specId}": ${err.message}`,
            actionable: `Fix file permissions or syntax in requirements.md.`,
          });
        }
      }

      // 3b. design.md
      const designPath = path.join(specPath, "design.md");
      if (!fs.existsSync(designPath)) {
        checks.push({
          id: `spec-${specId}-design`,
          category: "specs",
          name: `Spec "${specId}" design.md`,
          status: "fail",
          message: `Missing design.md in spec "${specId}".`,
          actionable: `Create .spexy/specs/${specId}/design.md with frontmatter.`,
        });
      } else {
        try {
          const content = fs.readFileSync(designPath, "utf-8");
          const parsed = parseDocumentFrontmatter(content);
          if (!parsed.frontmatter || Object.keys(parsed.frontmatter).length === 0) {
            checks.push({
              id: `spec-${specId}-design-frontmatter`,
              category: "specs",
              name: `Spec "${specId}" design.md frontmatter`,
              status: "fail",
              message: `Invalid YAML frontmatter in .spexy/specs/${specId}/design.md.`,
              actionable: `Add YAML frontmatter (e.g. --- status: draft ---) to design.md.`,
            });
          } else {
            checks.push({
              id: `spec-${specId}-design`,
              category: "specs",
              name: `Spec "${specId}" design.md`,
              status: "pass",
              message: `design.md exists with valid frontmatter.`,
            });
          }
        } catch (err: any) {
          checks.push({
            id: `spec-${specId}-design-read`,
            category: "specs",
            name: `Spec "${specId}" design.md`,
            status: "fail",
            message: `Error reading design.md in spec "${specId}": ${err.message}`,
            actionable: `Fix file permissions or syntax in design.md.`,
          });
        }
      }

      // 3c. tasks.yaml & Schema Validation
      const tasksPath = path.join(specPath, "tasks.yaml");
      if (!fs.existsSync(tasksPath)) {
        checks.push({
          id: `spec-${specId}-tasks-yaml`,
          category: "tasks",
          name: `Spec "${specId}" tasks.yaml`,
          status: "fail",
          message: `Missing tasks.yaml in spec "${specId}".`,
          actionable: `Create .spexy/specs/${specId}/tasks.yaml or run \`spexy spec create ${specId}\`.`,
        });
        continue;
      }

      let parsedDoc: any = null;
      try {
        const rawYaml = fs.readFileSync(tasksPath, "utf-8");
        parsedDoc = YAML.parse(rawYaml);
      } catch (err: any) {
        checks.push({
          id: `spec-${specId}-tasks-syntax`,
          category: "tasks",
          name: `Spec "${specId}" tasks.yaml YAML syntax`,
          status: "fail",
          message: `YAML syntax error in .spexy/specs/${specId}/tasks.yaml: ${err.message}`,
          actionable: `Fix YAML indentation and syntax in .spexy/specs/${specId}/tasks.yaml.`,
        });
        continue;
      }

      const parseResult = TasksDocumentSchema.safeParse(parsedDoc);
      if (!parseResult.success) {
        const issues = parseResult.error.issues
          .map((i) => `${i.path.join(".") || "root"}: ${i.message}`)
          .join("; ");
        checks.push({
          id: `spec-${specId}-tasks-schema`,
          category: "tasks",
          name: `Spec "${specId}" TasksDocumentSchema validation`,
          status: "fail",
          message: `tasks.yaml schema violations in spec "${specId}": ${issues}`,
          actionable: `Update .spexy/specs/${specId}/tasks.yaml to adhere to TasksDocumentSchema.`,
        });
        continue;
      } else {
        checks.push({
          id: `spec-${specId}-tasks-schema`,
          category: "tasks",
          name: `Spec "${specId}" TasksDocumentSchema validation`,
          status: "pass",
          message: `tasks.yaml conforms to TasksDocumentSchema.`,
        });
      }

      // 3d. Task Graph Validation & Availability
      const tasks = flattenTasks(parseResult.data);
      try {
        validateTaskGraph(tasks);
        const statuses: Record<string, TaskStatus> = {};
        for (const t of tasks) statuses[t.id] = t.status;
        computeTaskAvailability(tasks, statuses);

        checks.push({
          id: `spec-${specId}-graph`,
          category: "graph",
          name: `Spec "${specId}" task graph DAG & availability`,
          status: "pass",
          message: `Task DAG valid (${tasks.length} tasks, no cycles or dangling dependencies).`,
        });
      } catch (err: any) {
        checks.push({
          id: `spec-${specId}-graph`,
          category: "graph",
          name: `Spec "${specId}" task graph DAG & availability`,
          status: "fail",
          message: `Task graph error in spec "${specId}": ${err.message}`,
          actionable: `Fix circular dependencies or missing referenced task IDs in .spexy/specs/${specId}/tasks.yaml.`,
        });
      }
    }
  }

  // 4. Checkpoints directory integrity
  const checkpointsDir = path.join(sfDir, ".cache", "checkpoints");
  const legacyCheckpointsDir = path.join(sfDir, "checkpoints");
  const activeCheckpointsDir = fs.existsSync(checkpointsDir)
    ? checkpointsDir
    : fs.existsSync(legacyCheckpointsDir)
      ? legacyCheckpointsDir
      : null;

  if (!activeCheckpointsDir) {
    checks.push({
      id: "checkpoints-integrity",
      category: "checkpoints",
      name: "Checkpoints directory integrity",
      status: "pass",
      message: "Checkpoints storage is clean (no snapshots created yet).",
    });
  } else {
    const indexPath = path.join(activeCheckpointsDir, "index.json");
    if (!fs.existsSync(indexPath)) {
      checks.push({
        id: "checkpoints-integrity",
        category: "checkpoints",
        name: "Checkpoints directory integrity",
        status: "pass",
        message: "Checkpoints directory exists; index.json not yet generated.",
      });
    } else {
      try {
        const rawIndex = fs.readFileSync(indexPath, "utf-8");
        const parsedIndex = JSON.parse(rawIndex);
        if (!Array.isArray(parsedIndex?.snapshots)) {
          checks.push({
            id: "checkpoints-index-format",
            category: "checkpoints",
            name: "Checkpoints index.json format",
            status: "fail",
            message: "checkpoints index.json is malformed (missing snapshots array).",
            actionable: `Reset or repair ${indexPath}.`,
          });
        } else {
          const missingFiles: string[] = [];
          for (const s of parsedIndex.snapshots) {
            if (s.snapshotFile) {
              const snapFile = path.join(activeCheckpointsDir, s.snapshotFile);
              if (!fs.existsSync(snapFile)) {
                missingFiles.push(s.snapshotFile);
              }
            }
          }

          if (missingFiles.length > 0) {
            checks.push({
              id: "checkpoints-snapshot-files",
              category: "checkpoints",
              name: "Checkpoints snapshot files existence",
              status: "warn",
              message: `Missing ${missingFiles.length} snapshot backup file(s): ${missingFiles.slice(0, 3).join(", ")}${missingFiles.length > 3 ? "..." : ""}`,
              actionable: "Clean orphaned snapshot entries from checkpoints index.json.",
            });
          } else {
            checks.push({
              id: "checkpoints-integrity",
              category: "checkpoints",
              name: "Checkpoints directory integrity",
              status: "pass",
              message: `Checkpoints directory intact (${parsedIndex.snapshots.length} snapshot(s) verified).`,
            });
          }
        }
      } catch (err: any) {
        checks.push({
          id: "checkpoints-corrupt",
          category: "checkpoints",
          name: "Checkpoints index JSON parsing",
          status: "fail",
          message: `Failed to read checkpoints index.json: ${err.message}`,
          actionable: `Remove or fix corrupted JSON at ${indexPath}.`,
        });
      }
    }
  }

  return buildReport(checks);
}

function buildReport(checks: DiagnosticCheck[]): HealthReport {
  let passed = 0;
  let failed = 0;
  let warnings = 0;

  for (const c of checks) {
    if (c.status === "pass") passed++;
    else if (c.status === "fail") failed++;
    else if (c.status === "warn") warnings++;
  }

  return {
    valid: failed === 0,
    timestamp: new Date().toISOString(),
    summary: {
      total: checks.length,
      passed,
      failed,
      warnings,
    },
    checks,
  };
}

export function formatHealthReport(
  report: HealthReport,
  options: { compact?: boolean } = {},
): string {
  if (options.compact) {
    if (report.valid) {
      const steeringPass = report.checks.filter((c) => c.category === "steering" && c.status === "pass").length;
      const steeringTotal = report.checks.filter((c) => c.category === "steering").length;
      const specsPass = report.checks.filter((c) => (c.category === "specs" || c.category === "tasks") && c.status === "pass").length;
      const specsTotal = report.checks.filter((c) => c.category === "specs" || c.category === "tasks").length;
      const graphPass = report.checks.filter((c) => c.category === "graph" && c.status === "pass").length;
      const graphTotal = report.checks.filter((c) => c.category === "graph").length;

      return `PASS steering(${steeringPass}/${steeringTotal || 3}) specs(${specsPass}/${specsTotal}) graph(${graphPass}/${graphTotal}) checkpoints(ok) [${report.summary.passed} checks clean]`;
    }

    const failedChecks = report.checks.filter((c) => c.status === "fail");
    const issues = failedChecks.map((c) => `[${c.category}] ${c.message} -> Action: ${c.actionable || "Fix issue"}`).join(" | ");
    return `FAIL (${failedChecks.length} issue(s)): ${issues}`;
  }

  const lines: string[] = [];
  lines.push("Spexy Health Check Diagnostic Report");
  lines.push("==========================================");

  const categories = [
    { key: "workspace", title: "Workspace" },
    { key: "steering", title: "Steering Documents" },
    { key: "specs", title: "Feature Specifications" },
    { key: "tasks", title: "Tasks Schema Validation" },
    { key: "graph", title: "Task Graph & DAG Availability" },
    { key: "checkpoints", title: "Checkpoints Storage" },
  ];

  for (const cat of categories) {
    const catChecks = report.checks.filter((c) => c.category === cat.key);
    if (catChecks.length === 0) continue;

    lines.push(`\n[${cat.title}]`);
    for (const c of catChecks) {
      const mark = c.status === "pass" ? "✔" : c.status === "warn" ? "⚠" : "✖";
      lines.push(`  ${mark} ${c.name}: ${c.message}`);
      if (c.status !== "pass" && c.actionable) {
        lines.push(`    → Actionable: ${c.actionable}`);
      }
    }
  }

  lines.push("\n------------------------------------------");
  if (report.valid) {
    lines.push(
      `Summary: ✔ ${report.summary.passed} passed, ${report.summary.warnings} warning(s). Workspace is healthy!`,
    );
  } else {
    lines.push(
      `Summary: ✖ ${report.summary.failed} failed, ${report.summary.passed} passed, ${report.summary.warnings} warning(s). Workspace has errors!`,
    );
  }

  return lines.join("\n");
}
