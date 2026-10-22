import { z } from "zod";

export const CommentStatusSchema = z.enum(["pending", "addressed"]);
export type CommentStatus = z.infer<typeof CommentStatusSchema>;

export const CommentAnchorSchema = z.object({
  start_line: z.number().int().min(1),
  end_line: z.number().int().min(1),
  anchor_text: z.string(),
  context_before: z.string().default(""),
});
export type CommentAnchor = z.infer<typeof CommentAnchorSchema>;

export const CommentItemSchema = z.object({
  id: z.string().min(1),
  target_file: z.string().min(1),
  status: CommentStatusSchema.default("pending"),
  author: z.enum(["human", "agent"]).default("human"),
  created_at: z.string().datetime().or(z.string()),
  anchor: CommentAnchorSchema,
  instruction: z.string().min(1),
  resolution_note: z.string().nullable().default(null),
  resolved_at: z.string().datetime().or(z.string()).optional(),
  resolved_by: z.string().optional(),
});
export type CommentItem = z.infer<typeof CommentItemSchema>;

export const PendingCommentsDocumentSchema = z.object({
  comments: z.array(CommentItemSchema).default([]),
});
export type PendingCommentsDocument = z.infer<typeof PendingCommentsDocumentSchema>;

export const CommentHistoryDocumentSchema = z.object({
  comments: z.array(CommentItemSchema).default([]),
});
export type CommentHistoryDocument = z.infer<typeof CommentHistoryDocumentSchema>;
