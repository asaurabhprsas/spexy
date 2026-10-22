import { z } from "zod/v4";

export const TaskStatusSchema = z.enum([
  "todo",
  "in-progress",
  "to-review",
  "done",
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const TaskDefinitionSchema = z
  .object({
    id: z.string().min(1).max(32),
    groupId: z.string().min(1).max(64),
    parentId: z.string().min(1).max(32).nullable(),
    title: z.string().min(2).max(180),
    description: z.string().max(4000),
    priority: z.enum(["low", "medium", "high"]),
    dependsOn: z.array(z.string().min(1).max(32)),
    files: z.array(z.string().max(500)),
    requirementsRef: z.array(z.string().max(100)),
  })
  .strict();

export type TaskDefinition = z.infer<typeof TaskDefinitionSchema>;
export type TaskAvailability =
  | "available"
  | "blocked"
  | "claimed"
  | "in-review"
  | "done";
export type WorkflowActor = "agent" | "human";
export type TaskAction = "claim" | "submit" | "approve" | "reject" | "set_status";

export class WorkflowRuleError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "WorkflowRuleError";
    this.code = code;
  }
}

function assertAcyclic(
  nodes: string[],
  edges: Map<string, string[]>,
  code: string,
  label: string,
): void {
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const path: string[] = [];

  const visit = (node: string): void => {
    if (visiting.has(node)) {
      const cycleStart = path.indexOf(node);
      const cycle = [...path.slice(cycleStart), node].join(" → ");
      throw new WorkflowRuleError(code, `${label} cycle detected: ${cycle}`);
    }
    if (visited.has(node)) return;

    visiting.add(node);
    path.push(node);
    for (const target of edges.get(node) ?? []) visit(target);
    path.pop();
    visiting.delete(node);
    visited.add(node);
  };

  for (const node of nodes) visit(node);
}

export function validateTaskGraph(input: unknown): TaskDefinition[] {
  const parsed = z.array(TaskDefinitionSchema).safeParse(input);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "tasks"}: ${issue.message}`)
      .join("; ");
    throw new WorkflowRuleError("INVALID_TASK_GRAPH", detail);
  }

  const tasks = parsed.data;
  const byId = new Map<string, TaskDefinition>();
  for (const task of tasks) {
    if (byId.has(task.id)) {
      throw new WorkflowRuleError(
        "DUPLICATE_TASK_ID",
        `Task ID "${task.id}" is duplicated.`,
      );
    }
    byId.set(task.id, task);
  }

  const parentEdges = new Map<string, string[]>();
  const dependencyEdges = new Map<string, string[]>();
  for (const task of tasks) {
    if (task.parentId !== null) {
      if (!byId.has(task.parentId)) {
        throw new WorkflowRuleError(
          "UNKNOWN_PARENT",
          `Task "${task.id}" references missing parent "${task.parentId}".`,
        );
      }
      if (task.parentId === task.id) {
        throw new WorkflowRuleError(
          "PARENT_CYCLE",
          `Task "${task.id}" cannot be its own parent.`,
        );
      }
      parentEdges.set(task.id, [task.parentId]);
    }

    const uniqueDependencies = new Set(task.dependsOn);
    if (uniqueDependencies.size !== task.dependsOn.length) {
      throw new WorkflowRuleError(
        "DUPLICATE_DEPENDENCY",
        `Task "${task.id}" contains a duplicate dependency.`,
      );
    }
    for (const dependencyId of task.dependsOn) {
      if (!byId.has(dependencyId)) {
        throw new WorkflowRuleError(
          "UNKNOWN_DEPENDENCY",
          `Task "${task.id}" depends on missing task "${dependencyId}".`,
        );
      }
      if (dependencyId === task.id) {
        throw new WorkflowRuleError(
          "DEPENDENCY_CYCLE",
          `Task "${task.id}" cannot depend on itself.`,
        );
      }
    }
    dependencyEdges.set(task.id, task.dependsOn);
  }

  const ids = tasks.map((task) => task.id);
  assertAcyclic(ids, parentEdges, "PARENT_CYCLE", "Parent");
  assertAcyclic(ids, dependencyEdges, "DEPENDENCY_CYCLE", "Dependency");
  return tasks;
}

export function getTaskAvailability(
  tasks: TaskDefinition[],
  statuses: Record<string, TaskStatus | undefined>,
): Map<string, TaskAvailability> {
  const children = new Map<string, string[]>();
  const byId = new Map(tasks.map((task) => [task.id, task]));

  for (const task of tasks) {
    if (task.parentId === null) continue;
    const list = children.get(task.parentId) ?? [];
    list.push(task.id);
    children.set(task.parentId, list);
  }

  const leafDescendants = (id: string): string[] => {
    const childIds = children.get(id) ?? [];
    if (childIds.length === 0) return [id];
    return childIds.flatMap(leafDescendants);
  };

  const subtreeIsDone = (id: string): boolean =>
    leafDescendants(id).every((leafId) => statuses[leafId] === "done");

  const availability = new Map<string, TaskAvailability>();
  for (const task of tasks) {
    const status = statuses[task.id] ?? "todo";
    if (status === "done") {
      availability.set(task.id, "done");
      continue;
    }
    if (status === "in-progress") {
      availability.set(task.id, "claimed");
      continue;
    }
    if (status === "to-review") {
      availability.set(task.id, "in-review");
      continue;
    }

    const isBlocked = task.dependsOn.some((dependencyId) => {
      const dependency = byId.get(dependencyId);
      if (!dependency) return true;
      return !subtreeIsDone(dependency.id);
    });

    if (isBlocked) {
      availability.set(task.id, "blocked");
      continue;
    }

    if ((children.get(task.id)?.length ?? 0) > 0 && subtreeIsDone(task.id)) {
      availability.set(task.id, "done");
      continue;
    }

    availability.set(task.id, "available");
  }

  return availability;
}

export const computeTaskAvailability = getTaskAvailability;

export function getBlockingDependencies(
  taskId: string,
  tasks: TaskDefinition[],
  statuses: Record<string, TaskStatus | undefined>,
): string[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const children = new Map<string, string[]>();
  for (const task of tasks) {
    if (task.parentId === null) continue;
    const list = children.get(task.parentId) ?? [];
    list.push(task.id);
    children.set(task.parentId, list);
  }

  const leaves = (id: string): string[] => {
    const childIds = children.get(id) ?? [];
    return childIds.length === 0 ? [id] : childIds.flatMap(leaves);
  };

  const task = byId.get(taskId);
  if (!task) return [];
  return task.dependsOn.filter((dependencyId) =>
    leaves(dependencyId).some((leafId) => statuses[leafId] !== "done"),
  );
}

export function transitionTask(
  currentStatus: TaskStatus,
  action: TaskAction,
  actor: WorkflowActor,
  targetStatus?: TaskStatus,
): TaskStatus {
  if (action === "set_status" || (actor === "human" && targetStatus !== undefined)) {
    if (actor !== "human") {
      throw new WorkflowRuleError(
        "HUMAN_OVERRIDE_REQUIRED",
        "Only human operators can manually override task status.",
      );
    }
    const target = targetStatus;
    if (!target || !["todo", "in-progress", "to-review", "done"].includes(target)) {
      throw new WorkflowRuleError(
        "INVALID_TARGET_STATUS",
        `Target status "${target}" is invalid for manual status override.`,
      );
    }
    return target;
  }

  if (action === "claim") {
    if (currentStatus !== "todo") {
      throw new WorkflowRuleError(
        "TASK_NOT_CLAIMABLE",
        "Only a todo task can be claimed.",
      );
    }
    return "in-progress";
  }

  if (action === "submit") {
    if (actor !== "agent") {
      throw new WorkflowRuleError(
        "AGENT_ACTION_REQUIRED",
        "Only the task's agent can submit implementation for review.",
      );
    }
    if (currentStatus !== "in-progress") {
      throw new WorkflowRuleError(
        "TASK_NOT_IN_PROGRESS",
        "Only an in-progress task can be submitted for review.",
      );
    }
    return "to-review";
  }

  if (actor !== "human") {
    throw new WorkflowRuleError(
      "HUMAN_REVIEW_REQUIRED",
      "A human reviewer must approve or reject submitted work.",
    );
  }

  if (action === "reject") {
    if (currentStatus !== "to-review" && currentStatus !== "done") {
      throw new WorkflowRuleError(
        "TASK_NOT_AWAITING_REVIEW",
        "Only a task awaiting review or previously completed can be rejected.",
      );
    }
    return "todo";
  }

  if (action === "approve") {
    if (currentStatus !== "to-review") {
      throw new WorkflowRuleError(
        "TASK_NOT_AWAITING_REVIEW",
        "Only a task awaiting review can be approved or rejected.",
      );
    }
    return "done";
  }

  throw new WorkflowRuleError(
    "INVALID_ACTION",
    `Unsupported workflow action: ${action}`,
  );
}
