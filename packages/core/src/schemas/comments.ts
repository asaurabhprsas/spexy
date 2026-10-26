import { z } from "zod";

export const CommentStatusSchema = z.enum(["pending", "addressed", "resolved", "deleted"]);
export type CommentStatus = z.infer<typeof CommentStatusSchema>;

export const CommentAnchorSchema = z.object({
  start_line: z.number().int().min(1),
  end_line: z.number().int().min(1),
  anchor_text: z.string(),
  context_before: z.string().default(""),
});
export type CommentAnchor = z.infer<typeof CommentAnchorSchema>;

export const CommentAttachmentSchema = z.object({
  name: z.string(),
  path: z.string(),
  is_temp: z.boolean().default(true),
  size: z.number().optional(),
  mime: z.string().optional(),
});
export type CommentAttachment = z.infer<typeof CommentAttachmentSchema>;

export const CommentItemSchema = z.object({
  id: z.string().min(1),
  target_file: z.string().default(""),
  target_type: z.enum(["document", "task", "general", "spec", "code", "file"]).default("document"),
  target_id: z.string().nullable().optional().default(null),
  status: CommentStatusSchema.default("pending"),
  author: z.enum(["human", "agent"]).default("human"),
  created_at: z.string().datetime().or(z.string()),
  anchor: CommentAnchorSchema.nullable().optional().default(null),
  instruction: z.string().min(1),
  resolution_note: z.string().nullable().default(null),
  resolved_at: z.string().datetime().or(z.string()).optional(),
  resolved_by: z.string().optional(),
  attachments: z.array(CommentAttachmentSchema).default([]),
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
