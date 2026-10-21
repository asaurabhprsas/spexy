import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { getSpecflowDir } from "../fs/workspace";
import {
  CommentItem,
  PendingCommentsDocument,
  PendingCommentsDocumentSchema,
} from "../schemas/comments";

function getCommentsFilePath(projectRoot: string): string {
  return path.join(getSpecflowDir(projectRoot), ".cache", "pending-comments.yaml");
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
  filters?: { target_file?: string; pendingOnly?: boolean },
): CommentItem[] {
  const doc = readPendingCommentsDoc(projectRoot);
  return doc.comments.filter((c) => {
    if (filters?.pendingOnly && c.status !== "pending") return false;
    if (filters?.target_file && c.target_file !== filters.target_file) return false;
    return true;
  });
}

export function addComment(
  projectRoot: string,
  input: Omit<CommentItem, "id" | "created_at" | "status" | "resolution_note"> & {
    id?: string;
  },
): CommentItem {
  const doc = readPendingCommentsDoc(projectRoot);
  const id = input.id || `cmt-${Math.random().toString(36).substring(2, 9)}`;

  const newComment: CommentItem = {
    id,
    target_file: input.target_file,
    status: "pending",
    author: input.author,
    created_at: new Date().toISOString(),
    anchor: input.anchor,
    instruction: input.instruction,
    resolution_note: null,
  };

  doc.comments.push(newComment);
  writePendingCommentsDoc(projectRoot, doc);
  return newComment;
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

  if (options?.purge !== false) {
    // PRD FR-4: Resolved comments are pruned from pending-comments.yaml, leaving repository clean
    doc.comments.splice(idx, 1);
  }

  writePendingCommentsDoc(projectRoot, doc);
  return comment;
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
