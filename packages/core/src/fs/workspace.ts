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
  fs.mkdirSync(path.join(specDir, "references"), { recursive: true });
  fs.mkdirSync(path.join(specDir, "images"), { recursive: true });

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

export type SpecFileKind =
  | "requirements"
  | "design"
  | "tasks"
  | "reference"
  | "image"
  | "log"
  | "other";

export interface SpecFileInfo {
  name: string;
  relativePath: string;
  kind: SpecFileKind;
  sizeBytes: number;
  extension: string;
  updatedAt: string;
}

export function listSpecFiles(projectRoot: string, specId: string): SpecFileInfo[] {
  const specDir = path.join(getSpecflowDir(projectRoot), "specs", specId);
  if (!fs.existsSync(specDir)) {
    return [];
  }

  const results: SpecFileInfo[] = [];

  function scanDir(dir: string, baseDir: string, forcedKind?: SpecFileKind) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        let childKind = forcedKind;
        if (!childKind) {
          if (entry.name === "references") childKind = "reference";
          else if (entry.name === "images") childKind = "image";
          else childKind = "other";
        }
        scanDir(fullPath, baseDir, childKind);
      } else if (entry.isFile()) {
        const rel = path.relative(baseDir, fullPath).split(path.sep).join("/");
        let kind: SpecFileKind = forcedKind || "other";
        if (!forcedKind) {
          if (entry.name === "requirements.md") kind = "requirements";
          else if (entry.name === "design.md") kind = "design";
          else if (entry.name === "tasks.yaml") kind = "tasks";
          else if (entry.name === "implementation.log") kind = "log";
        }
        const stat = fs.statSync(fullPath);
        const ext = path.extname(entry.name).replace(/^\./, "").toLowerCase();
        results.push({
          name: entry.name,
          relativePath: rel,
          kind,
          sizeBytes: stat.size,
          extension: ext,
          updatedAt: stat.mtime.toISOString(),
        });
      }
    }
  }

  scanDir(specDir, specDir);
  results.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return results;
}

export interface DocumentInfo {
  id: string;
  path: string;
  kind: string;
  status: string;
  title: string;
  fullPath: string;
}

export function listDocuments(projectRoot: string): DocumentInfo[] {
  const docs: DocumentInfo[] = [];

  // 1. Steering documents
  const steering = getSteeringStatus(projectRoot);
  for (const d of steering.documents) {
    const fullPath = path.join(getSpecflowDir(projectRoot), "steering", d.filename);
    docs.push({
      id: d.id,
      path: d.relativePath.split(path.sep).join("/"),
      kind: "steering",
      status: d.status,
      title: d.title,
      fullPath,
    });
  }

  // Scan steering directory for any extra documents
  const steeringDir = path.join(getSpecflowDir(projectRoot), "steering");
  if (fs.existsSync(steeringDir)) {
    const entries = fs.readdirSync(steeringDir);
    for (const entry of entries) {
      if (!entry.endsWith(".md")) continue;
      const fullPath = path.join(steeringDir, entry);
      if (docs.some((d) => d.fullPath === fullPath)) continue;
      const raw = fs.readFileSync(fullPath, "utf-8");
      const { frontmatter, body } = parseDocumentFrontmatter(raw);
      const headingMatch = body.match(/^#\s+(.+)$/m);
      const base = path.basename(entry, ".md");
      docs.push({
        id: base,
        path: path.relative(projectRoot, fullPath).split(path.sep).join("/"),
        kind: "steering",
        status: frontmatter.status,
        title: headingMatch ? headingMatch[1].trim() : base,
        fullPath,
      });
    }
  }

  // 2. Spec documents
  const specs = listSpecs(projectRoot);
  for (const s of specs) {
    const specDir = path.join(getSpecflowDir(projectRoot), "specs", s.id);
    const files = listSpecFiles(projectRoot, s.id);
    for (const f of files) {
      if (f.kind === "log" || f.kind === "image") continue;
      const fullPath = path.join(specDir, f.relativePath);
      let docId = `${s.id}:${f.kind}`;
      let title = `${s.name} - ${f.name}`;
      let status = s.status;

      if (f.name === "requirements.md") {
        docId = `${s.id}:requirements`;
        title = `${s.name} - Requirements`;
      } else if (f.name === "design.md") {
        docId = `${s.id}:design`;
        title = `${s.name} - Design`;
      } else if (f.name === "tasks.yaml") {
        docId = `${s.id}:tasks`;
        title = `${s.name} - Tasks`;
      }

      if (f.name.endsWith(".md")) {
        try {
          const raw = fs.readFileSync(fullPath, "utf-8");
          const parsed = parseDocumentFrontmatter(raw);
          if (parsed.frontmatter?.status) {
            status = parsed.frontmatter.status;
          }
          const headingMatch = parsed.body.match(/^#\s+(.+)$/m);
          if (headingMatch) {
            title = headingMatch[1].trim();
          }
        } catch {
          // ignore
        }
      }

      docs.push({
        id: docId,
        path: path.relative(projectRoot, fullPath).split(path.sep).join("/"),
        kind: f.kind,
        status,
        title,
        fullPath,
      });
    }
  }

  return docs;
}

export function findDocument(projectRoot: string, target: string): DocumentInfo {
  const docs = listDocuments(projectRoot);
  const normalizedTarget = target.trim();
  const lowerTarget = normalizedTarget.toLowerCase();

  // 1. Exact ID match (case-insensitive)
  let found = docs.find((d) => d.id.toLowerCase() === lowerTarget);
  if (found) return found;

  // 2. Exact relative path match
  found = docs.find((d) => d.path.toLowerCase() === lowerTarget);
  if (found) return found;

  // 3. Basename match (e.g. "product.md", "tech.md")
  found = docs.find((d) => path.basename(d.path).toLowerCase() === lowerTarget);
  if (found) return found;

  // 4. Basename without extension (e.g. "product" -> "product.md")
  found = docs.find((d) => path.basename(d.path, path.extname(d.path)).toLowerCase() === lowerTarget);
  if (found) return found;

  // 5. Ends with target (e.g. "specs/auth/requirements.md" or "steering/product.md")
  found = docs.find((d) => d.path.toLowerCase().endsWith(lowerTarget));
  if (found) return found;

  // 6. Direct filesystem path if target exists
  const absPath = path.isAbsolute(target) ? target : path.resolve(projectRoot, target);
  if (fs.existsSync(absPath) && fs.statSync(absPath).isFile()) {
    const rel = path.relative(projectRoot, absPath).split(path.sep).join("/");
    found = docs.find((d) => d.fullPath === absPath || d.path === rel);
    if (found) return found;

    const raw = fs.readFileSync(absPath, "utf-8");
    const { frontmatter, body } = parseDocumentFrontmatter(raw);
    const headingMatch = body.match(/^#\s+(.+)$/m);
    const base = path.basename(absPath, path.extname(absPath));
    return {
      id: base,
      path: rel,
      kind: rel.includes("steering") ? "steering" : "other",
      status: frontmatter.status,
      title: headingMatch ? headingMatch[1].trim() : base,
      fullPath: absPath,
    };
  }

  throw new Error(`Document "${target}" not found.`);
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
  const templatesDir = path.join(projectRoot, "templates");

  fs.mkdirSync(path.join(sfDir, "steering"), { recursive: true });
  fs.mkdirSync(path.join(sfDir, "specs"), { recursive: true });
  fs.mkdirSync(path.join(templatesDir, "steering"), { recursive: true });
  fs.mkdirSync(path.join(templatesDir, "specs"), { recursive: true });
  fs.mkdirSync(path.join(sfDir, "prompts"), { recursive: true });
  fs.mkdirSync(path.join(sfDir, ".cache", "checkpoints"), { recursive: true });
  fs.mkdirSync(path.join(sfDir, ".cache", "history"), { recursive: true });
  fs.mkdirSync(docsDir, { recursive: true });

  // Clean up legacy .specflow/templates if it exists
  const legacyTemplatesDir = path.join(sfDir, "templates");
  if (fs.existsSync(legacyTemplatesDir)) {
    fs.rmSync(legacyTemplatesDir, { recursive: true, force: true });
  }

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
- \`prompts/\`: Actionable guidance prompts for autonomous AI agents.
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

  // 6. Turnkey Templates in templates/
  const templates: { subpath: string; content: string }[] = [
    {
      subpath: path.join("steering", "product.template.md"),
      content: `---
status: draft
updated_at: 2026-01-01T00:00:00.000Z
approved_by: null
---

# Product Vision & Strategy: [Project Name]

## 1. Vision & Executive Summary
Brief high-level description of what this product accomplishes and the core problem it solves.

## 2. Target Users & Personas
- **Primary Persona**: Description, workflows, core pain points.
- **Secondary Persona**: Supporting roles and administrative users.

## 3. Core Features & Capabilities
- **Feature Area 1**: Detailed capabilities and desired outcomes.
- **Feature Area 2**: Automation, integrations, or workflows.

## 4. Product Principles & Success Metrics
- **Principle 1**: Usability, performance, or reliability standard.
- **Key Metrics (KPIs)**: Quantifiable metrics for product validation.
`,
    },
    {
      subpath: path.join("steering", "tech.template.md"),
      content: `---
status: draft
updated_at: 2026-01-01T00:00:00.000Z
approved_by: null
---

# Technical Architecture & Constraints: [Project Name]

## 1. Technology Stack
- **Runtime & Language**: e.g., Bun / Node.js, TypeScript.
- **Frameworks & Libraries**: Key dependencies and UI/backend frameworks.
- **Persistence & Storage**: Database, caching, or file formats.

## 2. Architecture & Design Patterns
- Component architecture, layering, and service boundaries.
- Error handling, validation schemas (e.g., Zod), and state management.

## 3. Security, Quality & Coding Standards
- Security policies, input sanitization, and authentication.
- Testing expectations: Unit test coverage, integration tests, type safety.

## 4. Non-Negotiable Rules & Constraints
- Constraints that autonomous agents and human developers must obey.
`,
    },
    {
      subpath: path.join("steering", "structure.template.md"),
      content: `---
status: draft
updated_at: 2026-01-01T00:00:00.000Z
approved_by: null
---

# Project Structure & Conventions: [Project Name]

## 1. Workspace Layout
- \`packages/\`: Monorepo packages and libraries.
- \`apps/\`: Application entrypoints.
- \`.specflow/\`: Spec-Driven Development steering, specs, and cache.
- \`docs/\`: Long-term human documentation.

## 2. Naming & File Conventions
- File naming: kebab-case for filenames, PascalCase for classes/types.
- Exports: explicit index.ts exports and barrel conventions.

## 3. Branching & Worktree Strategy
- Branch naming: \`feature/<spec-id>/<task-id>\` or \`spec/<spec-id>\`.
- Git worktree guidelines for isolated agent execution.
`,
    },
    {
      subpath: path.join("specs", "requirements.template.md"),
      content: `---
status: draft
updated_at: 2026-01-01T00:00:00.000Z
approved_by: null
---

# Requirements: [Feature Title]

## 1. User Story & Problem Statement
As a [user role], I want to [goal] so that [benefit].

## 2. Functional Requirements & Acceptance Criteria
- **REQ-1**: [Core functional requirement]
  - Acceptance Criteria: Given X, when Y, then Z.
- **REQ-2**: [Additional functional capability]
  - Acceptance Criteria: Validation and expected response.

## 3. Non-Functional Requirements
- **Performance**: Response times, throughput, and resource limits.
- **Security**: Access controls, encryption, and auditability.
- **Reliability & Resilience**: Fallback behavior, retry policies, and error handling.
`,
    },
    {
      subpath: path.join("specs", "design.template.md"),
      content: `---
status: draft
updated_at: 2026-01-01T00:00:00.000Z
approved_by: null
---

# Technical Design: [Feature Title]

## 1. System Architecture
Overview of components, module interactions, and sequence flow for this feature.

## 2. Data Models & Schemas
Define TypeScript interfaces, Zod schemas, or database entities.

## 3. Integration Points & API Contracts
Endpoints, events, or inter-package API contracts.

## 4. Edge Cases & Error Handling
Specific failure modes, boundary conditions, and mitigation strategies.
`,
    },
    {
      subpath: path.join("specs", "tasks.template.yaml"),
      content: `version: "1.0"
feature: "feature-name"
status: "in-progress"
dependency_graph:
  parallel_tracks:
    - track: "Track A"
      sequence: ["1", "2"]
  cross_dependencies: []
notes:
  security:
    - "Validate all input parameters"
  testing:
    - "Achieve 100% test pass rate"
groups:
  - id: "foundation"
    name: "Foundation & Schemas"
    tasks:
      - id: "1"
        parent_id: null
        title: "Define Schemas and Interfaces"
        description: "Scaffold core data models and validation schemas."
        status: "todo"
        priority: "high"
        depends_on: []
        worktree: null
        branch: null
        locked_at: null
        files: []
        leverage: ""
        requirements_ref: ["REQ-1"]
        notes:
          security: null
          testing: null
      - id: "2"
        parent_id: null
        title: "Implement Domain Logic"
        description: "Implement service methods and business rules."
        status: "todo"
        priority: "high"
        depends_on: ["1"]
        worktree: null
        branch: null
        locked_at: null
        files: []
        leverage: ""
        requirements_ref: ["REQ-1"]
        notes:
          security: null
          testing: null
`,
    },
  ];

  for (const tpl of templates) {
    const tplPath = path.join(templatesDir, tpl.subpath);
    if (!fs.existsSync(tplPath)) {
      fs.writeFileSync(tplPath, tpl.content, "utf-8");
    }
  }

  // 7. Actionable Prompts in .specflow/prompts/
  const prompts: { filename: string; content: string }[] = [
    {
      filename: "README.md",
      content: `# Spec-Flow Actionable Agent Prompts

This directory contains standardized, actionable prompt guides for AI agents collaborating on Spec-Flow projects.
Each prompt guides the agent through an SDD stage using Spec-Flow templates and CLI commands.

## Workflow Prompts Index
- \`01-create-steering.md\`: Drafting foundational steering docs (product, tech, structure).
- \`02-create-spec.md\`: Creating feature specifications (requirements, design, auxiliary files).
- \`03-create-tasks.md\`: Decomposing specifications into DAG-validated tasks.yaml.
- \`04-execute-task.md\`: Claiming tasks, implementing, testing, and submitting with HITL gating.
- \`05-address-comments.md\`: Inspecting, addressing, and resolving human review comments.

## Core Rules for Agents
1. **Steering-First**: Steering documents must be approved by a human before specs execute.
2. **DAG Integrity**: Every task prerequisite must be declared; circular dependencies are rejected.
3. **HITL Two-Tier Gate**: Agents submit tasks to \`to-review\`; only human reviewers approve to \`done\`.
4. **History Preservation**: Resolved comments are automatically archived in \`.specflow/.cache/history/\`.
`,
    },
    {
      filename: "01-create-steering.md",
      content: `# Agent Prompt: 01 - Create Steering Documents

You are an expert software architect assisting with project bootstrapping using Spec-Flow.

## Goal
Draft or update foundational steering documents (\`product.md\`, \`tech.md\`, \`structure.md\`) in \`.specflow/steering/\`.

## Prerequisites
- Spec-Flow workspace initialized (\`spec-flow init\`).
- Read-only review of existing repository context.

## Instructions
1. Inspect current steering status:
   \`spec-flow status\`
2. Refer to the turnkey templates in \`templates/steering/\`:
   - \`product.template.md\`: Product vision, target users, features, principles, metrics.
   - \`tech.template.md\`: Technology stack, patterns, security, and quality constraints.
   - \`structure.template.md\`: Monorepo structure, naming conventions, branching rules.
3. Keep YAML frontmatter intact:
   \`\`\`yaml
   ---
   status: draft
   updated_at: <ISO-DATE>
   approved_by: null
   ---
   \`\`\`
4. Write documents into:
   - \`.specflow/steering/product.md\`
   - \`.specflow/steering/tech.md\`
   - \`.specflow/steering/structure.md\`
5. Inform the human architect to review and approve the steering documents:
   - Autonomous agents cannot mark steering documents as \`approved\`.
   - The steering gate must be approved by a human before spec execution begins.
   - Run \`spec-flow status\` to verify approval status.
`,
    },
    {
      filename: "02-create-spec.md",
      content: `# Agent Prompt: 02 - Create Feature Specification

You are an expert engineer creating a new feature specification in Spec-Flow.

## Goal
Scaffold and author \`requirements.md\` and \`design.md\` for a new feature.

## Prerequisites
- Steering documents approved by a human reviewer (\`spec-flow status\`).

## Instructions
1. Verify steering approval status:
   \`spec-flow status\`
   (If unapproved, request human approval before proceeding or pass \`--force\` if explicitly permitted).
2. Scaffold the new spec directory:
   \`spec-flow spec create <spec-id> --title "<Feature Title>"\`
   This generates:
   - \`.specflow/specs/<spec-id>/requirements.md\`
   - \`.specflow/specs/<spec-id>/design.md\`
   - \`.specflow/specs/<spec-id>/tasks.yaml\`
   - \`.specflow/specs/<spec-id>/references/\`
   - \`.specflow/specs/<spec-id>/images/\`
3. Reference templates in \`templates/specs/\`:
   - \`requirements.template.md\`: User story, functional requirements with acceptance criteria, and non-functional requirements.
   - \`design.template.md\`: Architecture, components, interfaces, data models, integration contracts, and error handling.
4. Author \`requirements.md\` and \`design.md\` thoroughly:
   - Ensure every requirement has a distinct tag (\`REQ-1\`, \`REQ-2\`).
   - Define exact schemas, boundary conditions, and test assertions.
5. Place auxiliary artifacts (diagrams, API contracts) into \`references/\` or \`images/\`.
6. Confirm spec file discovery:
   Review discovered files with \`listSpecFiles\` or the dashboard file tree.
`,
    },
    {
      filename: "03-create-tasks.md",
      content: `# Agent Prompt: 03 - Create Task Decomposition

You are an expert software engineer breaking down a feature specification into executable tasks.

## Goal
Generate a valid, DAG-enforced \`tasks.yaml\` in \`.specflow/specs/<spec-id>/tasks.yaml\`.

## Prerequisites
- Completed \`requirements.md\` and \`design.md\` for the target spec.

## Instructions
1. Analyze \`.specflow/specs/<spec-id>/requirements.md\` and \`design.md\`.
2. Reference the template in \`templates/specs/tasks.template.yaml\`.
3. Organize tasks into sequential phases (Foundation, Implementation, Integration, Verification).
4. Each task item must define:
   - \`id\`: Unique alphanumeric ID (e.g., "1", "2", "3").
   - \`title\` & \`description\`: Concrete, actionable goals and deliverables.
   - \`status\`: Always start with \`"todo"\`.
   - \`priority\`: \`"high"\` | \`"medium"\` | \`"low"\`.
   - \`depends_on\`: Array of explicit task IDs that must complete first.
   - \`requirements_ref\`: Array of referenced requirement IDs (e.g., \`["REQ-1"]\`).
   - \`files\`: Expected target files to create or modify.
5. Group independent tracks under \`dependency_graph.parallel_tracks\`.
6. Validate the task graph:
   \`spec-flow task list <spec-id>\`
   Verify that no cycles exist and all dependencies resolve cleanly.
`,
    },
    {
      filename: "04-execute-task.md",
      content: `# Agent Prompt: 04 - Execute Task

You are an autonomous coding agent executing assigned tasks in Spec-Flow.

## Goal
Claim an available task, implement code and tests, and submit it for human review.

## Prerequisites
- Task dependencies are satisfied (\`status: done\`).

## Instructions
1. Inspect available tasks whose dependencies are resolved:
   \`spec-flow task list <spec-id> --available\`
2. Claim the target task:
   \`spec-flow task start <task-id>\`
   This sets status to \`in-progress\` and records the agent lease.
3. Review steering principles and requirements referenced in the task.
4. Implement the changes in the designated files:
   - Write clean, modular TypeScript code conforming to tech guidelines.
   - Preserve comments, existing contracts, and error handling patterns.
5. Write and execute comprehensive unit and integration tests:
   \`bun test\`
   \`bun run typecheck\`
   Ensure 100% test pass rate before submission.
6. Submit the task for human verification (HITL Gate):
   \`spec-flow task complete <task-id> --note "Implemented feature with tests passing."\`
   Note: Autonomous agents are strictly forbidden from setting status to \`done\`.
7. Check for human feedback comments:
   \`spec-flow comment list --pending\`
`,
    },
    {
      filename: "05-address-comments.md",
      content: `# Agent Prompt: 05 - Address Review Comments

You are an autonomous coding agent addressing human feedback and comments.

## Goal
Review pending anchored comments, apply fixes, and resolve comments with history archiving.

## Prerequisites
- Pending review comments exist in the workspace.

## Instructions
1. List pending comments across the project:
   \`spec-flow comment list --pending\`
   Or output as JSON for parsing:
   \`spec-flow comment list --pending --json\`
2. For each comment:
   - Note \`id\`, \`target_file\`, line anchors, and the \`instruction\`.
   - Inspect the anchored lines in \`target_file\`.
   - Make the requested corrections in code or documentation.
   - Verify changes with test suite:
     \`bun test\`
     \`bun run typecheck\`
3. Resolve the comment:
   \`spec-flow comment resolve <comment-id> --note "Addressed feedback and updated tests."\`
   This automatically archives the comment to history and prunes it from pending.
4. Verify all comments are cleared:
   \`spec-flow comment list --pending\`
5. Check resolved history if needed:
   \`spec-flow comment history --file <target_file>\`
`,
    },
  ];

  for (const pr of prompts) {
    const prPath = path.join(sfDir, "prompts", pr.filename);
    if (!fs.existsSync(prPath)) {
      fs.writeFileSync(prPath, pr.content, "utf-8");
    }
  }

  // 8. Steering docs
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
