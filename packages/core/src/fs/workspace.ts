import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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

export function resolveScaffoldSourceDir(): string | null {
  if (process.env.SPEXY_SCAFFOLD_DIR && fs.existsSync(process.env.SPEXY_SCAFFOLD_DIR)) {
    return process.env.SPEXY_SCAFFOLD_DIR;
  }

  const baseDirs: string[] = [];

  // 1. Module directory from import.meta.url
  try {
    if (typeof import.meta !== "undefined" && import.meta.url) {
      baseDirs.push(path.dirname(fileURLToPath(import.meta.url)));
    }
  } catch {}

  // 2. Invocation script from process.argv[1] (resolving symlinks)
  try {
    if (process.argv[1]) {
      try {
        const realScript = fs.realpathSync(process.argv[1]);
        baseDirs.push(path.dirname(realScript));
      } catch {}
      baseDirs.push(path.dirname(process.argv[1]));
    }
  } catch {}

  // 3. __dirname fallback
  try {
    if (typeof __dirname !== "undefined") {
      baseDirs.push(__dirname);
    }
  } catch {}

  // 4. Current working directory
  baseDirs.push(process.cwd());

  for (const base of baseDirs) {
    let curr = path.resolve(base);
    while (curr && curr !== path.dirname(curr)) {
      const candidateScaffold = path.join(curr, "scaffold");
      if (
        fs.existsSync(path.join(candidateScaffold, "templates", "steering", "product.template.md")) &&
        fs.existsSync(path.join(candidateScaffold, "prompts", "01-create-steering.md"))
      ) {
        return candidateScaffold;
      }
      const cliScaffold = path.join(curr, "packages", "cli", "scaffold");
      if (
        fs.existsSync(path.join(cliScaffold, "templates", "steering", "product.template.md")) &&
        fs.existsSync(path.join(cliScaffold, "prompts", "01-create-steering.md"))
      ) {
        return cliScaffold;
      }
      curr = path.dirname(curr);
    }
  }
  return null;
}

export function resolveTemplatesSourceDir(): string | null {
  const scaffoldDir = resolveScaffoldSourceDir();
  if (scaffoldDir && fs.existsSync(path.join(scaffoldDir, "templates"))) {
    return path.join(scaffoldDir, "templates");
  }

  if (process.env.SPEXY_TEMPLATES_DIR && fs.existsSync(process.env.SPEXY_TEMPLATES_DIR)) {
    return process.env.SPEXY_TEMPLATES_DIR;
  }

  const baseDirs: string[] = [];

  // 1. Module directory from import.meta.url
  try {
    if (typeof import.meta !== "undefined" && import.meta.url) {
      baseDirs.push(path.dirname(fileURLToPath(import.meta.url)));
    }
  } catch {}

  // 2. Invocation script from process.argv[1] (resolving symlinks)
  try {
    if (process.argv[1]) {
      try {
        const realScript = fs.realpathSync(process.argv[1]);
        baseDirs.push(path.dirname(realScript));
      } catch {}
      baseDirs.push(path.dirname(process.argv[1]));
    }
  } catch {}

  // 3. __dirname fallback
  try {
    if (typeof __dirname !== "undefined") {
      baseDirs.push(__dirname);
    }
  } catch {}

  // 4. Current working directory
  baseDirs.push(process.cwd());

  for (const base of baseDirs) {
    let curr = path.resolve(base);
    while (curr && curr !== path.dirname(curr)) {
      const candidateTemplates = path.join(curr, "templates");
      if (
        fs.existsSync(path.join(candidateTemplates, "steering", "product.template.md")) &&
        fs.existsSync(path.join(candidateTemplates, "specs", "tasks.template.yaml"))
      ) {
        return candidateTemplates;
      }
      const cliTemplates = path.join(curr, "packages", "cli", "templates");
      if (
        fs.existsSync(path.join(cliTemplates, "steering", "product.template.md")) &&
        fs.existsSync(path.join(cliTemplates, "specs", "tasks.template.yaml"))
      ) {
        return cliTemplates;
      }
      curr = path.dirname(curr);
    }
  }
  return null;
}

function copyDirNonDestructive(src: string, dest: string): void {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirNonDestructive(srcPath, destPath);
    } else if (entry.isFile() && !fs.existsSync(destPath)) {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

export function initSpexyWorkspace(projectRoot: string): void {
  const sfDir = getSpecflowDir(projectRoot);

  // In the main spexy monorepo, keep templates at project root; in initialized projects, place inside .spexy/templates
  const isMainSpexyRepo =
    (fs.existsSync(path.join(projectRoot, "templates")) ||
      fs.existsSync(path.join(projectRoot, "scaffold", "templates"))) &&
    fs.existsSync(path.join(projectRoot, "packages", "core"));
  const templatesDir = isMainSpexyRepo && fs.existsSync(path.join(projectRoot, "templates"))
    ? path.join(projectRoot, "templates")
    : path.join(sfDir, "templates");

  // 1. Create required directories
  fs.mkdirSync(path.join(sfDir, "steering"), { recursive: true });
  fs.mkdirSync(path.join(sfDir, "specs"), { recursive: true });
  fs.mkdirSync(path.join(templatesDir, "steering"), { recursive: true });
  fs.mkdirSync(path.join(templatesDir, "specs"), { recursive: true });
  fs.mkdirSync(path.join(sfDir, "prompts"), { recursive: true });
  fs.mkdirSync(path.join(sfDir, ".cache", "checkpoints"), { recursive: true });
  fs.mkdirSync(path.join(sfDir, ".cache", "history"), { recursive: true });

  // 2. Copy scaffold files into .spexy/ if scaffold source directory is available
  const scaffoldDir = resolveScaffoldSourceDir();
  if (scaffoldDir) {
    if (isMainSpexyRepo && path.resolve(templatesDir) !== path.resolve(sfDir, "templates")) {
      // For main repo: copy everything except templates into .spexy/, and ensure root templates are present
      const entries = fs.readdirSync(scaffoldDir, { withFileTypes: true });
      for (const entry of entries) {
        const srcPath = path.join(scaffoldDir, entry.name);
        if (entry.name === "templates") {
          copyDirNonDestructive(srcPath, templatesDir);
        } else {
          const destPath = path.join(sfDir, entry.name);
          if (entry.isDirectory()) {
            copyDirNonDestructive(srcPath, destPath);
          } else if (entry.isFile() && !fs.existsSync(destPath)) {
            fs.copyFileSync(srcPath, destPath);
          }
        }
      }
    } else {
      copyDirNonDestructive(scaffoldDir, sfDir);
    }
  } else {
    // Fallback if scaffold dir not found (minimal bootstrap)
    const configPath = path.join(sfDir, "config.yaml");
    if (!fs.existsSync(configPath)) {
      fs.writeFileSync(configPath, YAML.stringify(DEFAULT_CONFIG), "utf-8");
    }
    const cacheGitignore = path.join(sfDir, ".cache", ".gitignore");
    if (!fs.existsSync(cacheGitignore)) {
      fs.writeFileSync(cacheGitignore, "*\n!.gitignore\n", "utf-8");
    }
    const commentsFile = path.join(sfDir, ".cache", "pending-comments.yaml");
    if (!fs.existsSync(commentsFile)) {
      fs.writeFileSync(commentsFile, YAML.stringify({ comments: [] }), "utf-8");
    }
    const sourceTemplatesDir = resolveTemplatesSourceDir();
    if (sourceTemplatesDir && path.resolve(sourceTemplatesDir) !== path.resolve(templatesDir)) {
      copyDirNonDestructive(sourceTemplatesDir, templatesDir);
    }
  }
}
