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

export const SPEXY_DIR = ".spexy";
export const DOCS_DIR = "docs";

export function findProjectRoot(startDir: string = process.cwd()): string {
  let curr = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(curr, SPEXY_DIR)) || fs.existsSync(path.join(curr, ".specflow"))) {
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

export function getSpexyDir(projectRoot: string): string {
  const spexyDir = path.join(projectRoot, SPEXY_DIR);
  if (fs.existsSync(spexyDir)) return spexyDir;
  const legacyDir = path.join(projectRoot, ".specflow");
  if (fs.existsSync(legacyDir)) return legacyDir;
  return spexyDir;
}

export const getSpecflowDir = getSpexyDir;

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
        `Cannot create spec "${specId}": steering documents are not yet approved by a human. Run "spexy status" to review steering documents.`,
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
            branch: `feature/${specId}/1`,
            commit_pattern: `feat(${specId}): Initialize ${title} (refs #1)`,
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

export function initSpexyWorkspace(projectRoot: string): void {
  const sfDir = getSpecflowDir(projectRoot);
  const docsDir = path.join(projectRoot, DOCS_DIR);

  // In the main spexy monorepo, keep templates at project root; in initialized projects, place inside .spexy/templates
  const isMainSpexyRepo =
    fs.existsSync(path.join(projectRoot, "templates")) &&
    fs.existsSync(path.join(projectRoot, "packages", "core"));
  const templatesDir = isMainSpexyRepo
    ? path.join(projectRoot, "templates")
    : path.join(sfDir, "templates");
  const templatesPromptPrefix = isMainSpexyRepo ? "templates" : ".spexy/templates";

  fs.mkdirSync(path.join(sfDir, "steering"), { recursive: true });
  fs.mkdirSync(path.join(sfDir, "specs"), { recursive: true });
  fs.mkdirSync(path.join(templatesDir, "steering"), { recursive: true });
  fs.mkdirSync(path.join(templatesDir, "specs"), { recursive: true });
  fs.mkdirSync(path.join(sfDir, "prompts"), { recursive: true });
  fs.mkdirSync(path.join(sfDir, ".cache", "checkpoints"), { recursive: true });
  fs.mkdirSync(path.join(sfDir, ".cache", "history"), { recursive: true });
  fs.mkdirSync(docsDir, { recursive: true });

  const now = new Date().toISOString();

  // 1. .spexy/config.yaml
  const configPath = path.join(sfDir, "config.yaml");
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, YAML.stringify(DEFAULT_CONFIG), "utf-8");
  }

  // 2. .spexy/.cache/.gitignore
  const cacheGitignore = path.join(sfDir, ".cache", ".gitignore");
  if (!fs.existsSync(cacheGitignore)) {
    fs.writeFileSync(cacheGitignore, "*\n!.gitignore\n", "utf-8");
  }

  // 3. .spexy/.cache/pending-comments.yaml
  const commentsFile = path.join(sfDir, ".cache", "pending-comments.yaml");
  if (!fs.existsSync(commentsFile)) {
    fs.writeFileSync(commentsFile, YAML.stringify({ comments: [] }), "utf-8");
  }

  // 4. .spexy/README.md
  const sfReadme = path.join(sfDir, "README.md");
  if (!fs.existsSync(sfReadme)) {
    fs.writeFileSync(
      sfReadme,
      `# Spexy Workspace

This directory is managed by **Spexy**, the local-first Spec-Driven Development tool.

## Structure
- \`steering/\`: Foundational documents (product, tech, structure). Must be approved by a human before spec execution.
- \`specs/\`: Feature specifications containing requirements, design, tasks, and audit logs.
- \`prompts/\`: Actionable guidance prompts for autonomous AI agents.
- \`.cache/\`: Ephemeral local state, review comments, and rolling checkpoints.
`,
      "utf-8",
    );
  }

  // 5. .spexy/roadmap.md
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

## 1. Product Purpose
- **Core Problem**:
  - What pain points or operational bottlenecks does this project solve?
  - Why is the existing solution or status quo insufficient?
- **Value Proposition**:
  - Primary value delivered to users and stakeholders.
  - Expected transformative outcome.

## 2. Target Users & Personas
- **Primary Persona**:
  - Role, background, and responsibilities.
  - Daily workflows, key needs, and major frustrations.
- **Secondary Personas**:
  - Supporting roles, administrators, reviewers, or executive stakeholders.
  - Permission levels and reporting requirements.

## 3. Key Features & Capabilities
- **Core Feature 1**:
  - Description and expected workflow.
  - User outcome and acceptance criteria.
- **Core Feature 2**:
  - Automation, integration, or intelligence capabilities.
  - Differentiating characteristics.
- **Core Feature 3**:
  - Extension points, reporting, or collaboration tooling.

## 4. Business Objectives & Success Metrics
- **Business Goals**:
  - Strategic objective 1 (e.g., efficiency, quality, speed).
  - Strategic objective 2 (e.g., cost reduction, compliance).
- **Key Performance Indicators (KPIs)**:
  - Metric 1: Quantifiable baseline and target threshold.
  - Metric 2: Adoption, performance, or accuracy targets.

## 5. Product Principles
- **Principle 1**:
  - Core philosophy guiding architectural and product trade-offs.
- **Principle 2**:
  - Quality, security, or developer experience standard.
- **Principle 3**:
  - Simplicity, modularity, or local-first philosophy.

## 6. Monitoring & Visibility
- **Dashboard Type**:
  - Web UI, CLI daemon, or embedded terminal interface.
- **Real-time Observability**:
  - WebSocket, polling, or event stream notification mechanism.
- **Surfaced Metrics**:
  - High-priority state (e.g., task progress, review queue, cycle times).
- **Sharing & Collaboration**:
  - Read-only review links, exports, or audit log persistence.

## 7. Future Vision & Roadmap
- **Short-Term Horizons**:
  - Immediate milestones following initial release.
- **Long-Term Horizons**:
  - Advanced automation, remote synchronization, and analytics capabilities.
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

## 1. Project Type & Classification
- **Archetype**:
  - Web application, CLI tool, API service, library package, or distributed system.
- **Target Runtime**:
  - Bun, Node.js, browser runtime, or multi-platform targets.

## 2. Core Technologies
- **Primary Language & Tools**:
  - Language: TypeScript / ECMAScript target.
  - Package manager and task orchestrator (e.g., Bun, Turborepo).
- **Frameworks & Libraries**:
  - Web/Server framework (e.g., Fastify, native Bun HTTP).
  - Validation engine (e.g., Zod schemas).
  - Serialization: YAML, JSON, frontmatter.
- **Application Architecture**:
  - Layered architecture: Core domain logic vs CLI presentation vs server adapters.
  - State management: File system as single source of truth (.spexy/).
  - Event model: Reactive WebSocket broadcasting and file watchers.
- **Storage & Data Formats**:
  - Primary storage: Local-first Markdown files and YAML documents.
  - Cache: Ring-buffer snapshot backups in \`.spexy/.cache/checkpoints/\`.
- **Integrations & Protocols**:
  - Local WebSocket server (\`ws://\` and \`http://\`).
  - Git integration: branch isolation, worktrees, and commit hooks.

## 3. Development Environment & Quality Standards
- **Build & Dev Tooling**:
  - Test runner: \`bun test\`.
  - Type checking: \`tsc --noEmit\`.
- **Static Analysis & Formatting**:
  - Linter and formatter configurations.
  - Zero-warning policy for production branches.
- **Testing Requirements**:
  - Unit tests for core domain logic and DAG engines.
  - Integration tests for CLI commands and HTTP/WebSocket endpoints.
  - 100% test pass rate required before human review submission.

## 4. Technical Constraints & Security
- **Performance Benchmarks**:
  - Sub-second CLI command startup and execution.
  - Token-optimized outputs (\`--compact\` and \`--json\` modes).
- **Security & Sandboxing**:
  - Path traversal validation and sandboxing.
  - Strict input sanitization and schema parsing.
- **Reliability & Resilience**:
  - File locking with mutex inhibitors to avoid watcher echo loops.
  - Atomic file writes and ring-buffer checkpoint rollback.

## 5. Architectural Decision Log & Limitations
- **Key Decisions**:
  - ADR 1: Local-first file-backed storage over remote database.
  - ADR 2: Two-tier human-in-the-loop (HITL) approval gate for tasks.
- **Known Limitations**:
  - Documented technical constraints and planned remediations.
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

## 1. Monorepo Directory Organization
- **\`packages/\`**:
  - \`packages/core/\`: Domain logic, DAG workflow engine, Zod schemas, file operations.
  - \`packages/cli/\`: Command-line interface, server daemon, dashboard runner.
  - \`packages/ui/\`: Frontend single-page application dashboard.
- **\`.spexy/\`**:
  - \`steering/\`: Foundational product, tech, and structure steering documents.
  - \`specs/\`: Feature specifications with requirements, design, and tasks.yaml.
  - \`templates/\`: Turnkey templates for steering documents, feature specifications, and task graphs.
  - \`prompts/\`: Standardized AI agent prompt guides.
  - \`archived/\`: Archived steering and specification documents.
  - \`.cache/\`: Snapshot ring-buffer checkpoints and resolved comment history.
- **\`docs/\`**:
  - Long-term human documentation and architecture reference manuals.

## 2. Naming Conventions
- **Files & Directories**:
  - Source files: \`kebab-case.ts\` (e.g., \`ring-buffer.ts\`, \`fuzzy-anchor.ts\`).
  - Test files: \`*.test.ts\` co-located with source or in test suites.
  - Documentation: \`kebab-case.md\` or \`.spexy/\` standard conventions.
- **Source Code Symbols**:
  - Classes, interfaces, types: \`PascalCase\` (e.g., \`TasksDocumentSchema\`, \`TaskItem\`).
  - Functions, methods, variables: \`camelCase\` (e.g., \`computeTaskAvailability\`).
  - Constants & Enums: \`UPPER_SNAKE_CASE\` or \`PascalCase\` object enums.

## 3. Import & Export Patterns
- **Import Ordering**:
  - 1. Node.js built-ins (\`node:fs\`, \`node:path\`, \`node:crypto\`).
  - 2. External third-party packages (\`yaml\`, \`zod\`, \`commander\`).
  - 3. Internal monorepo package imports (\`@spexy/core\`).
  - 4. Relative file imports (\`./server\`, \`../fs/workspace\`).
- **Barrel Exports**:
  - Clean public APIs exported via root \`index.ts\` in each package.

## 4. Code Organization & Modularity Principles
- **Single Responsibility Principle**:
  - Each module focuses on a single domain (DAG, checkpoints, comments, workspace).
- **Service & Utility Decoupling**:
  - Separation between file-system mutation, data validation, and CLI rendering.
- **File & Function Size Budgets**:
  - Target modular files under 400 lines where practical.
  - Functions should perform a single logical operation with clear return types.

## 5. Branching & Commit Conventions
- **Branch Strategy**:
  - Feature task branches: \`feature/<spec-id>/<task-id>\` or \`spec/<spec-id>\`.
  - Main branch: \`main\` (always protected, verified via CI).
- **Commit Message Patterns**:
  - Format: \`<type>(<spec-id>): <task-title> (refs #<task-id>)\`.
  - Examples:
    - \`feat(auth): Define Schemas and Interfaces (refs #1)\`
    - \`fix(auth): Resolve session expiration edge-case (refs #2)\`
`,
    },
    {
      subpath: path.join("specs", "requirements.template.md"),
      content: `---
status: draft
updated_at: 2026-01-01T00:00:00.000Z
approved_by: null
---

# Requirements Specification: [Feature Title]

## 1. Introduction & User Value
- **Feature Overview**:
  - Executive summary of the feature and problem addressed.
- **User Goals**:
  - What users accomplish through this feature.
- **Alignment with Steering**:
  - Direct contribution to objectives in \`.spexy/steering/product.md\`.

## 2. Requirements & Acceptance Criteria

### REQ-1: [Core Capability Title]
- **User Story**:
  - As a [user role], I want [capability] so that [tangible benefit].
- **Acceptance Criteria (EARS Format)**:
  - Criteria 1: WHEN [trigger event occurs] THEN [system] SHALL [expected response].
  - Criteria 2: IF [precondition is met] THEN [system] SHALL [expected response].
  - Criteria 3: WHEN [invalid input provided] THEN [system] SHALL [reject with error].

### REQ-2: [Secondary Capability Title]
- **User Story**:
  - As a [user role], I want [capability] so that [tangible benefit].
- **Acceptance Criteria**:
  - Criteria 1: WHEN [trigger event] THEN [system] SHALL [action].
  - Criteria 2: IF [precondition] THEN [system] SHALL [action].

## 3. Non-Functional Requirements
- **Architecture & Modularity**:
  - Single responsibility principle applied to all new modules.
  - Clean separation of interface definitions from implementation logic.
- **Performance**:
  - Maximum latency and memory overhead constraints.
- **Security & Authorization**:
  - Input validation via Zod schemas, sanitization, and permission checks.
- **Reliability & Resilience**:
  - Graceful degradation on failure, structured error reporting.
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

## 1. Overview & Steering Alignment
- **Architectural Fit**:
  - How this design integrates with \`.spexy/steering/tech.md\` and \`structure.md\`.
- **Core Design Patterns**:
  - Selected patterns (e.g., DAG traversal, reactive state, modular adapters).

## 2. Code Reuse & Integration Analysis
- **Existing Components to Leverage**:
  - Shared models, validation utilities, or core services to reuse.
- **Integration Touchpoints**:
  - Inter-package APIs, database schema extensions, or CLI commands.

## 3. Architecture & Data Flow
- **Modular Component Breakdown**:
  - Component A: Responsibilities and boundaries.
  - Component B: Responsibilities and boundaries.
- **Component Interaction Diagram**:
  \`\`\`mermaid
  graph TD
      A[Client Request / CLI] --> B[Validation & DAG Engine]
      B --> C[File Mutation & Checkpoint]
      C --> D[WebSocket Broadcast & Log]
  \`\`\`

## 4. Components & Interfaces
- **Component 1**:
  - Public methods, inputs, and return types.
  - Error conditions and exceptions raised.
- **Component 2**:
  - Contract interfaces and dependencies.

## 5. Data Models & Schemas
- **TypeScript Interfaces & Zod Schemas**:
  - Schema definitions with validation bounds.
  - Invariants and serialization mappings.

## 6. Error Handling & Edge Cases
- **Failure Scenario 1**:
  - Trigger, detection, and mitigation strategy.
- **Failure Scenario 2**:
  - Recovery mechanism and user-facing diagnostic message.

## 7. Testing & Verification Strategy
- **Unit Tests**:
  - Scope: Component-level coverage and schema boundary tests.
- **Integration Tests**:
  - Scope: End-to-end command or API workflow verification.
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
    - "Validate all input parameters with Zod schemas"
  testing:
    - "Achieve 100% test pass rate with bun test"
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
        branch: "feature/<spec-id>/1"
        commit_pattern: "feat(<spec-id>): Define Schemas and Interfaces (refs #1)"
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
        branch: "feature/<spec-id>/2"
        commit_pattern: "feat(<spec-id>): Implement Domain Logic (refs #2)"
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

  // 7. Actionable Prompts in .spexy/prompts/
  const prompts: { filename: string; content: string }[] = [
    {
      filename: "README.md",
      content: `# Spexy Actionable Agent Prompts

This directory contains standardized, actionable prompt guides for AI agents collaborating on Spexy projects.
Each prompt guides the agent through an SDD stage using Spexy templates and CLI commands.

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
4. **History Preservation**: Resolved comments are automatically archived in \`.spexy/.cache/history/\`.
5. **Health Diagnostics**: Always run \`spexy doctor\` (or \`spexy check\`) to verify schema and graph integrity before committing or submitting.
`,
    },
    {
      filename: "01-create-steering.md",
      content: `# Agent Prompt: 01 - Create Steering Documents

You are an expert software architect assisting with project bootstrapping using Spexy.

## Goal
Draft or update foundational steering documents (\`product.md\`, \`tech.md\`, \`structure.md\`) in \`.spexy/steering/\`.

## Prerequisites
- Spexy workspace initialized (\`spexy init\`).
- Read-only review of existing repository context.

## Instructions
1. Inspect current steering status:
   \`spexy status\`
2. Refer to the turnkey templates in \`${templatesPromptPrefix}/steering/\`:
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
   - \`.spexy/steering/product.md\`
   - \`.spexy/steering/tech.md\`
   - \`.spexy/steering/structure.md\`
5. Verify document integrity and frontmatter:
   \`spexy doctor\`
6. Inform the human architect to review and approve the steering documents:
   - Autonomous agents cannot mark steering documents as \`approved\`.
   - The steering gate must be approved by a human before spec execution begins.
   - Run \`spexy status\` to verify approval status.
`,
    },
    {
      filename: "02-create-spec.md",
      content: `# Agent Prompt: 02 - Create Feature Specification

You are an expert engineer creating a new feature specification in Spexy.

## Goal
Scaffold and author \`requirements.md\` and \`design.md\` for a new feature.

## Prerequisites
- Steering documents approved by a human reviewer (\`spexy status\`).

## Instructions
1. Verify steering approval status:
   \`spexy status\`
   (If unapproved, request human approval before proceeding or pass \`--force\` if explicitly permitted).
2. Scaffold the new spec directory:
   \`spexy spec create <spec-id> --title "<Feature Title>"\`
   This generates:
   - \`.spexy/specs/<spec-id>/requirements.md\`
   - \`.spexy/specs/<spec-id>/design.md\`
   - \`.spexy/specs/<spec-id>/tasks.yaml\`
   - \`.spexy/specs/<spec-id>/references/\`
   - \`.spexy/specs/<spec-id>/images/\`
3. Reference templates in \`${templatesPromptPrefix}/specs/\`:
   - \`requirements.template.md\`: User story, functional requirements with acceptance criteria, and non-functional requirements.
   - \`design.template.md\`: Architecture, components, interfaces, data models, integration contracts, and error handling.
4. Author \`requirements.md\` and \`design.md\` thoroughly:
   - Ensure every requirement has a distinct tag (\`REQ-1\`, \`REQ-2\`).
   - Define exact schemas, boundary conditions, and test assertions.
5. Place auxiliary artifacts (diagrams, API contracts) into \`references/\` or \`images/\`.
6. Run workspace diagnostic check:
   \`spexy doctor\`
7. Confirm spec file discovery:
   Review discovered files with \`listSpecFiles\` or the dashboard file tree.
`,
    },
    {
      filename: "03-create-tasks.md",
      content: `# Agent Prompt: 03 - Create Task Decomposition

You are an expert software engineer breaking down a feature specification into executable tasks.

## Goal
Generate a valid, DAG-enforced \`tasks.yaml\` in \`.spexy/specs/<spec-id>/tasks.yaml\`.

## Prerequisites
- Completed \`requirements.md\` and \`design.md\` for the target spec.

## Instructions
1. Analyze \`.spexy/specs/<spec-id>/requirements.md\` and \`design.md\`.
2. Reference the template in \`${templatesPromptPrefix}/specs/tasks.template.yaml\`.
3. Organize tasks into sequential phases (Foundation, Implementation, Integration, Verification).
4. Each task item must define:
   - \`id\`: Unique alphanumeric ID (e.g., "1", "2", "3").
   - \`title\` & \`description\`: Concrete, actionable goals and deliverables.
   - \`status\`: Always start with \`"todo"\`.
   - \`priority\`: \`"high"\` | \`"medium"\` | \`"low"\`.
   - \`depends_on\`: Array of explicit task IDs that must complete first.
   - \`branch\`: Suggested task branch name (e.g., \`feature/<spec-id>/<task-id>\`).
   - \`commit_pattern\`: Standardized commit message pattern (e.g., \`feat(<spec-id>): <task-title> (refs #<task-id>)\`).
   - \`requirements_ref\`: Array of referenced requirement IDs (e.g., \`["REQ-1"]\`).
   - \`files\`: Expected target files to create or modify.
5. Group independent tracks under \`dependency_graph.parallel_tracks\`.
6. Validate task graph and schema integrity:
   \`spexy doctor\`
   Ensure 0 errors and no circular dependencies before committing or proceeding.
7. Inspect task availability list:
   \`spexy task list <spec-id>\`
`,
    },
    {
      filename: "04-execute-task.md",
      content: `# Agent Prompt: 04 - Execute Task

You are an autonomous coding agent executing assigned tasks in Spexy.

## Goal
Claim an available task, implement code and tests, follow git commit patterns, and submit it for human review.

## Prerequisites
- Task dependencies are satisfied (\`status: done\`).

## Instructions
1. Inspect available tasks whose dependencies are resolved:
   \`spexy task list <spec-id> --available\`
2. Claim the target task:
   \`spexy task start <task-id>\`
   This sets status to \`in-progress\` and records the agent lease.
3. Switch or create designated branch if defined:
   \`git checkout -b <branch>\` (e.g., \`feature/<spec-id>/<task-id>\`)
4. Review steering principles and requirements referenced in the task.
5. Implement the changes in the designated files:
   - Write clean, modular TypeScript code conforming to tech guidelines.
   - Preserve comments, existing contracts, and error handling patterns.
6. Write and execute comprehensive unit and integration tests:
   \`bun test\`
   \`bun run typecheck\`
   Ensure 100% test pass rate.
7. Verify workspace schema and DAG health:
   \`spexy doctor\`
   Must pass with 0 errors before committing or submitting.
8. Commit changes following the task's commit message pattern:
   \`git commit -m "<commit_pattern>"\` (e.g., \`feat(<spec-id>): <task-title> (refs #<task-id>)\`)
9. Submit the task for human verification (HITL Gate):
   \`spexy task complete <task-id> --note "Implemented feature with tests passing."\`
   Note: Autonomous agents are strictly forbidden from setting status to \`done\`.
10. Check for human feedback comments:
    \`spexy comment list --pending\`
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
   \`spexy comment list --pending\`
   Or output as JSON for parsing:
   \`spexy comment list --pending --json\`
2. For each comment:
   - Note \`id\`, \`target_file\`, line anchors, and the \`instruction\`.
   - Inspect the anchored lines in \`target_file\`.
   - Make the requested corrections in code or documentation.
   - Verify changes with test suite:
     \`bun test\`
     \`bun run typecheck\`
   - Verify workspace health:
     \`spexy doctor\`
3. Resolve the comment:
   \`spexy comment resolve <comment-id> --note "Addressed feedback and updated tests."\`
   This automatically archives the comment to history and prunes it from pending.
4. Verify all comments are cleared:
   \`spexy comment list --pending\`
5. Check resolved history if needed:
   \`spexy comment history --file <target_file>\`
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
      content: `# Technical Architecture & Rules\n\n## Stack\n- Monorepo with TypeScript, Bun, and Turborepo.\n- Local-first architecture: state persisted in .spexy/ YAML and Markdown.\n- Embedded Fastify WebSocket server for real-time dashboard updates.\n`,
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

- **${now.slice(0, 10)}**: Workspace initialized with Spexy SDD methodology.
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
1. Run \`spexy status\` to inspect steering approval state.
2. List available work: \`spexy task list <spec-id> --available\`.
3. Claim a task: \`spexy task start <task-id>\`.
4. When implementation is verified with unit tests, submit for review: \`spexy task complete <task-id> --note "..."\`.
5. Check for human feedback: \`spexy comment list --pending\`.

## For Human Architects
1. Launch dashboard: \`spexy --dashboard\`.
2. Review steering documents and approve them.
3. Review submitted tasks in the Kanban board and approve or reject them.
`,
      "utf-8",
    );
  }
}
