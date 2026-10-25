import { TaskItem, TaskStatus } from "../schemas/tasks";

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

export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
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

export function validateTaskGraph(tasks: TaskItem[]): TaskItem[] {
  const byId = new Map<string, TaskItem>();
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
    if (task.parent_id !== null) {
      if (!byId.has(task.parent_id)) {
        throw new WorkflowRuleError(
          "UNKNOWN_PARENT",
          `Task "${task.id}" references missing parent "${task.parent_id}".`,
        );
      }
      if (task.parent_id === task.id) {
        throw new WorkflowRuleError(
          "PARENT_CYCLE",
          `Task "${task.id}" cannot be its own parent.`,
        );
      }
      parentEdges.set(task.id, [task.parent_id]);
    }

    const uniqueDependencies = new Set(task.depends_on);
    if (uniqueDependencies.size !== task.depends_on.length) {
      throw new WorkflowRuleError(
        "DUPLICATE_DEPENDENCY",
        `Task "${task.id}" contains duplicate dependencies.`,
      );
    }

    for (const depId of task.depends_on) {
      if (!byId.has(depId)) {
        throw new WorkflowRuleError(
          "UNKNOWN_DEPENDENCY",
          `Task "${task.id}" depends on missing task "${depId}".`,
        );
      }
      if (depId === task.id) {
        throw new WorkflowRuleError(
          "DEPENDENCY_CYCLE",
          `Task "${task.id}" cannot depend on itself.`,
        );
      }
    }
    dependencyEdges.set(task.id, task.depends_on);
  }

  const ids = tasks.map((t) => t.id);
  assertAcyclic(ids, parentEdges, "PARENT_CYCLE", "Parent");
  assertAcyclic(ids, dependencyEdges, "DEPENDENCY_CYCLE", "Dependency");

  return tasks;
}

export function getTaskAvailability(
  tasks: TaskItem[],
  statuses: Record<string, TaskStatus | undefined>,
): Map<string, TaskAvailability> {
  const children = new Map<string, string[]>();
  const byId = new Map(tasks.map((task) => [task.id, task]));

  for (const task of tasks) {
    if (task.parent_id === null) continue;
    const list = children.get(task.parent_id) ?? [];
    list.push(task.id);
    children.set(task.parent_id, list);
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
    const status = statuses[task.id] ?? task.status ?? "todo";
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

    const isBlocked = task.depends_on.some((depId) => {
      const dep = byId.get(depId);
      if (!dep) return true;
      return !subtreeIsDone(dep.id);
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
  tasks: TaskItem[],
  statuses: Record<string, TaskStatus | undefined>,
): string[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const children = new Map<string, string[]>();

  for (const task of tasks) {
    if (task.parent_id === null) continue;
    const list = children.get(task.parent_id) ?? [];
    list.push(task.id);
    children.set(task.parent_id, list);
  }

  const leaves = (id: string): string[] => {
    const childIds = children.get(id) ?? [];
    return childIds.length === 0 ? [id] : childIds.flatMap(leaves);
  };

  const task = byId.get(taskId);
  if (!task) return [];

  return task.depends_on.filter((depId) =>
    leaves(depId).some((leafId) => (statuses[leafId] ?? "todo") !== "done"),
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
      "A human reviewer must approve or reject submitted work. Agents cannot mark tasks done.",
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
