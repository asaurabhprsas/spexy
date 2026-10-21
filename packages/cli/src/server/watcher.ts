import fs from "node:fs";
import path from "node:path";
import chokidar, { FSWatcher } from "chokidar";
import YAML from "yaml";
import {
  flattenTasks,
  readConfig,
  readPendingCommentsDoc,
  SPECFLOW_DIR,
  TasksDocumentSchema,
  validateTaskGraph,
} from "./core";

export type BroadcastFn = (event: { type: string; payload: any }) => void;

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
): WatcherHandle {
  const specflowDir = path.join(projectRoot, SPECFLOW_DIR);
  if (!fs.existsSync(specflowDir)) {
    fs.mkdirSync(specflowDir, { recursive: true });
  }

  const watcher = chokidar.watch(specflowDir, {
    ignored: [
      /(^|[\/\\])\.git([\/\\]|$)/,
      /(^|[\/\\])node_modules([\/\\]|$)/,
      /(^|[\/\\])\.cache[\/\\]checkpoints([\/\\]|$)/,
      /\.tmp\./,
    ],
    ignoreInitial: true,
    persistent: true,
  });

  const handleFileChange = (filePath: string) => {
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
      } catch (err: any) {
        console.warn(`[Watcher] Corrupted tasks.yaml at ${filePath}:`, err.message);
        broadcast({
          type: "FILE_CORRUPTED",
          payload: {
            file: path.relative(projectRoot, filePath),
            error: err.message,
          },
        });
      }
      return;
    }

    // 2. steering or spec markdown changed
    if (filePath.endsWith(".md")) {
      broadcast({
        type: "DOC_UPDATED",
        payload: {
          file: path.relative(projectRoot, filePath),
        },
      });
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
      } catch (err: any) {
        console.warn(`[Watcher] Error reading comments:`, err.message);
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
      } catch (err: any) {
        console.warn(`[Watcher] Error reading config:`, err.message);
      }
      return;
    }
  };

  watcher.on("add", handleFileChange);
  watcher.on("change", handleFileChange);

  return {
    watcher,
    close: async () => {
      await watcher.close();
    },
  };
}
