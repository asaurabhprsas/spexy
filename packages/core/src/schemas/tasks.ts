import { z } from "zod";

export const TaskStatusSchema = z.enum([
  "todo",
  "in-progress",
  "to-review",
  "done",
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const TaskPrioritySchema = z.enum(["low", "medium", "high"]);
export type TaskPriority = z.infer<typeof TaskPrioritySchema>;

export const TaskItemSchema = z.object({
  id: z.string().min(1).max(64),
  parent_id: z.string().min(1).max(64).nullable().default(null),
  title: z.string().min(1).max(200),
  description: z.string().default(""),
  status: TaskStatusSchema.default("todo"),
  priority: TaskPrioritySchema.default("medium"),
  depends_on: z.array(z.string()).default([]),
  worktree: z.string().nullable().default(null),
  branch: z.string().nullable().default(null),
  locked_at: z.string().nullable().default(null),
  files: z.array(z.string()).default([]),
  leverage: z.string().optional().default(""),
  requirements_ref: z.array(z.string()).default([]),
  notes: z
    .object({
      security: z.string().nullable().default(null),
      testing: z.string().nullable().default(null),
    })
    .default({ security: null, testing: null }),
});
export type TaskItem = z.infer<typeof TaskItemSchema>;

export const TaskGroupSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  tasks: z.array(TaskItemSchema).default([]),
});
export type TaskGroup = z.infer<typeof TaskGroupSchema>;

export const TasksDocumentSchema = z.object({
  version: z.string().default("1.0"),
  feature: z.string().min(1),
  status: z.enum(["draft", "in-progress", "to-review", "done"]).default("in-progress"),
  dependency_graph: z
    .object({
      parallel_tracks: z
        .array(
          z.object({
            track: z.string(),
            sequence: z.array(z.string()),
          }),
        )
        .default([]),
      cross_dependencies: z
        .array(
          z.object({
            from: z.string(),
            blocks: z.array(z.string()),
          }),
        )
        .default([]),
    })
    .default({ parallel_tracks: [], cross_dependencies: [] }),
  notes: z
    .object({
      security: z.array(z.string()).default([]),
      testing: z.array(z.string()).default([]),
    })
    .default({ security: [], testing: [] }),
  groups: z.array(TaskGroupSchema).default([]),
});
export type TasksDocument = z.infer<typeof TasksDocumentSchema>;
