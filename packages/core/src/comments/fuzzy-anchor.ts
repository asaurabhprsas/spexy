import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { getSpecflowDir } from "../fs/workspace";
import {
  CommentAnchor,
  CommentHistoryDocument,
  CommentHistoryDocumentSchema,
  CommentItem,
  PendingCommentsDocument,
  PendingCommentsDocumentSchema,
} from "../schemas/comments";

function getCommentsFilePath(projectRoot: string): string {
  return path.join(getSpecflowDir(projectRoot), ".cache", "pending-comments.yaml");
}

function getHistoryFilePath(projectRoot: string): string {
  return path.join(getSpecflowDir(projectRoot), ".cache", "history", "comments-history.yaml");
}

export function readCommentHistoryDoc(projectRoot: string): CommentHistoryDocument {
  const filePath = getHistoryFilePath(projectRoot);
  if (!fs.existsSync(filePath)) {
    return { comments: [] };
  }
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = YAML.parse(raw);
    const validated = CommentHistoryDocumentSchema.safeParse(parsed);
    return validated.success ? validated.data : { comments: [] };
  } catch {
    return { comments: [] };
  }
}

export function writeCommentHistoryDoc(
  projectRoot: string,
  doc: CommentHistoryDocument,
): void {
  const filePath = getHistoryFilePath(projectRoot);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, YAML.stringify(doc), "utf-8");
}

export function readPendingCommentsDoc(projectRoot: string): PendingCommentsDocument {
  const filePath = getCommentsFilePath(projectRoot);
  if (!fs.existsSync(filePath)) {
    return { comments: [] };
  }
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = YAML.parse(raw);
    const validated = PendingCommentsDocumentSchema.safeParse(parsed);
    return validated.success ? validated.data : { comments: [] };
  } catch {
    return { comments: [] };
  }
}

export function writePendingCommentsDoc(
  projectRoot: string,
  doc: PendingCommentsDocument,
): void {
  const filePath = getCommentsFilePath(projectRoot);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, YAML.stringify(doc), "utf-8");
}

export function listComments(
  projectRoot: string,
  filters?: {
    target_file?: string;
    target_type?: string;
    target_id?: string;
    pendingOnly?: boolean;
  },
): CommentItem[] {
  const doc = readPendingCommentsDoc(projectRoot);
  return doc.comments.filter((c) => {
    if (filters?.pendingOnly && c.status !== "pending") return false;
    if (filters?.target_type && c.target_type !== filters.target_type) return false;
    if (filters?.target_id && c.target_id !== filters.target_id) return false;
    if (filters?.target_file && c.target_file !== filters.target_file) return false;
    return true;
  });
}

export type AddCommentInput = {
  id?: string;
  target_file?: string;
  target_type?: "document" | "task" | "general" | "spec" | "code" | "file";
  target_id?: string | null;
  author?: "human" | "agent";
  anchor?: CommentAnchor | null;
  instruction: string;
  attachments?: Array<{ name: string; path: string; is_temp?: boolean; size?: number; mime?: string }>;
};

export function addComment(
  projectRoot: string,
  input: AddCommentInput,
): CommentItem {
  const doc = readPendingCommentsDoc(projectRoot);
  const id = input.id || `cmt-${Math.random().toString(36).substring(2, 9)}`;

  const newComment: CommentItem = {
    id,
    target_file: input.target_file || "",
    target_type: input.target_type || "document",
    target_id: input.target_id ?? null,
    status: "pending",
    author: input.author || "human",
    created_at: new Date().toISOString(),
    anchor: input.anchor ?? null,
    instruction: input.instruction,
    resolution_note: null,
    attachments: (input.attachments || []).map((a) => ({
      name: a.name,
      path: a.path,
      is_temp: a.is_temp ?? true,
      size: a.size,
      mime: a.mime,
    })),
  };

  doc.comments.push(newComment);
  writePendingCommentsDoc(projectRoot, doc);
  return newComment;
}

export function deleteComment(projectRoot: string, commentId: string): void {
  const doc = readPendingCommentsDoc(projectRoot);
  const idx = doc.comments.findIndex((c) => c.id === commentId);

  if (idx === -1) {
    throw new Error(`Comment not found: "${commentId}"`);
  }

  doc.comments.splice(idx, 1);
  writePendingCommentsDoc(projectRoot, doc);
}

export function updateComment(
  projectRoot: string,
  commentId: string,
  updates: { instruction?: string; anchor?: Partial<CommentAnchor> },
): CommentItem {
  const doc = readPendingCommentsDoc(projectRoot);
  const idx = doc.comments.findIndex((c) => c.id === commentId);

  if (idx === -1) {
    throw new Error(`Comment not found: "${commentId}"`);
  }

  const comment = doc.comments[idx];
  if (updates.instruction !== undefined) {
    comment.instruction = updates.instruction;
  }
  if (updates.anchor) {
    comment.anchor = {
      start_line: updates.anchor.start_line ?? comment.anchor?.start_line ?? 1,
      end_line: updates.anchor.end_line ?? comment.anchor?.end_line ?? 1,
      anchor_text: updates.anchor.anchor_text ?? comment.anchor?.anchor_text ?? "",
      context_before: updates.anchor.context_before ?? comment.anchor?.context_before ?? "",
    };
  }

  writePendingCommentsDoc(projectRoot, doc);
  return comment;
}

export function resolveComment(
  projectRoot: string,
  commentId: string,
  note: string,
  options?: { purge?: boolean },
): CommentItem {
  const doc = readPendingCommentsDoc(projectRoot);
  const idx = doc.comments.findIndex((c) => c.id === commentId);

  if (idx === -1) {
    throw new Error(`Comment not found: "${commentId}"`);
  }

  const comment = doc.comments[idx];
  comment.status = "addressed";
  comment.resolution_note = note;
  comment.resolved_at = new Date().toISOString();
  comment.resolved_by = "human";

  // Append resolved comment into .spexy/.cache/history/comments-history.yaml
  const historyDoc = readCommentHistoryDoc(projectRoot);
  historyDoc.comments.push({ ...comment });
  writeCommentHistoryDoc(projectRoot, historyDoc);

  if (options?.purge !== false) {
    // PRD FR-4: Resolved comments are pruned from pending-comments.yaml, leaving repository clean
    doc.comments.splice(idx, 1);
  }

  writePendingCommentsDoc(projectRoot, doc);
  return comment;
}

export function listCommentHistory(
  projectRoot: string,
  target_file?: string,
): CommentItem[] {
  const historyDoc = readCommentHistoryDoc(projectRoot);
  if (!target_file) {
    return historyDoc.comments;
  }
  const norm = (s: string) => s.replace(/^\.?\/?\.spexy\//, "").replace(/^\.?\//, "").replace(/:/g, "/");
  const targetNorm = norm(target_file);
  return historyDoc.comments.filter((c) => {
    if (!target_file) return true;
    if (c.target_file === target_file) return true;
    const cNorm = norm(c.target_file);
    return cNorm === targetNorm || cNorm.endsWith(targetNorm) || targetNorm.endsWith(cNorm);
  });
}

export interface RealignedAnchor {
  start_line: number;
  end_line: number;
  matched: boolean;
  confidence: number;
}

/**
 * 3-line context hashing & fuzzy resynchronization algorithm.
 * Searches current file lines for best match of anchor_text and context_before.
 */
export function realignAnchor(
  fileContent: string,
  anchorText: string,
  contextBefore?: string,
  originalStartLine?: number,
): RealignedAnchor {
  const lines = fileContent.split("\n");
  const trimmedAnchor = anchorText.trim();
  if (!trimmedAnchor) {
    return {
      start_line: originalStartLine || 1,
      end_line: originalStartLine || 1,
      matched: false,
      confidence: 0,
    };
  }

  // 1. Exact substring line scan
  const anchorLines = trimmedAnchor.split("\n").map((l) => l.trim());
  const anchorLen = anchorLines.length;

  let bestMatchIndex = -1;
  let bestScore = -1;

  for (let i = 0; i <= lines.length - anchorLen; i++) {
    let score = 0;
    let matches = 0;
    for (let j = 0; j < anchorLen; j++) {
      if (lines[i + j].trim() === anchorLines[j]) {
        matches++;
      } else if (lines[i + j].includes(anchorLines[j])) {
        matches += 0.5;
      }
    }

    if (matches > 0) {
      score = matches / anchorLen;

      // Bonus if context_before matches prior lines
      if (contextBefore && i > 0) {
        const prevLines = lines.slice(Math.max(0, i - 3), i).join("\n");
        if (prevLines.includes(contextBefore.trim())) {
          score += 0.5;
        }
      }

      // Penalty for distance from originalStartLine
      if (originalStartLine) {
        const distance = Math.abs(i + 1 - originalStartLine);
        score -= distance * 0.005;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatchIndex = i;
      }
    }
  }

  if (bestMatchIndex !== -1 && bestScore > 0.3) {
    return {
      start_line: bestMatchIndex + 1,
      end_line: bestMatchIndex + anchorLen,
      matched: true,
      confidence: Math.min(1, Math.max(0, bestScore)),
    };
  }

  return {
    start_line: originalStartLine || 1,
    end_line: (originalStartLine || 1) + anchorLen - 1,
    matched: false,
    confidence: 0,
  };
}
