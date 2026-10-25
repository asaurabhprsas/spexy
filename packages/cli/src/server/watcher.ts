import fs from "node:fs";
import path from "node:path";
import chokidar, { FSWatcher } from "chokidar";
import YAML from "yaml";
import {
  flattenTasks,
  readConfig,
  readPendingCommentsDoc,
  SPEXY_DIR,
  TasksDocumentSchema,
  validateTaskGraph,
  getErrorMessage,
} from "@spexy/core";

export type BroadcastFn = (event: { type: string; payload: unknown }) => void;

export type WatcherLogFn = (entry: {
  category: "task" | "document" | "comment" | "watcher" | "checkpoint";
  action: string;
  actor: string;
  message: string;
  details?: Record<string, unknown>;
}) => void;

const writeLocks = new Map<string, number>();

/**
 * Helper to inhibit watcher echoing back internal server writes.
 * Sets a write lock for at least 200ms (>100ms requirement).
 */
export async function withFileWriteLock<T>(
  filePath: string,
  fn: () => T | Promise<T>,
  lockDurationMs: number = 250,
): Promise<T> {
  const normalized = path.resolve(filePath);
  writeLocks.set(normalized, Date.now() + lockDurationMs);
  try {
    return await fn();
  } finally {
    setTimeout(() => {
      const expiry = writeLocks.get(normalized);
      if (expiry && expiry <= Date.now()) {
        writeLocks.delete(normalized);
      }
    }, lockDurationMs);
  }
}

export function isFileWriteLocked(filePath: string): boolean {
  const normalized = path.resolve(filePath);
  const expiry = writeLocks.get(normalized);
  if (!expiry) return false;
  if (Date.now() > expiry) {
    writeLocks.delete(normalized);
    return false;
  }
  return true;
}

export interface WatcherHandle {
  watcher: FSWatcher;
  close: () => Promise<void>;
}

export function startWatcher(
  projectRoot: string,
  broadcast: BroadcastFn,
  onLog?: WatcherLogFn,
): WatcherHandle {
  const spexyDir = path.join(projectRoot, SPEXY_DIR);
  if (!fs.existsSync(spexyDir)) {
    fs.mkdirSync(spexyDir, { recursive: true });
  }

  const watcher = chokidar.watch(spexyDir, {
    ignored: [
      /(^|[\/\\])\.git([\/\\]|$)/,
      /(^|[\/\\])node_modules([\/\\]|$)/,
      /(^|[\/\\])\.cache[\/\\]checkpoints([\/\\]|$)/,
      /\.tmp\./,
    ],
    ignoreInitial: true,
    persistent: true,
  });

  const getSpecIdFromPath = (filePath: string): string | null => {
    const relToSpecflow = path.relative(spexyDir, filePath);
    const parts = relToSpecflow.split(/[/\\]/);
    if (parts[0] === "specs" && parts.length >= 3 && parts[1]) {
      return parts[1];
    }
    return null;
  };

  const handleFileChange = (filePath: string, eventType: "add" | "change" = "change") => {
    if (isFileWriteLocked(filePath)) {
      return;
    }

    const basename = path.basename(filePath);

    // 1. tasks.yaml changed
    if (basename === "tasks.yaml") {
      try {
        if (!fs.existsSync(filePath)) return;
        const raw = fs.readFileSync(filePath, "utf-8");
        const parsed = YAML.parse(raw);
        const validated = TasksDocumentSchema.safeParse(parsed);
        if (!validated.success) {
          throw new Error(
            validated.error.issues
              .map((i) => `${i.path.join(".")}: ${i.message}`)
              .join(", "),
          );
        }
        const tasks = flattenTasks(validated.data);
        validateTaskGraph(tasks);

        const specId = path.basename(path.dirname(filePath));
        broadcast({
          type: "TASK_UPDATED",
          payload: { specId, tasks },
        });

        if (onLog) {
          onLog({
            category: "watcher",
            action: "change",
            actor: "watcher",
            message: `Detected external change in tasks for spec ${specId}`,
            details: { file: path.relative(projectRoot, filePath), specId },
          });
        }
      } catch (err: unknown) {
        console.warn(`[Watcher] Corrupted tasks.yaml at ${filePath}:`, getErrorMessage(err));
        broadcast({
          type: "FILE_CORRUPTED",
          payload: {
            file: path.relative(projectRoot, filePath),
            error: getErrorMessage(err),
          },
        });
        broadcast({
          type: "BACKGROUND_ERROR",
          payload: {
            title: "Corrupted tasks.yaml",
            message: `Syntax or schema error in ${path.relative(projectRoot, filePath)}: ${getErrorMessage(err)}`,
            file: path.relative(projectRoot, filePath),
            timestamp: new Date().toISOString(),
          },
        });

        if (onLog) {
          onLog({
            category: "watcher",
            action: "corrupted",
            actor: "watcher",
            message: `Corrupted file detected: ${path.relative(projectRoot, filePath)}`,
            details: {
              file: path.relative(projectRoot, filePath),
              error: getErrorMessage(err),
            },
          });
        }
      }
      return;
    }

    // Spec files update (references, images, documents, auxiliary files)
    const specId = getSpecIdFromPath(filePath);
    if (specId) {
      broadcast({
        type: "SPEC_FILES_UPDATED",
        payload: { specId, file: path.relative(projectRoot, filePath) },
      });

      if (onLog && eventType === "add") {
        onLog({
          category: "watcher",
          action: "add",
          actor: "watcher",
          message: `Spec file added: ${path.relative(projectRoot, filePath)} in spec "${specId}"`,
          details: { file: path.relative(projectRoot, filePath), specId, event: "add" },
        });
      }
    }

    // 2. steering or spec markdown changed
    if (filePath.endsWith(".md")) {
      broadcast({
        type: "DOC_UPDATED",
        payload: {
          file: path.relative(projectRoot, filePath),
        },
      });

      if (onLog) {
        onLog({
          category: "watcher",
          action: "change",
          actor: "watcher",
          message: `Detected external change in document: ${path.relative(projectRoot, filePath)}`,
          details: { file: path.relative(projectRoot, filePath) },
        });
      }
      return;
    }

    // 3. pending-comments.yaml changed
    if (basename === "pending-comments.yaml") {
      try {
        const commentsDoc = readPendingCommentsDoc(projectRoot);
        broadcast({
          type: "COMMENTS_UPDATED",
          payload: {
            comments: commentsDoc.comments,
          },
        });

        if (onLog) {
          onLog({
            category: "watcher",
            action: "change",
            actor: "watcher",
            message: `Detected external change in pending comments`,
            details: { file: path.relative(projectRoot, filePath) },
          });
        }
      } catch (err: unknown) {
        console.warn(`[Watcher] Error reading comments:`, getErrorMessage(err));
      }
      return;
    }

    // 4. config.yaml changed
    if (basename === "config.yaml") {
      try {
        const config = readConfig(projectRoot);
        broadcast({
          type: "CONFIG_UPDATED",
          payload: { config },
        });

        if (onLog) {
          onLog({
            category: "watcher",
            action: "change",
            actor: "watcher",
            message: `Detected external change in config.yaml`,
            details: { file: path.relative(projectRoot, filePath) },
          });
        }
      } catch (err: unknown) {
        console.warn(`[Watcher] Error reading config:`, getErrorMessage(err));
      }
      return;
    }
  };

  const handleFileRemove = (filePath: string) => {
    if (isFileWriteLocked(filePath)) {
      return;
    }

    const specId = getSpecIdFromPath(filePath);
    if (specId) {
      broadcast({
        type: "SPEC_FILES_UPDATED",
        payload: { specId, file: path.relative(projectRoot, filePath) },
      });

      if (onLog) {
        onLog({
          category: "watcher",
          action: "unlink",
          actor: "watcher",
          message: `Spec file removed: ${path.relative(projectRoot, filePath)} in spec "${specId}"`,
          details: { file: path.relative(projectRoot, filePath), specId, event: "unlink" },
        });
      }
    }
  };

  watcher.on("add", (filePath) => handleFileChange(filePath, "add"));
  watcher.on("change", (filePath) => handleFileChange(filePath, "change"));
  watcher.on("unlink", handleFileRemove);
  watcher.on("error", (err: unknown) => {
    console.error("[Watcher Error]", err);
    broadcast({
      type: "BACKGROUND_ERROR",
      payload: {
        title: "File Watcher Error",
        message: getErrorMessage(err),
        timestamp: new Date().toISOString(),
      },
    });
  });

  return {
    watcher,
    close: async () => {
      await watcher.close();
    },
  };
}
