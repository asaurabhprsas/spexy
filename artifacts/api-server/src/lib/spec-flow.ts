import {
  and,
  asc,
  desc,
  eq,
  inArray,
} from "drizzle-orm";
import {
  Activity,
  Comment,
  Document,
  Feature,
  Task,
  activityTable,
  commentsTable,
  db,
  documentsTable,
  featuresTable,
  projectsTable,
  tasksTable,
} from "@workspace/db";
import {
  getBlockingDependencies,
  getTaskAvailability,
  TaskDefinition,
  TaskStatus,
  transitionTask,
  validateTaskGraph,
  WorkflowRuleError,
} from "@workspace/spec-flow-core";
import { logger } from "./logger";
import { SpecFlowError } from "./spec-flow-errors";

const REQUIRED_STEERING_IDS = [
  "steering-product",
  "steering-tech",
  "steering-structure",
] as const;
const ACTIVE_LEASE_MINUTES = 30;

const STARTER_DOCUMENTS = [
  {
    id: "steering-product",
    title: "Product",
    path: ".spec-workflow/steering/product.md",
    kind: "steering",
    content:
      "# Product direction\n\n## Vision\nMake spec-driven development understandable and reviewable for a human working with coding agents.\n\n## Primary users\nSolo developers and small teams who use Git and delegate implementation to coding agents.\n\n## Product principles\n- Keep project intent readable and versionable.\n- Make task availability and review state explicit.\n- Keep approval decisions with a human.\n",
  },
  {
    id: "steering-tech",
    title: "Technology",
    path: ".spec-workflow/steering/tech.md",
    kind: "steering",
    content:
      "# Technical direction\n\n## Architecture\nTypeScript monorepo with a shared domain core, CLI, local API, and React dashboard.\n\n## Constraints\n- Validate task graphs before accepting them.\n- Keep mutable task execution state separate from task definitions.\n- Prefer local-first operation and explicit recovery.\n",
  },
  {
    id: "steering-structure",
    title: "Project structure",
    path: ".spec-workflow/steering/structure.md",
    kind: "steering",
    content:
      "# Project structure\n\n## Conventions\n- Keep requirements and design documents with their feature specification.\n- Use stable task IDs and explicit dependency references.\n- Keep shared workflow rules in the core package and use them from every interface.\n",
  },
] as const;

function asTaskDefinition(task: Task): TaskDefinition {
  return {
    id: task.taskId,
    groupId: task.groupId,
    parentId: task.parentId,
    title: task.title,
    description: task.description,
    priority: task.priority as TaskDefinition["priority"],
    dependsOn: task.dependsOn,
    files: task.files,
    requirementsRef: task.requirementsRef,
  };
}

function translateWorkflowError(error: unknown): never {
  if (error instanceof WorkflowRuleError) {
    const statusCode =
      error.code === "HUMAN_REVIEW_REQUIRED" ||
      error.code === "AGENT_ACTION_REQUIRED"
        ? 403
        : 409;
    throw new SpecFlowError(statusCode, error.code, error.message);
  }
  throw error;
}

async function recordActivity(summary: string): Promise<void> {
  try {
    await db.insert(activityTable).values({ summary });
  } catch (error) {
    logger.error({ err: error, summary }, "Could not record workspace activity");
  }
}

async function requireSteeringApproved(): Promise<void> {
  const documents = await db
    .select({ id: documentsTable.id, status: documentsTable.status })
    .from(documentsTable)
    .where(eq(documentsTable.kind, "steering"));
  const statusById = new Map(documents.map((document) => [document.id, document.status]));
  const missing = REQUIRED_STEERING_IDS.filter(
    (id) => statusById.get(id) !== "approved",
  );
  if (missing.length > 0) {
    throw new SpecFlowError(
      409,
      "STEERING_GATE_BLOCKED",
      `Approve all required steering documents before creating feature work: ${missing.join(", ")}.`,
    );
  }
}

async function requireFeatureDocsApproved(featureId: string): Promise<void> {
  const docs = await db
    .select({ kind: documentsTable.kind, status: documentsTable.status })
    .from(documentsTable)
    .where(eq(documentsTable.featureId, featureId));
  const approvedRequirements = docs.some(
    (doc) => doc.kind === "requirements" && doc.status === "approved",
  );
  const approvedDesign = docs.some(
    (doc) => doc.kind === "design" && doc.status === "approved",
  );
  if (!approvedRequirements || !approvedDesign) {
    throw new SpecFlowError(
      409,
      "FEATURE_DOCUMENTS_NOT_APPROVED",
      "Approve the requirements and design documents before starting or creating feature tasks.",
    );
  }
}

async function readFeatureTasks(featureId: string): Promise<Task[]> {
  return db
    .select()
    .from(tasksTable)
    .where(eq(tasksTable.featureId, featureId))
    .orderBy(asc(tasksTable.createdAt), asc(tasksTable.taskId));
}

function mapTasks(tasks: Task[]) {
  let definitions: TaskDefinition[];
  try {
    definitions = validateTaskGraph(tasks.map(asTaskDefinition));
  } catch (error) {
    if (error instanceof WorkflowRuleError) {
      throw new SpecFlowError(409, error.code, error.message);
    }
    throw error;
  }

  const statuses = Object.fromEntries(
    tasks.map((task) => [task.taskId, task.status as TaskStatus]),
  );
  const availability = getTaskAvailability(definitions, statuses);

  return tasks.map((task) => {
    const derivedAvailability = availability.get(task.taskId) ?? "blocked";
    const blockers = getBlockingDependencies(
      task.taskId,
      definitions,
      statuses,
    );
    const status =
      derivedAvailability === "done" ? "done" : task.status;
    return {
      id: task.taskId,
      featureId: task.featureId,
      groupId: task.groupId,
      parentId: task.parentId,
      title: task.title,
      description: task.description,
      status,
      availability: derivedAvailability,
      priority: task.priority,
      dependsOn: task.dependsOn,
      blockers,
      files: task.files,
      requirementsRef: task.requirementsRef,
      worktree: task.worktree,
      submissionNote: task.submissionNote,
      revision: task.revision,
    };
  });
}

function mapDocumentSummary(document: Document) {
  return {
    id: document.id,
    title: document.title,
    path: document.path,
    kind: document.kind,
    featureId: document.featureId,
    status: document.status,
    updatedAt: document.updatedAt.toISOString(),
    revision: document.revision,
  };
}

function mapDocument(document: Document) {
  return {
    ...mapDocumentSummary(document),
    content: document.content,
    approvedBy: document.approvedBy,
  };
}

function mapFeature(feature: Feature, tasks: Task[]) {
  const completedTaskCount = tasks.filter(
    (task) => task.status === "done",
  ).length;
  return {
    id: feature.id,
    name: feature.name,
    description: feature.description,
    status:
      tasks.length > 0 && completedTaskCount === tasks.length
        ? "completed"
        : tasks.some((task) => task.status !== "todo")
          ? "in-progress"
          : feature.status,
    taskCount: tasks.length,
    completedTaskCount,
    createdAt: feature.createdAt.toISOString(),
  };
}

function mapComment(comment: Comment) {
  return {
    id: comment.id,
    documentId: comment.documentId,
    selectedText: comment.selectedText,
    startLine: comment.startLine,
    endLine: comment.endLine,
    instruction: comment.instruction,
    status: comment.status,
    resolutionNote: comment.resolutionNote,
    createdAt: comment.createdAt.toISOString(),
  };
}

function mapActivity(activity: Activity) {
  return {
    id: String(activity.id),
    summary: activity.summary,
    createdAt: activity.createdAt.toISOString(),
  };
}

export async function ensureWorkspaceSeeded(): Promise<void> {
  await db
    .insert(projectsTable)
    .values({ id: "default", name: "Spec-Flow Workspace" })
    .onConflictDoNothing();

  for (const document of STARTER_DOCUMENTS) {
    await db
      .insert(documentsTable)
      .values({ ...document, status: "draft" })
      .onConflictDoNothing();
  }

  const [existingActivity] = await db
    .select({ id: activityTable.id })
    .from(activityTable)
    .limit(1);
  if (!existingActivity) {
    await recordActivity("Spec-Flow workspace initialized");
  }
}

export async function getDashboardData() {
  const [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, "default"))
    .limit(1);
  const docs = await db.select().from(documentsTable);
  const features = await db.select().from(featuresTable);
  const allTasks = await db.select().from(tasksTable);
  const comments = await db
    .select()
    .from(commentsTable)
    .where(inArray(commentsTable.status, ["open", "addressed", "orphaned"]));
  const activities = await db
    .select()
    .from(activityTable)
    .orderBy(desc(activityTable.createdAt))
    .limit(6);

  const steeringApproved = REQUIRED_STEERING_IDS.every((id) =>
    docs.some((document) => document.id === id && document.status === "approved"),
  );
  const steeringApprovedCount = REQUIRED_STEERING_IDS.filter((id) =>
    docs.some((document) => document.id === id && document.status === "approved"),
  ).length;
  const taskCounts = {
    todo: 0,
    inProgress: 0,
    toReview: 0,
    done: 0,
    blocked: 0,
  };
  const tasksByFeature = new Map<string, Task[]>();
  for (const task of allTasks) {
    const featureTasks = tasksByFeature.get(task.featureId) ?? [];
    featureTasks.push(task);
    tasksByFeature.set(task.featureId, featureTasks);
  }
  for (const featureTasks of tasksByFeature.values()) {
    const mapped = mapTasks(featureTasks);
    for (const task of mapped) {
      if (task.status === "in-progress") taskCounts.inProgress++;
      else if (task.status === "to-review") taskCounts.toReview++;
      else if (task.status === "done") taskCounts.done++;
      else if (task.availability === "blocked") taskCounts.blocked++;
      else taskCounts.todo++;
    }
  }

  return {
    projectName: project?.name ?? "Spec-Flow Workspace",
    steeringApproved,
    steeringApprovedCount,
    steeringTotal: REQUIRED_STEERING_IDS.length,
    featureCount: features.length,
    taskCounts,
    reviewQueueCount: taskCounts.toReview,
    openCommentsCount: comments.length,
    recentActivity: activities.map(mapActivity),
  };
}

export async function listWorkspaceDocuments() {
  const documents = await db
    .select()
    .from(documentsTable)
    .orderBy(asc(documentsTable.kind), asc(documentsTable.title));
  return documents.map(mapDocumentSummary);
}

export async function getWorkspaceDocument(documentId: string) {
  const [document] = await db
    .select()
    .from(documentsTable)
    .where(eq(documentsTable.id, documentId))
    .limit(1);
  return document ? mapDocument(document) : null;
}

export async function updateWorkspaceDocument(
  documentId: string,
  content: string,
  expectedRevision: number,
) {
  const [existing] = await db
    .select()
    .from(documentsTable)
    .where(eq(documentsTable.id, documentId))
    .limit(1);
  if (!existing) return null;
  if (existing.revision !== expectedRevision) {
    throw new SpecFlowError(
      409,
      "STALE_REVISION",
      "This document changed since it was opened. Refresh it before saving.",
    );
  }

  const [updated] = await db
    .update(documentsTable)
    .set({
      content,
      status: "in-review",
      approvedBy: null,
      revision: existing.revision + 1,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(documentsTable.id, documentId),
        eq(documentsTable.revision, expectedRevision),
      ),
    )
    .returning();
  if (!updated) {
    throw new SpecFlowError(
      409,
      "STALE_REVISION",
      "This document changed while saving. Refresh it before retrying.",
    );
  }
  await recordActivity(`Updated ${existing.title}`);
  return mapDocument(updated);
}

export async function approveWorkspaceDocument(documentId: string) {
  const [existing] = await db
    .select()
    .from(documentsTable)
    .where(eq(documentsTable.id, documentId))
    .limit(1);
  if (!existing) return null;
  if (existing.status !== "in-review") {
    throw new SpecFlowError(
      409,
      "DOCUMENT_NOT_IN_REVIEW",
      "Save the document to submit it for review before approving it.",
    );
  }

  const [openComment] = await db
    .select({ id: commentsTable.id })
    .from(commentsTable)
    .where(
      and(
        eq(commentsTable.documentId, documentId),
        inArray(commentsTable.status, ["open", "orphaned"]),
      ),
    )
    .limit(1);
  if (openComment) {
    throw new SpecFlowError(
      409,
      "OPEN_COMMENTS",
      "Resolve or re-anchor all open comments before approving this document.",
    );
  }

  const [approved] = await db
    .update(documentsTable)
    .set({
      status: "approved",
      approvedBy: "Human reviewer",
      revision: existing.revision + 1,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(documentsTable.id, documentId),
        eq(documentsTable.revision, existing.revision),
      ),
    )
    .returning();
  if (!approved) {
    throw new SpecFlowError(
      409,
      "STALE_REVISION",
      "This document changed before approval. Refresh and review it again.",
    );
  }
  await recordActivity(`Approved ${existing.title}`);
  return mapDocument(approved);
}

export async function listFeatures() {
  const features = await db
    .select()
    .from(featuresTable)
    .orderBy(desc(featuresTable.updatedAt));
  const tasks = await db.select().from(tasksTable);
  return features.map((feature) =>
    mapFeature(
      feature,
      tasks.filter((task) => task.featureId === feature.id),
    ),
  );
}

export async function createFeature(input: {
  id: string;
  name: string;
  description: string;
}) {
  await requireSteeringApproved();
  const requirementsId = `${input.id}-requirements`;
  const designId = `${input.id}-design`;
  const feature = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(featuresTable)
      .values({ ...input, status: "draft" })
      .onConflictDoNothing()
      .returning();
    if (!created) {
      throw new SpecFlowError(
        409,
        "FEATURE_ID_EXISTS",
        `Feature "${input.id}" already exists.`,
      );
    }

    await tx.insert(documentsTable).values([
      {
        id: requirementsId,
        title: `${input.name} requirements`,
        path: `.spec-workflow/specs/${input.id}/requirements.md`,
        kind: "requirements",
        featureId: input.id,
        status: "draft",
        content: `# ${input.name} requirements\n\n## Problem\n\nDescribe the user problem this feature solves.\n\n## Requirements\n\n- [ ] Add a testable requirement.\n\n## Acceptance criteria\n\n- Given a user need, when the feature is implemented, then the expected result is observable.\n`,
      },
      {
        id: designId,
        title: `${input.name} design`,
        path: `.spec-workflow/specs/${input.id}/design.md`,
        kind: "design",
        featureId: input.id,
        status: "draft",
        content: `# ${input.name} design\n\n## Approach\n\nDescribe the proposed implementation and its boundaries.\n\n## Data and interfaces\n\nDocument the affected data, API, and UI contracts.\n\n## Risks\n\nList security, migration, and operational risks.\n`,
      },
    ]);
    return created;
  });
  await recordActivity(`Created feature ${input.name}`);
  return mapFeature(feature, []);
}

export async function listFeatureTasks(featureId: string) {
  const [feature] = await db
    .select({ id: featuresTable.id })
    .from(featuresTable)
    .where(eq(featuresTable.id, featureId))
    .limit(1);
  if (!feature) return null;
  return mapTasks(await readFeatureTasks(featureId));
}

export async function createFeatureTask(
  featureId: string,
  input: TaskDefinition,
) {
  const [feature] = await db
    .select({ id: featuresTable.id })
    .from(featuresTable)
    .where(eq(featuresTable.id, featureId))
    .limit(1);
  if (!feature) return null;
  await requireSteeringApproved();
  await requireFeatureDocsApproved(featureId);

  const created = await db.transaction(async (tx) => {
    const currentTasks = await tx
      .select()
      .from(tasksTable)
      .where(eq(tasksTable.featureId, featureId));
    try {
      validateTaskGraph([...currentTasks.map(asTaskDefinition), input]);
    } catch (error) {
      translateWorkflowError(error);
    }

    const [task] = await tx
      .insert(tasksTable)
      .values({
        featureId,
        taskId: input.id,
        groupId: input.groupId,
        parentId: input.parentId,
        title: input.title,
        description: input.description,
        priority: input.priority,
        dependsOn: input.dependsOn,
        files: input.files,
        requirementsRef: input.requirementsRef,
      })
      .onConflictDoNothing()
      .returning();
    if (!task) {
      throw new SpecFlowError(
        409,
        "TASK_ID_EXISTS",
        `Task ID "${input.id}" already exists in this feature.`,
      );
    }
    await tx
      .update(featuresTable)
      .set({ status: "in-progress", updatedAt: new Date() })
      .where(eq(featuresTable.id, featureId));
    return task;
  });
  await recordActivity(`Added task ${input.title}`);
  return (await listFeatureTasks(featureId))?.find(
    (task) => task.id === created.taskId,
  );
}

export async function claimFeatureTask(
  featureId: string,
  taskId: string,
  input: { worktree: string; actor: string },
) {
  await requireSteeringApproved();
  await requireFeatureDocsApproved(featureId);
  const currentTasks = await readFeatureTasks(featureId);
  const target = currentTasks.find((task) => task.taskId === taskId);
  if (!target) return null;

  const now = new Date();
  if (
    target.status === "in-progress" &&
    target.claimedBy === input.actor &&
    target.worktree === input.worktree &&
    target.leaseExpiresAt &&
    target.leaseExpiresAt >= now
  ) {
    const [renewed] = await db
      .update(tasksTable)
      .set({
        leaseExpiresAt: new Date(
          now.getTime() + ACTIVE_LEASE_MINUTES * 60_000,
        ),
        revision: target.revision + 1,
        updatedAt: now,
      })
      .where(
        and(
          eq(tasksTable.featureId, featureId),
          eq(tasksTable.taskId, taskId),
          eq(tasksTable.revision, target.revision),
        ),
      )
      .returning();
    if (!renewed) {
      throw new SpecFlowError(
        409,
        "LEASE_CONFLICT",
        "This task changed while its lease was being renewed. Refresh the task list.",
      );
    }
    return (await listFeatureTasks(featureId))?.find(
      (task) => task.id === taskId,
    );
  }

  let expectedRevision = target.revision;
  if (
    target.status === "in-progress" &&
    target.leaseExpiresAt &&
    target.leaseExpiresAt < now
  ) {
    await db
      .update(tasksTable)
      .set({
        status: "todo",
        worktree: null,
        claimedBy: null,
        leaseExpiresAt: null,
        revision: target.revision + 1,
        updatedAt: now,
      })
      .where(
        and(
          eq(tasksTable.featureId, featureId),
          eq(tasksTable.taskId, taskId),
          eq(tasksTable.revision, target.revision),
        ),
      );
    currentTasks.splice(currentTasks.indexOf(target), 1, {
      ...target,
      status: "todo",
      worktree: null,
      claimedBy: null,
      leaseExpiresAt: null,
      revision: target.revision + 1,
    });
    expectedRevision += 1;
  }

  const mapped = mapTasks(currentTasks);
  const targetView = mapped.find((task) => task.id === taskId);
  if (
    targetView?.availability !== "available" &&
    !(target.status === "in-progress" &&
      target.claimedBy === input.actor &&
      target.worktree === input.worktree)
  ) {
    throw new SpecFlowError(
      409,
      "TASK_BLOCKED_OR_CLAIMED",
      targetView?.availability === "blocked"
        ? `Task is blocked by: ${targetView.blockers.join(", ") || "an incomplete parent task"}.`
        : "Task is not available to claim.",
    );
  }

  try {
    transitionTask("todo", "claim", "agent");
  } catch (error) {
    translateWorkflowError(error);
  }

  const [claimed] = await db
    .update(tasksTable)
    .set({
      status: "in-progress",
      worktree: input.worktree,
      claimedBy: input.actor,
      leaseExpiresAt: new Date(Date.now() + ACTIVE_LEASE_MINUTES * 60_000),
      revision: expectedRevision + 1,
      updatedAt: now,
    })
    .where(
      and(
        eq(tasksTable.featureId, featureId),
        eq(tasksTable.taskId, taskId),
        eq(tasksTable.status, "todo"),
        eq(tasksTable.revision, expectedRevision),
      ),
    )
    .returning();
  if (!claimed) {
    throw new SpecFlowError(
      409,
      "LEASE_CONFLICT",
      "Another agent claimed this task first. Refresh the task list.",
    );
  }
  await recordActivity(`${input.actor} claimed ${claimed.title}`);
  return (await listFeatureTasks(featureId))?.find(
    (task) => task.id === taskId,
  );
}

export async function submitFeatureTask(
  featureId: string,
  taskId: string,
  note: string,
) {
  const [task] = await db
    .select()
    .from(tasksTable)
    .where(
      and(
        eq(tasksTable.featureId, featureId),
        eq(tasksTable.taskId, taskId),
      ),
    )
    .limit(1);
  if (!task) return null;
  if (task.leaseExpiresAt && task.leaseExpiresAt < new Date()) {
    throw new SpecFlowError(
      409,
      "LEASE_EXPIRED",
      "The task lease expired. Claim it again before submitting.",
    );
  }
  let status: TaskStatus;
  try {
    status = transitionTask(task.status as TaskStatus, "submit", "agent");
  } catch (error) {
    translateWorkflowError(error);
  }
  const [updated] = await db
    .update(tasksTable)
    .set({
      status: status!,
      submissionNote: note,
      leaseExpiresAt: null,
      revision: task.revision + 1,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(tasksTable.featureId, featureId),
        eq(tasksTable.taskId, taskId),
        eq(tasksTable.revision, task.revision),
      ),
    )
    .returning();
  if (!updated) {
    throw new SpecFlowError(
      409,
      "STALE_TASK",
      "This task changed while it was being submitted. Refresh before retrying.",
    );
  }
  await recordActivity(`Submitted ${task.title} for review`);
  return (await listFeatureTasks(featureId))?.find(
    (item) => item.id === taskId,
  );
}

export async function reviewFeatureTask(
  featureId: string,
  taskId: string,
  input: { decision: "approve" | "reject"; note?: string },
) {
  if (input.decision === "reject" && !input.note?.trim()) {
    throw new SpecFlowError(
      400,
      "REJECTION_NOTE_REQUIRED",
      "Add a short reason when rejecting a task.",
    );
  }
  const [task] = await db
    .select()
    .from(tasksTable)
    .where(
      and(
        eq(tasksTable.featureId, featureId),
        eq(tasksTable.taskId, taskId),
      ),
    )
    .limit(1);
  if (!task) return null;

  let status: TaskStatus;
  try {
    status = transitionTask(
      task.status as TaskStatus,
      input.decision,
      "human",
    );
  } catch (error) {
    translateWorkflowError(error);
  }
  const [updated] = await db
    .update(tasksTable)
    .set({
      status: status!,
      worktree: null,
      claimedBy: null,
      leaseExpiresAt: null,
      submissionNote:
        input.decision === "reject"
          ? `Changes requested: ${input.note?.trim()}`
          : task.submissionNote,
      revision: task.revision + 1,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(tasksTable.featureId, featureId),
        eq(tasksTable.taskId, taskId),
        eq(tasksTable.revision, task.revision),
      ),
    )
    .returning();
  if (!updated) {
    throw new SpecFlowError(
      409,
      "STALE_TASK",
      "This task changed during review. Refresh and review it again.",
    );
  }
  await recordActivity(
    input.decision === "approve"
      ? `Approved ${task.title}`
      : `Requested changes for ${task.title}`,
  );
  const [featureTasks, feature] = await Promise.all([
    readFeatureTasks(featureId),
    db
      .select()
      .from(featuresTable)
      .where(eq(featuresTable.id, featureId))
      .limit(1)
      .then((rows) => rows[0]),
  ]);
  if (feature) {
    const allDone =
      featureTasks.length > 0 &&
      featureTasks.every((entry) => entry.status === "done");
    await db
      .update(featuresTable)
      .set({
        status: allDone ? "completed" : "in-progress",
        updatedAt: new Date(),
      })
      .where(eq(featuresTable.id, featureId));
  }
  return mapTasks(featureTasks).find((item) => item.id === taskId);
}

export async function listReviewComments() {
  const comments = await db
    .select()
    .from(commentsTable)
    .where(inArray(commentsTable.status, ["open", "addressed", "orphaned"]))
    .orderBy(desc(commentsTable.createdAt));
  return comments.map(mapComment);
}

export async function createReviewComment(input: {
  documentId: string;
  selectedText: string;
  startLine: number;
  endLine: number;
  instruction: string;
}) {
  const [document] = await db
    .select()
    .from(documentsTable)
    .where(eq(documentsTable.id, input.documentId))
    .limit(1);
  if (!document) return null;
  if (input.endLine < input.startLine) {
    throw new SpecFlowError(
      400,
      "INVALID_COMMENT_RANGE",
      "The selected line range is invalid.",
    );
  }
  if (!document.content.includes(input.selectedText)) {
    throw new SpecFlowError(
      400,
      "COMMENT_ANCHOR_NOT_FOUND",
      "The selected text is no longer present in the document.",
    );
  }
  const [comment] = await db
    .insert(commentsTable)
    .values(input)
    .returning();
  await recordActivity(`Added a review comment to ${document.title}`);
  return mapComment(comment);
}

export async function resolveReviewComment(commentId: string) {
  const [existing] = await db
    .select()
    .from(commentsTable)
    .where(eq(commentsTable.id, commentId))
    .limit(1);
  if (!existing) return null;
  if (existing.status === "resolved") {
    throw new SpecFlowError(
      409,
      "COMMENT_ALREADY_RESOLVED",
      "This comment has already been resolved.",
    );
  }
  const [resolved] = await db
    .update(commentsTable)
    .set({ status: "resolved", updatedAt: new Date() })
    .where(eq(commentsTable.id, commentId))
    .returning();
  await recordActivity("Resolved a review comment");
  return mapComment(resolved);
}
