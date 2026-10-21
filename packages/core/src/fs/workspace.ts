import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { Config, ConfigSchema, DEFAULT_CONFIG } from "../schemas/config";
import {
  DocumentFrontmatter,
  parseDocumentFrontmatter,
  serializeDocumentWithFrontmatter,
} from "../schemas/frontmatter";
import {
  TaskItem,
  TasksDocument,
  TasksDocumentSchema,
} from "../schemas/tasks";
import { validateTaskGraph, WorkflowRuleError } from "../dag/workflow";

export const SPECFLOW_DIR = ".specflow";
export const DOCS_DIR = "docs";

export function findProjectRoot(startDir: string = process.cwd()): string {
  let curr = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(curr, SPECFLOW_DIR))) {
      return curr;
    }
    if (fs.existsSync(path.join(curr, ".git"))) {
      return curr;
    }
    const parent = path.dirname(curr);
    if (parent === curr) break;
    curr = parent;
  }
  return path.resolve(startDir);
}

export function getSpecflowDir(projectRoot: string): string {
  return path.join(projectRoot, SPECFLOW_DIR);
}

export function readConfig(projectRoot: string): Config {
  const configPath = path.join(getSpecflowDir(projectRoot), "config.yaml");
  if (!fs.existsSync(configPath)) {
    return DEFAULT_CONFIG;
  }
  try {
    const raw = fs.readFileSync(configPath, "utf-8");
    const parsed = YAML.parse(raw);
    const validated = ConfigSchema.safeParse(parsed);
    return validated.success ? validated.data : DEFAULT_CONFIG;
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function writeConfig(projectRoot: string, config: Config): void {
  const configPath = path.join(getSpecflowDir(projectRoot), "config.yaml");
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, YAML.stringify(config), "utf-8");
}

export interface SteeringDocumentInfo {
  id: string;
  filename: string;
  relativePath: string;
  title: string;
  status: string;
  approved_by: string | null;
  updated_at: string;
  content: string;
}

export interface SteeringStatusSummary {
  approved: boolean;
  total: number;
  approvedCount: number;
  documents: SteeringDocumentInfo[];
}

export function getSteeringStatus(projectRoot: string): SteeringStatusSummary {
  const steeringDir = path.join(getSpecflowDir(projectRoot), "steering");
  const requiredFiles = [
    { id: "product", filename: "product.md", title: "Product Vision & Problem" },
    { id: "tech", filename: "tech.md", title: "Tech Stack & Architecture" },
    { id: "structure", filename: "structure.md", title: "Project Structure & Conventions" },
  ];

  if (!fs.existsSync(steeringDir)) {
    return {
      approved: false,
      total: requiredFiles.length,
      approvedCount: 0,
      documents: [],
    };
  }

  const docs: SteeringDocumentInfo[] = [];
  let approvedCount = 0;

  for (const item of requiredFiles) {
    const fullPath = path.join(steeringDir, item.filename);
    if (!fs.existsSync(fullPath)) continue;

    const raw = fs.readFileSync(fullPath, "utf-8");
    const { frontmatter, body } = parseDocumentFrontmatter(raw);

    if (frontmatter.status === "approved") {
      approvedCount++;
    }

    docs.push({
      id: item.id,
      filename: item.filename,
      relativePath: path.relative(projectRoot, fullPath),
      title: item.title,
      status: frontmatter.status,
      approved_by: frontmatter.approved_by,
      updated_at: frontmatter.updated_at,
      content: raw,
    });
  }

  const approved = docs.length === requiredFiles.length && approvedCount === requiredFiles.length;

  return {
    approved,
    total: requiredFiles.length,
    approvedCount,
    documents: docs,
  };
}

export function updateSteeringDocument(
  projectRoot: string,
  filename: string,
  newContentOrBody: string,
  newFrontmatter?: Partial<DocumentFrontmatter>,
  actor: "human" | "agent" = "agent",
): void {
  const fullPath = path.join(getSpecflowDir(projectRoot), "steering", filename);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Steering document not found: ${filename}`);
  }

  const current = fs.readFileSync(fullPath, "utf-8");
  const { frontmatter: currentFm, body: currentBody } = parseDocumentFrontmatter(current);

  const updatedBody = newContentOrBody.startsWith("---")
    ? parseDocumentFrontmatter(newContentOrBody).body
    : newContentOrBody;

  const targetFm: DocumentFrontmatter = {
    ...currentFm,
    ...newFrontmatter,
    updated_at: new Date().toISOString(),
  };

  if (targetFm.status === "approved" && actor !== "human") {
    throw new WorkflowRuleError(
      "STEERING_APPROVAL_ROLE_GUARD",
      "Only a human reviewer can approve steering documents.",
    );
  }

  const serialized = serializeDocumentWithFrontmatter(targetFm, updatedBody);
  fs.writeFileSync(fullPath, serialized, "utf-8");
}

export interface SpecSummary {
  id: string;
  name: string;
  status: string;
  taskCount: number;
  completedTaskCount: number;
  hasRequirements: boolean;
  hasDesign: boolean;
}

export function listSpecs(projectRoot: string): SpecSummary[] {
  const specsDir = path.join(getSpecflowDir(projectRoot), "specs");
  if (!fs.existsSync(specsDir)) return [];

  const entries = fs.readdirSync(specsDir, { withFileTypes: true });
  const summaries: SpecSummary[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const specId = entry.name;
    const specPath = path.join(specsDir, specId);
    const tasksFile = path.join(specPath, "tasks.yaml");
    const reqFile = path.join(specPath, "requirements.md");
    const designFile = path.join(specPath, "design.md");

    let status = "in-progress";
    let taskCount = 0;
    let completedTaskCount = 0;

    if (fs.existsSync(tasksFile)) {
      try {
        const raw = fs.readFileSync(tasksFile, "utf-8");
        const doc = YAML.parse(raw);
        status = doc.status ?? "in-progress";
        const tasks = flattenTasks(doc);
        taskCount = tasks.length;
        completedTaskCount = tasks.filter((t) => t.status === "done").length;
      } catch {
        // fallback
      }
    }

    summaries.push({
      id: specId,
      name: specId.replace(/-/g, " "),
      status,
      taskCount,
      completedTaskCount,
      hasRequirements: fs.existsSync(reqFile),
      hasDesign: fs.existsSync(designFile),
    });
  }

  return summaries;
}

export function createSpec(
  projectRoot: string,
  specId: string,
  options?: { force?: boolean; title?: string },
): void {
  const config = readConfig(projectRoot);
  if (config.gates.enforce_steering_approval && !options?.force) {
    const steering = getSteeringStatus(projectRoot);
    if (!steering.approved) {
      throw new WorkflowRuleError(
        "STEERING_GATE_LOCKED",
        `Cannot create spec "${specId}": steering documents are not yet approved by a human. Run "spec-flow status" to review steering documents.`,
      );
    }
  }

  const specDir = path.join(getSpecflowDir(projectRoot), "specs", specId);
  if (fs.existsSync(specDir)) {
    throw new WorkflowRuleError("SPEC_ALREADY_EXISTS", `Spec "${specId}" already exists.`);
  }

  fs.mkdirSync(specDir, { recursive: true });

  const now = new Date().toISOString();
  const title = options?.title || specId.replace(/-/g, " ");

  const defaultReq = `---
status: draft
updated_at: ${now}
approved_by: null
---

# Requirements: ${title}

## 1. Executive Summary
Briefly describe the purpose and user value of this feature.

## 2. Functional Requirements
- **REQ-1**: [Feature capability]
- **REQ-2**: [Feature capability]

## 3. Non-Functional Requirements
- Performance, security, and testing constraints.
`;

  const defaultDesign = `---
status: draft
updated_at: ${now}
approved_by: null
---

# Design: ${title}

## 1. Technical Architecture
Describe the approach, components, and module interactions.

## 2. Schemas & Interfaces
Define interfaces, types, and data models.
`;

  const defaultTasks: TasksDocument = {
    version: "1.0",
    feature: specId,
    status: "in-progress",
    dependency_graph: {
      parallel_tracks: [{ track: "Track 1", sequence: ["1"] }],
      cross_dependencies: [],
    },
    notes: {
      security: ["Validate inputs before processing."],
      testing: ["Verify all acceptance criteria with unit tests."],
    },
    groups: [
      {
        id: "phase-1",
        name: "Phase 1: Foundation",
        tasks: [
          {
            id: "1",
            parent_id: null,
            title: `Initialize ${title}`,
            description: `Scaffold foundation and setup for ${title}.`,
            status: "todo",
            priority: "high",
            depends_on: [],
            worktree: null,
            branch: null,
            locked_at: null,
            files: [],
            leverage: "",
            requirements_ref: ["REQ-1"],
            notes: { security: null, testing: null },
          },
        ],
      },
    ],
  };

  fs.writeFileSync(path.join(specDir, "requirements.md"), defaultReq, "utf-8");
  fs.writeFileSync(path.join(specDir, "design.md"), defaultDesign, "utf-8");
  fs.writeFileSync(path.join(specDir, "tasks.yaml"), YAML.stringify(defaultTasks), "utf-8");
  fs.writeFileSync(path.join(specDir, "implementation.log"), `# Implementation Log: ${specId}\n\n- ${now}: Spec created.\n`, "utf-8");
}

export function readTasksYaml(projectRoot: string, specId: string): TasksDocument {
  const tasksPath = path.join(getSpecflowDir(projectRoot), "specs", specId, "tasks.yaml");
  if (!fs.existsSync(tasksPath)) {
    throw new Error(`tasks.yaml not found for spec: ${specId}`);
  }
  const raw = fs.readFileSync(tasksPath, "utf-8");
  const parsed = YAML.parse(raw);
  const validated = TasksDocumentSchema.safeParse(parsed);
  if (!validated.success) {
    throw new WorkflowRuleError(
      "INVALID_TASKS_YAML",
      `tasks.yaml failed schema validation: ${validated.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ")}`,
    );
  }
  return validated.data;
}

export function writeTasksYaml(
  projectRoot: string,
  specId: string,
  tasksDoc: TasksDocument,
): void {
  const flattened = flattenTasks(tasksDoc);
  validateTaskGraph(flattened);

  const specDir = path.join(getSpecflowDir(projectRoot), "specs", specId);
  fs.mkdirSync(specDir, { recursive: true });
  const tasksPath = path.join(specDir, "tasks.yaml");
  const tmpPath = `${tasksPath}.tmp.${Date.now()}`;

  const serialized = YAML.stringify(tasksDoc);
  fs.writeFileSync(tmpPath, serialized, "utf-8");
  fs.renameSync(tmpPath, tasksPath);
}

export function flattenTasks(tasksDoc: TasksDocument): TaskItem[] {
  const items: TaskItem[] = [];
  for (const group of tasksDoc.groups) {
    for (const task of group.tasks) {
      items.push(task);
    }
  }
  return items;
}

export function updateTaskInDoc(
  tasksDoc: TasksDocument,
  updatedTask: TaskItem,
): TasksDocument {
  let found = false;
  const newGroups = tasksDoc.groups.map((group) => {
    const updatedTasks = group.tasks.map((task) => {
      if (task.id === updatedTask.id) {
        found = true;
        return updatedTask;
      }
      return task;
    });
    return { ...group, tasks: updatedTasks };
  });

  if (!found) {
    if (newGroups.length === 0) {
      newGroups.push({ id: "group-1", name: "Default Phase", tasks: [updatedTask] });
    } else {
      newGroups[0].tasks.push(updatedTask);
    }
  }

  return { ...tasksDoc, groups: newGroups };
}

export function initSpecFlowWorkspace(projectRoot: string): void {
  const sfDir = getSpecflowDir(projectRoot);
  const docsDir = path.join(projectRoot, DOCS_DIR);

  fs.mkdirSync(path.join(sfDir, "steering"), { recursive: true });
  fs.mkdirSync(path.join(sfDir, "specs"), { recursive: true });
  fs.mkdirSync(path.join(sfDir, "templates"), { recursive: true });
  fs.mkdirSync(path.join(sfDir, ".cache", "checkpoints"), { recursive: true });
  fs.mkdirSync(docsDir, { recursive: true });

  const now = new Date().toISOString();

  // 1. .specflow/config.yaml
  const configPath = path.join(sfDir, "config.yaml");
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, YAML.stringify(DEFAULT_CONFIG), "utf-8");
  }

  // 2. .specflow/.cache/.gitignore
  const cacheGitignore = path.join(sfDir, ".cache", ".gitignore");
  if (!fs.existsSync(cacheGitignore)) {
    fs.writeFileSync(cacheGitignore, "*\n!.gitignore\n", "utf-8");
  }

  // 3. .specflow/.cache/pending-comments.yaml
  const commentsFile = path.join(sfDir, ".cache", "pending-comments.yaml");
  if (!fs.existsSync(commentsFile)) {
    fs.writeFileSync(commentsFile, YAML.stringify({ comments: [] }), "utf-8");
  }

  // 4. .specflow/README.md
  const sfReadme = path.join(sfDir, "README.md");
  if (!fs.existsSync(sfReadme)) {
    fs.writeFileSync(
      sfReadme,
      `# Spec-Flow Workspace

This directory is managed by **Spec-Flow**, the local-first Spec-Driven Development tool.

## Structure
- \`steering/\`: Foundational documents (product, tech, structure). Must be approved by a human before spec execution.
- \`specs/\`: Feature specifications containing requirements, design, tasks, and audit logs.
- \`.cache/\`: Ephemeral local state, review comments, and rolling checkpoints.
`,
      "utf-8",
    );
  }

  // 5. .specflow/roadmap.md
  const sfRoadmap = path.join(sfDir, "roadmap.md");
  if (!fs.existsSync(sfRoadmap)) {
    fs.writeFileSync(
      sfRoadmap,
      `# Project Roadmap

High-level cross-spec roadmap and development milestones.
`,
      "utf-8",
    );
  }

  // 6. Steering docs
  const steeringDocs = [
    {
      file: "product.md",
      title: "Product Vision & Strategy",
      content: `# Product Vision & Direction\n\n## Vision\nProvide human architects and AI agents with a shared, verifiable contract for autonomous development.\n\n## Target Users\nDevelopers, architects, and engineering teams using autonomous coding agents.\n`,
    },
    {
      file: "tech.md",
      title: "Technical Architecture & Constraints",
      content: `# Technical Architecture & Rules\n\n## Stack\n- Monorepo with TypeScript, Bun, and Turborepo.\n- Local-first architecture: state persisted in .specflow/ YAML and Markdown.\n- Embedded Fastify WebSocket server for real-time dashboard updates.\n`,
    },
    {
      file: "structure.md",
      title: "Repository Structure & Conventions",
      content: `# Project Structure & Conventions\n\n## Directory Conventions\n- \`packages/core\`: Domain logic, schemas, and file engine.\n- \`packages/cli\`: Command-line interface and daemon.\n- \`packages/ui\`: Pre-bundled web dashboard.\n- \`skills/\`: Agent skill contracts.\n- \`docs/\`: Long-term project documentation and progress tracking.\n`,
    },
  ];

  for (const doc of steeringDocs) {
    const docPath = path.join(sfDir, "steering", doc.file);
    if (!fs.existsSync(docPath)) {
      const formatted = serializeDocumentWithFrontmatter(
        { status: "draft", updated_at: now, approved_by: null },
        doc.content,
      );
      fs.writeFileSync(docPath, formatted, "utf-8");
    }
  }

  // 7. docs/ folder
  const archDoc = path.join(docsDir, "ARCHITECTURE.md");
  if (!fs.existsSync(archDoc)) {
    fs.writeFileSync(
      archDoc,
      `# System Architecture & Documentation

This directory provides project context, system architecture, and onboarding documentation for future developers and AI agents.

## Core Principles
1. **Steering-First Gate**: Foundational steering documents establish non-negotiable boundaries before coding begins.
2. **DAG-Enforced Tasks**: Every feature task declares explicit prerequisites with cycle detection.
3. **Two-Tier HITL Verification**: Autonomous agents advance tasks to \`to-review\`; only human verification transitions work to \`done\`.
`,
      "utf-8",
    );
  }

  const progressDoc = path.join(docsDir, "PROGRESS.md");
  if (!fs.existsSync(progressDoc)) {
    fs.writeFileSync(
      progressDoc,
      `# Project Milestones & Progress Log

- **${now.slice(0, 10)}**: Workspace initialized with Spec-Flow SDD methodology.
`,
      "utf-8",
    );
  }

  const onboardingDoc = path.join(docsDir, "ONBOARDING.md");
  if (!fs.existsSync(onboardingDoc)) {
    fs.writeFileSync(
      onboardingDoc,
      `# Quickstart & Onboarding Guide

## For AI Agents
1. Run \`spec-flow status\` to inspect steering approval state.
2. List available work: \`spec-flow task list <spec-id> --available\`.
3. Claim a task: \`spec-flow task start <task-id>\`.
4. When implementation is verified with unit tests, submit for review: \`spec-flow task complete <task-id> --note "..."\`.
5. Check for human feedback: \`spec-flow comment list --pending\`.

## For Human Architects
1. Launch dashboard: \`spec-flow --dashboard\`.
2. Review steering documents and approve them.
3. Review submitted tasks in the Kanban board and approve or reject them.
`,
      "utf-8",
    );
  }
}
