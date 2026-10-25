import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import {
  addComment,
  archiveDocument,
  createSpec,
  deleteComment,
  findProjectRoot,
  flattenTasks,
  getBlockingDependencies,
  getPreferences,
  getSpecflowDir,
  getSteeringStatus,
  getTaskAvailability,
  initSpexyWorkspace,
  listCommentHistory,
  listComments,
  listSnapshots,
  listSpecFiles,
  listSpecs,
  parseDocumentFrontmatter,
  readConfig,
  readPendingCommentsDoc,
  writePendingCommentsDoc,
  readTasksYaml,
  resolveComment,
  restoreSnapshot,
  serializeDocumentWithFrontmatter,
  SpecFileInfo,
  TaskAction,
  TaskItem,
  TaskStatus,
  TasksDocument,
  transitionTask,
  updateComment,
  updatePreferences,
  updateSteeringDocument,
  updateTaskInDoc,
  validateTaskGraph,
  WorkflowActor,
  WorkflowRuleError,
  writeTasksYaml,
  CommentItem,
  CommentAnchor,
  getErrorMessage,
} from "@spexy/core";
import { startWatcher, withFileWriteLock, WatcherHandle } from "./watcher";

export interface ServerWebSocketHandler {
  open: (ws: { send: (data: string) => void }) => void;
  message: (ws: { send: (data: string) => void }, message: string | Buffer | ArrayBuffer) => void;
  close: (ws: { send: (data: string) => void }) => void;
}

export interface ServerOptions {
  port?: number;
  host?: string;
  openBrowser?: boolean;
  projectRoot?: string;
  logs?: boolean;
  verbose?: boolean;
}

export interface ActivityLogEntry {
  id: string;
  timestamp: string;
  category: "task" | "document" | "comment" | "watcher" | "checkpoint";
  action: string;
  actor: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ServerInstance {
  server: unknown;
  port: number;
  host: string;
  url: string;
  broadcast: (event: { type: string; payload: unknown }) => void;
  logActivity?: (entry: Omit<ActivityLogEntry, "id" | "timestamp">) => ActivityLogEntry;
  activityLogs?: ActivityLogEntry[];
  close: () => Promise<void>;
}

// MIME types map
const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".yaml": "text/yaml; charset=utf-8",
  ".yml": "text/yaml; charset=utf-8",
  ".pdf": "application/pdf",
  ".log": "text/plain; charset=utf-8",
};

function formatComment(c: CommentItem) {
  return {
    ...c,
    documentId: c.target_file,
    target_file: c.target_file,
    selectedText: c.anchor?.anchor_text ?? "",
    startLine: c.anchor?.start_line ?? 1,
    endLine: c.anchor?.end_line ?? 1,
    status: c.status === "addressed" ? "resolved" : c.status,
    resolutionNote: c.resolution_note ?? null,
    createdAt: c.created_at || new Date().toISOString(),
  };
}

function json(data: unknown, status: number = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      ...headers,
    },
  });
}

function errorJson(err: unknown, defaultStatus: number = 500): Response {
  if (err instanceof WorkflowRuleError) {
    return json({ code: err.code, error: err.message }, 400);
  }
  const message = err instanceof Error ? err.message : String(err);
  return json({ error: message }, defaultStatus);
}

async function parseBody(req: Request): Promise<any> {
  const text = await req.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export function findTaskAcrossSpecs(projectRoot: string, taskId: string): {
  specId: string;
  tasksDoc: TasksDocument;
  task: TaskItem;
  specDir: string;
} {
  const specs = listSpecs(projectRoot);
  for (const spec of specs) {
    try {
      const tasksDoc = readTasksYaml(projectRoot, spec.id);
      const tasks = flattenTasks(tasksDoc);
      const found = tasks.find((t) => t.id === taskId);
      if (found) {
        const specDir = path.join(getSpecflowDir(projectRoot), "specs", spec.id);
        return { specId: spec.id, tasksDoc, task: found, specDir };
      }
    } catch {
      // ignore specs without valid tasks.yaml
    }
  }
  throw new Error(`Task "${taskId}" not found in any active spec.`);
}

function appendToImplementationLog(specDir: string, message: string): void {
  const logPath = path.join(specDir, "implementation.log");
  const entry = `- [${new Date().toISOString()}] ${message}\n`;
  try {
    fs.appendFileSync(logPath, entry, "utf-8");
  } catch {
    // ignore
  }
}

export function createServer(options: ServerOptions = {}): {
  fetch: (req: Request, server?: { upgrade?: (req: Request, options?: { data?: unknown }) => boolean }) => Promise<Response | undefined> | Response | undefined;
  websocket: ServerWebSocketHandler;
  broadcast: (event: { type: string; payload: unknown }) => void;
  clients: Set<{ send: (data: string) => void; close?: () => void }>;
  logActivity: (entry: Omit<ActivityLogEntry, "id" | "timestamp">) => ActivityLogEntry;
  activityLogs: ActivityLogEntry[];
} {
  const projectRoot = options.projectRoot || findProjectRoot();
  initSpexyWorkspace(projectRoot);

  const bundledStatic = path.resolve(import.meta.dirname, "../static");
  const devStatic = path.resolve(import.meta.dirname, "../../static");
  const staticDir = fs.existsSync(bundledStatic) ? bundledStatic : devStatic;
  const clients = new Set<{ send: (data: string) => void; close?: () => void }>();

  const broadcast = (event: { type: string; payload: unknown }) => {
    const raw = JSON.stringify(event);
    for (const ws of clients) {
      try {
        ws.send(raw);
      } catch {
        clients.delete(ws);
      }
    }
  };

  const activityLogs: ActivityLogEntry[] = [];

  const logActivity = (entry: Omit<ActivityLogEntry, "id" | "timestamp">): ActivityLogEntry => {
    const logEntry: ActivityLogEntry = {
      ...entry,
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
    };
    activityLogs.push(logEntry);
    if (activityLogs.length > 200) {
      activityLogs.shift();
    }
    if (options.logs || options.verbose) {
      const time = new Date().toISOString().substring(11, 19);
      console.log(`[${time}] [${logEntry.category.toUpperCase()}] ${logEntry.message}`);
    }
    broadcast({
      type: "LOG_EVENT",
      payload: logEntry,
    });
    return logEntry;
  };

  const addLog = (category: "task" | "document" | "comment" | "watcher" | "checkpoint", actor: string, message: string) => {
    logActivity({
      category,
      action: category,
      actor,
      message,
    });
  };

  const handleWsMessage = async (ws: { send: (data: string) => void }, rawData: string | Buffer | ArrayBuffer) => {
    try {
      const text = typeof rawData === "string" ? rawData : rawData.toString();
      const message = JSON.parse(text);

      if (message.type === "PING") {
        ws.send(JSON.stringify({ type: "PONG", timestamp: Date.now() }));
        return;
      }

      if (message.type === "TASK_TRANSITION") {
        const { specId, taskId, note, worktree, branch } = message.payload || {};
        let { action, actor = "human" } = message.payload || {};
        const targetStatus = message.payload?.status || message.payload?.target_status || message.payload?.targetStatus;
        if (targetStatus || action === "set_status") {
          action = "set_status";
          actor = "human";
        }
        const doc = readTasksYaml(projectRoot, specId);
        const tasks = flattenTasks(doc);
        const target = tasks.find((t) => t.id === taskId);
        if (!target) {
          ws.send(JSON.stringify({ type: "ERROR", action: "TASK_TRANSITION", error: `Task ${taskId} not found` }));
          return;
        }

        const nextStatus = transitionTask(target.status, action as TaskAction, actor as WorkflowActor, targetStatus);
        const updatedTask: TaskItem = { ...target, status: nextStatus };

        if (action === "claim" || (action === "set_status" && nextStatus === "in-progress")) {
          updatedTask.worktree = worktree || target.worktree;
          updatedTask.branch = branch || target.branch;
          updatedTask.locked_at = new Date().toISOString();
        } else if (action === "submit" && note) {
          updatedTask.notes = { ...target.notes, testing: note };
        } else if (action === "reject" || (action === "set_status" && nextStatus === "todo")) {
          updatedTask.locked_at = null;
          if (note) updatedTask.notes = { ...target.notes, security: note };
        }

        const updatedDoc = updateTaskInDoc(doc, updatedTask);
        const tasksPath = path.join(getSpecflowDir(projectRoot), "specs", specId, "tasks.yaml");

        await withFileWriteLock(tasksPath, () => {
          writeTasksYaml(projectRoot, specId, updatedDoc);
        });

        broadcast({
          type: "TASK_UPDATED",
          payload: { specId, tasks: flattenTasks(updatedDoc) },
        });

        logActivity({
          category: "task",
          action: action as string,
          actor: actor as string,
          message: `Task "${target.title}" (${taskId}) in spec "${specId}" transitioned to ${nextStatus}`,
          details: { specId, taskId, taskTitle: target.title, fromStatus: target.status, toStatus: nextStatus, actor, note },
        });

        ws.send(JSON.stringify({
          type: "ACK",
          action: "TASK_TRANSITION",
          success: true,
          payload: { specId, task: updatedTask },
        }));
        return;
      }

      if (message.type === "COMMENT_CREATE") {
        const payload = message.payload || {};
        const commentsPath = path.join(getSpecflowDir(projectRoot), ".cache", "pending-comments.yaml");
        let newComment: CommentItem | undefined;

        await withFileWriteLock(commentsPath, () => {
          newComment = addComment(projectRoot, {
            id: payload.id,
            target_file: payload.target_file,
            anchor: payload.anchor,
            instruction: payload.instruction,
            author: payload.author || "human",
          });
        });

        if (!newComment) {
          ws.send(JSON.stringify({ type: "ERROR", error: "Failed to create comment" }));
          return;
        }

        broadcast({
          type: "COMMENTS_UPDATED",
          payload: { comments: readPendingCommentsDoc(projectRoot).comments.map(formatComment) },
        });

        logActivity({
          category: "comment",
          action: "create",
          actor: payload.author || "human",
          message: `Created comment on ${payload.target_file}`,
          details: { commentId: (newComment as CommentItem).id, target_file: payload.target_file },
        });

        ws.send(JSON.stringify({
          type: "ACK",
          action: "COMMENT_CREATE",
          success: true,
          payload: { comment: formatComment(newComment) },
        }));
        return;
      }

      if (message.type === "COMMENT_RESOLVE") {
        const { commentId, note = "Resolved", purge = true } = message.payload || {};
        const commentsPath = path.join(getSpecflowDir(projectRoot), ".cache", "pending-comments.yaml");
        let resolved: CommentItem | undefined;

        await withFileWriteLock(commentsPath, () => {
          resolved = resolveComment(projectRoot, commentId, note, { purge });
        });

        if (!resolved) {
          ws.send(JSON.stringify({ type: "ERROR", error: "Failed to resolve comment" }));
          return;
        }

        broadcast({
          type: "COMMENTS_UPDATED",
          payload: { comments: readPendingCommentsDoc(projectRoot).comments.map(formatComment) },
        });

        logActivity({
          category: "comment",
          action: "resolve",
          actor: "human",
          message: `Resolved comment "${commentId}": ${note}`,
          details: { commentId, note },
        });

        ws.send(JSON.stringify({
          type: "ACK",
          action: "COMMENT_RESOLVE",
          success: true,
          payload: { comment: formatComment(resolved) },
        }));
        return;
      }
    } catch (err: unknown) {
      ws.send(JSON.stringify({ type: "ERROR", error: getErrorMessage(err) }));
    }
  };

  const handleFetch = async (req: Request, server?: { upgrade?: (req: Request, options?: { data?: unknown }) => boolean }): Promise<Response | undefined> => {
    const url = new URL(req.url);
    const pathname = url.pathname;
    const method = req.method;

    // CORS preflight
    if (method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    // WebSocket upgrade
    if (pathname === "/ws") {
      if (server && typeof server.upgrade === "function") {
        const upgraded = server.upgrade(req, { data: { id: Math.random().toString(36).substring(2) } });
        if (upgraded) return undefined;
      }
      return new Response("WebSocket upgrade required", { status: 426 });
    }

    // API Routes
    if (pathname.startsWith("/api/")) {
      try {
        // GET /api/status
        if (pathname === "/api/status" && method === "GET") {
          const steering = getSteeringStatus(projectRoot);
          const specs = listSpecs(projectRoot);
          const config = readConfig(projectRoot);
          return json({ steering, specs, config });
        }

        // GET /api/healthz (Dashboard compatibility)
        if (pathname === "/api/healthz" && method === "GET") {
          return json({ status: "ok", timestamp: new Date().toISOString() });
        }

        // GET /api/dashboard (Dashboard compatibility)
        if (pathname === "/api/dashboard" && method === "GET") {
          const steering = getSteeringStatus(projectRoot);
          const specs = listSpecs(projectRoot);
          const comments = listComments(projectRoot, { pendingOnly: true });
          const config = readConfig(projectRoot);

          let todo = 0, inProgress = 0, toReview = 0, done = 0, blocked = 0;
          for (const s of specs) {
            try {
              const doc = readTasksYaml(projectRoot, s.id);
              const allTasks = flattenTasks(doc);
              const statuses: Record<string, TaskStatus> = {};
              for (const t of allTasks) statuses[t.id] = t.status;
              const avail = getTaskAvailability(allTasks, statuses);
              for (const t of allTasks) {
                if (t.status === "done") done++;
                else if (t.status === "in-progress") inProgress++;
                else if (t.status === "to-review") toReview++;
                else if (avail.get(t.id) === "blocked") blocked++;
                else todo++;
              }
            } catch {
              // fallback
            }
          }

          return json({
            projectName: config.project.name || "Spexy Workspace",
            steeringApproved: steering.approved,
            steeringTotal: steering.total,
            steeringApprovedCount: steering.approvedCount,
            featureCount: specs.length,
            reviewQueueCount: toReview,
            openCommentsCount: comments.length,
            taskCounts: { todo, inProgress, toReview, done, blocked },
            recentActivity: activityLogs.length > 0
              ? activityLogs.slice(-10).reverse().map((l) => ({
                  id: l.id,
                  summary: l.message,
                  createdAt: l.timestamp,
                }))
              : [
                  {
                    id: "init-act",
                    summary: `Workspace active for ${config.project.name}`,
                    createdAt: new Date().toISOString(),
                  },
                ],
          });
        }

        // GET /api/steering
        if (pathname === "/api/steering" && method === "GET") {
          const steering = getSteeringStatus(projectRoot);
          return json(steering.documents);
        }

        // GET /api/steering/:id & GET /api/documents/:id
        const steeringIdMatch = pathname.match(/^\/api\/steering\/([^/]+)$/);
        if (steeringIdMatch && method === "GET") {
          const rawId = decodeURIComponent(steeringIdMatch[1]);
          const id = rawId.replace(/^steering-/, "");
          const steering = getSteeringStatus(projectRoot);
          const doc = steering.documents.find((d) => d.id === id || d.filename === id || d.id === rawId);
          if (!doc) {
            return json({ error: `Steering document "${rawId}" not found` }, 404);
          }
          const { frontmatter, body } = parseDocumentFrontmatter(doc.content);
          return json({
            ...doc,
            frontmatter,
            body,
          });
        }

        // PUT /api/steering/:id & PUT /api/documents/:id
        const docUpdateMatch = pathname.match(/^\/api\/(?:steering|documents)\/([^/]+)$/);
        if (docUpdateMatch && method === "PUT") {
          const rawId = decodeURIComponent(docUpdateMatch[1]);
          const id = rawId.replace(/^steering-/, "");
          const reqBody = await parseBody(req);
          const data = reqBody.data || reqBody;
          const actor = data.actor || reqBody.actor || "human";
          const newContentOrBody = data.content ?? data.body ?? "";
          const newFrontmatter = data.frontmatter;

          const steering = getSteeringStatus(projectRoot);
          const doc = steering.documents.find((d) => d.id === id || d.filename === id || d.id === rawId);
          if (doc) {
            const fullPath = path.join(getSpecflowDir(projectRoot), "steering", doc.filename);
            await withFileWriteLock(fullPath, () => {
              updateSteeringDocument(projectRoot, doc.filename, newContentOrBody, newFrontmatter, actor);
            });

            broadcast({
              type: "DOC_UPDATED",
              payload: { file: path.relative(projectRoot, fullPath) },
            });

            logActivity({
              category: "document",
              action: "save",
              actor,
              message: `Updated document "${rawId}"`,
              details: { id: rawId, actor },
            });

            const updatedSteering = getSteeringStatus(projectRoot);
            const updatedDoc = updatedSteering.documents.find((d) => d.id === doc.id);
            return json({
              id: rawId,
              title: updatedDoc?.title || doc.title,
              path: updatedDoc?.relativePath || doc.relativePath,
              status: updatedDoc?.status || "in-review",
              content: newContentOrBody,
              revision: (data.expectedRevision || 1) + 1,
              success: true,
              document: updatedDoc,
            });
          }

          if (rawId.includes(":")) {
            const [specId, kind] = rawId.split(":");
            const filename = kind === "requirements" ? "requirements.md" : "design.md";
            const fullPath = path.join(getSpecflowDir(projectRoot), "specs", specId, filename);
            if (fs.existsSync(fullPath)) {
              await withFileWriteLock(fullPath, () => {
                fs.writeFileSync(fullPath, newContentOrBody, "utf-8");
              });
              broadcast({
                type: "DOC_UPDATED",
                payload: { file: path.relative(projectRoot, fullPath) },
              });
              logActivity({
                category: "document",
                action: "save",
                actor,
                message: `Updated document "${rawId}"`,
                details: { id: rawId, actor },
              });
              return json({
                id: rawId,
                title: `${specId} ${kind}`,
                path: path.relative(projectRoot, fullPath),
                status: "in-review",
                content: newContentOrBody,
                revision: (data.expectedRevision || 1) + 1,
                success: true,
              });
            }
          }

          return json({ error: `Document "${rawId}" not found` }, 404);
        }

        // POST /api/steering/:id/approve & POST /api/documents/:id/approve
        const docApproveMatch = pathname.match(/^\/api\/(?:steering|documents)\/([^/]+)\/approve$/);
        if (docApproveMatch && method === "POST") {
          const rawId = decodeURIComponent(docApproveMatch[1]);
          const id = rawId.replace(/^steering-/, "");
          const steering = getSteeringStatus(projectRoot);
          const doc = steering.documents.find((d) => d.id === id || d.filename === id || d.id === rawId);
          if (doc) {
            const fullPath = path.join(getSpecflowDir(projectRoot), "steering", doc.filename);
            const { body } = parseDocumentFrontmatter(doc.content);

            await withFileWriteLock(fullPath, () => {
              updateSteeringDocument(
                projectRoot,
                doc.filename,
                body,
                { status: "approved", approved_by: "human" },
                "human",
              );
            });

            broadcast({
              type: "DOC_UPDATED",
              payload: { file: path.relative(projectRoot, fullPath) },
            });

            logActivity({
              category: "document",
              action: "approve",
              actor: "human",
              message: `Approved document "${rawId}"`,
              details: { id: rawId, actor: "human" },
            });

            return json({
              id: rawId,
              status: "approved",
              approvedBy: "human",
              approved_by: "human",
              success: true,
            });
          }

          if (rawId.includes(":")) {
            const [specId, kind] = rawId.split(":");
            const filename = kind === "requirements" ? "requirements.md" : "design.md";
            const fullPath = path.join(getSpecflowDir(projectRoot), "specs", specId, filename);
            if (fs.existsSync(fullPath)) {
              const raw = fs.readFileSync(fullPath, "utf-8");
              const { body } = parseDocumentFrontmatter(raw);
              const updated = serializeDocumentWithFrontmatter(
                { status: "approved", updated_at: new Date().toISOString(), approved_by: "human" },
                body,
              );
              await withFileWriteLock(fullPath, () => {
                fs.writeFileSync(fullPath, updated, "utf-8");
              });
              broadcast({
                type: "DOC_UPDATED",
                payload: { file: path.relative(projectRoot, fullPath) },
              });
              logActivity({
                category: "document",
                action: "approve",
                actor: "human",
                message: `Approved document "${rawId}"`,
                details: { id: rawId, actor: "human" },
              });
              return json({
                id: rawId,
                status: "approved",
                approvedBy: "human",
                approved_by: "human",
                success: true,
              });
            }
          }

          return json({ error: `Document "${rawId}" not found for approval` }, 404);
        }

        // GET /api/specs & GET /api/features
        if ((pathname === "/api/specs" || pathname === "/api/features") && method === "GET") {
          const specs = listSpecs(projectRoot);
          return json(specs);
        }

        // POST /api/specs & POST /api/features
        if ((pathname === "/api/specs" || pathname === "/api/features") && method === "POST") {
          const reqBody = await parseBody(req);
          const specId = reqBody.id;
          if (!specId) {
            return json({ error: "Missing required 'id'" }, 400);
          }
          const title = reqBody.title || reqBody.name || specId.replace(/-/g, " ");

          const specDir = path.join(getSpecflowDir(projectRoot), "specs", specId);
          await withFileWriteLock(specDir, () => {
            createSpec(projectRoot, specId, { force: reqBody.force, title });
          });

          broadcast({
            type: "DOC_UPDATED",
            payload: { file: path.relative(projectRoot, path.join(specDir, "tasks.yaml")) },
          });

          return json({ success: true, id: specId, title }, 201);
        }

        // GET /api/tasks & GET /api/specs/all/tasks & GET /api/features/all/tasks
        if (
          (pathname === "/api/tasks" ||
            pathname === "/api/specs/all/tasks" ||
            pathname === "/api/features/all/tasks") &&
          method === "GET"
        ) {
          const allTasks: Array<TaskItem & { spec_id: string; specId: string; availability: string; blockers: string[] }> = [];
          const specs = listSpecs(projectRoot);
          for (const spec of specs) {
            try {
              const doc = readTasksYaml(projectRoot, spec.id);
              const tasks = flattenTasks(doc);
              validateTaskGraph(tasks);

              const statuses: Record<string, TaskStatus> = {};
              for (const t of tasks) statuses[t.id] = t.status;

              const availabilityMap = getTaskAvailability(tasks, statuses);
              const blockers: Record<string, string[]> = {};
              for (const t of tasks) {
                blockers[t.id] = getBlockingDependencies(t.id, tasks, statuses);
              }

              for (const t of tasks) {
                allTasks.push({
                  ...t,
                  spec_id: spec.id,
                  specId: spec.id,
                  availability: availabilityMap.get(t.id) ?? t.status,
                  blockers: blockers[t.id] ?? [],
                });
              }
            } catch {
              // Ignore specs without tasks or invalid tasks.yaml
            }
          }

          if (url.searchParams.get("format") === "array") {
            return json(allTasks);
          }

          return json({
            tasks: allTasks,
            total: allTasks.length,
          });
        }

        // POST /api/tasks/:taskId/transition & POST /api/specs/all/tasks/:taskId/transition & POST /api/features/all/tasks/:taskId/transition
        const globalTaskTransitionMatch = pathname.match(
          /^\/api\/(?:tasks|(?:specs|features)\/all\/tasks)\/([^/]+)\/transition$/,
        );
        if (globalTaskTransitionMatch && method === "POST") {
          const taskId = decodeURIComponent(globalTaskTransitionMatch[1]);
          const reqBody = await parseBody(req);

          let action = reqBody.action as TaskAction;
          const targetStatus = reqBody.status || reqBody.target_status || reqBody.targetStatus;
          if (targetStatus || action === "set_status") {
            action = "set_status";
          }

          if (!action) {
            return json({ error: "Missing required 'action'" }, 400);
          }

          let actor = reqBody.actor as WorkflowActor;
          if (!actor) {
            actor = action === "approve" || action === "reject" || action === "set_status" ? "human" : "agent";
          }

          let taskLocation: { specId: string; tasksDoc: TasksDocument; task: TaskItem; specDir: string };
          try {
            taskLocation = findTaskAcrossSpecs(projectRoot, taskId);
          } catch (err: unknown) {
            return json({ error: getErrorMessage(err) }, 404);
          }

          const { specId, tasksDoc: doc, task: target } = taskLocation;

          let nextStatus: TaskStatus;
          try {
            nextStatus = transitionTask(target.status, action, actor, targetStatus);
          } catch (err: unknown) {
            const code = err instanceof WorkflowRuleError ? err.code : undefined;
            return json({ error: getErrorMessage(err), code }, 400);
          }

          const updatedTask: TaskItem = { ...target, status: nextStatus };

          if (action === "claim" || (action === "set_status" && nextStatus === "in-progress")) {
            updatedTask.worktree = reqBody.worktree || target.worktree;
            updatedTask.branch = reqBody.branch || target.branch;
            updatedTask.locked_at = new Date().toISOString();
          } else if (action === "submit") {
            if (reqBody.note) {
              updatedTask.notes = { ...target.notes, testing: reqBody.note };
            }
          } else if (action === "reject" || (action === "set_status" && nextStatus === "todo")) {
            updatedTask.locked_at = null;
            if (reqBody.note) {
              updatedTask.notes = { ...target.notes, security: reqBody.note };
            }
          }

          const updatedDoc = updateTaskInDoc(doc, updatedTask);
          const tasksPath = path.join(getSpecflowDir(projectRoot), "specs", specId, "tasks.yaml");

          await withFileWriteLock(tasksPath, () => {
            writeTasksYaml(projectRoot, specId, updatedDoc);
          });

          const specDir = path.join(getSpecflowDir(projectRoot), "specs", specId);
          let logMsg = `Task ${taskId} status transitioned to ${nextStatus} by ${actor}.`;
          if (action === "claim") {
            logMsg = `Task ${taskId} claimed by ${updatedTask.worktree ? `worktree "${updatedTask.worktree}"` : actor}. Status: in-progress.`;
          } else if (action === "submit") {
            logMsg = `Task ${taskId} submitted for review by ${actor}. Status: to-review.${reqBody.note ? ` Note: ${reqBody.note}` : ""}`;
          } else if (action === "approve") {
            logMsg = `Task ${taskId} verified and approved by ${actor}. Status: done.${reqBody.note ? ` Note: ${reqBody.note}` : ""}`;
          } else if (action === "reject") {
            logMsg = `Task ${taskId} changes requested by ${actor}. Status: todo.${reqBody.note ? ` Note: ${reqBody.note}` : ""}`;
          }
          appendToImplementationLog(specDir, logMsg);

          logActivity({
            category: "task",
            action,
            actor,
            message: `Task "${target.title}" (${taskId}) in spec "${specId}" transitioned to ${nextStatus}`,
            details: {
              specId,
              taskId,
              taskTitle: target.title,
              fromStatus: target.status,
              toStatus: nextStatus,
              actor,
              note: reqBody.note,
            },
          });

          broadcast({
            type: "TASK_UPDATED",
            payload: { specId, tasks: flattenTasks(updatedDoc) },
          });

          return json({ success: true, task: updatedTask });
        }

        // GET /api/specs/:id/tasks & GET /api/features/:id/tasks
        const specTasksMatch = pathname.match(/^\/api\/(?:specs|features)\/([^/]+)\/tasks$/);
        if (specTasksMatch && method === "GET") {
          const specId = decodeURIComponent(specTasksMatch[1]);
          const doc = readTasksYaml(projectRoot, specId);
          const tasks = flattenTasks(doc);
          validateTaskGraph(tasks);

          const statuses: Record<string, TaskStatus> = {};
          for (const t of tasks) statuses[t.id] = t.status;

          const availabilityMap = getTaskAvailability(tasks, statuses);
          const availability: Record<string, string> = Object.fromEntries(availabilityMap.entries());

          const blockers: Record<string, string[]> = {};
          for (const t of tasks) {
            blockers[t.id] = getBlockingDependencies(t.id, tasks, statuses);
          }

          const enrichedTasks = tasks.map((t) => ({
            ...t,
            availability: availabilityMap.get(t.id) ?? t.status,
            blockers: blockers[t.id] ?? [],
          }));

          if (url.searchParams.get("format") === "array") {
            return json(enrichedTasks);
          }

          return json({
            tasks: enrichedTasks,
            availability,
            blockers,
            dependency_graph: doc.dependency_graph,
            notes: doc.notes,
          });
        }

        // POST /api/specs/:id/tasks (Create task in spec)
        if (specTasksMatch && method === "POST") {
          const specId = decodeURIComponent(specTasksMatch[1]);
          const reqBody = await parseBody(req);
          const doc = readTasksYaml(projectRoot, specId);

          const newTask: TaskItem = {
            id: reqBody.id || `task-${Date.now()}`,
            parent_id: reqBody.parentId || reqBody.parent_id || null,
            title: reqBody.title || "Untitled Task",
            description: reqBody.description || "",
            status: "todo",
            priority: reqBody.priority || "medium",
            depends_on: reqBody.dependsOn || reqBody.depends_on || [],
            worktree: null,
            branch: reqBody.branch || `feature/${specId}/${reqBody.id || "task"}`,
            commit_pattern: reqBody.commit_pattern || reqBody.commitPattern || null,
            locked_at: null,
            files: reqBody.files || [],
            leverage: reqBody.leverage || "",
            requirements_ref: reqBody.requirementsRef || reqBody.requirements_ref || [],
            notes: { security: null, testing: null },
          };

          const updatedDoc = updateTaskInDoc(doc, newTask);
          const tasksPath = path.join(getSpecflowDir(projectRoot), "specs", specId, "tasks.yaml");

          await withFileWriteLock(tasksPath, () => {
            writeTasksYaml(projectRoot, specId, updatedDoc);
          });

          const specDir = path.join(getSpecflowDir(projectRoot), "specs", specId);
          appendToImplementationLog(specDir, `Task ${newTask.id} created ("${newTask.title}"). Status: todo.`);

          logActivity({
            category: "task",
            action: "create",
            actor: "human",
            message: `Task "${newTask.title}" (${newTask.id}) created in spec "${specId}"`,
            details: { specId, taskId: newTask.id, taskTitle: newTask.title, actor: "human" },
          });

          broadcast({
            type: "TASK_UPDATED",
            payload: { specId, tasks: flattenTasks(updatedDoc) },
          });

          return json(newTask, 201);
        }

        // POST /api/specs/:id/tasks/:taskId/transition
        const taskTransitionMatch = pathname.match(/^\/api\/(?:specs|features)\/([^/]+)\/tasks\/([^/]+)\/transition$/);
        if (taskTransitionMatch && method === "POST") {
          const specId = decodeURIComponent(taskTransitionMatch[1]);
          const taskId = decodeURIComponent(taskTransitionMatch[2]);
          const reqBody = await parseBody(req);

          let action = reqBody.action as TaskAction;
          const targetStatus = reqBody.status || reqBody.target_status || reqBody.targetStatus;
          if (targetStatus || action === "set_status") {
            action = "set_status";
          }

          if (!action) {
            return json({ error: "Missing required 'action'" }, 400);
          }

          let actor = reqBody.actor as WorkflowActor;
          if (!actor) {
            actor = action === "approve" || action === "reject" || action === "set_status" ? "human" : "agent";
          }

          const doc = readTasksYaml(projectRoot, specId);
          const tasks = flattenTasks(doc);
          const target = tasks.find((t) => t.id === taskId);
          if (!target) {
            return json({ error: `Task "${taskId}" not found in spec "${specId}"` }, 404);
          }

          let nextStatus: TaskStatus;
          try {
            nextStatus = transitionTask(target.status, action, actor, targetStatus);
          } catch (err: unknown) {
            const code = err instanceof WorkflowRuleError ? err.code : undefined;
            return json({ error: getErrorMessage(err), code }, 400);
          }

          const updatedTask: TaskItem = { ...target, status: nextStatus };

          if (action === "claim" || (action === "set_status" && nextStatus === "in-progress")) {
            updatedTask.worktree = reqBody.worktree || target.worktree;
            updatedTask.branch = reqBody.branch || target.branch;
            updatedTask.locked_at = new Date().toISOString();
          } else if (action === "submit") {
            if (reqBody.note) {
              updatedTask.notes = { ...target.notes, testing: reqBody.note };
            }
          } else if (action === "reject" || (action === "set_status" && nextStatus === "todo")) {
            updatedTask.locked_at = null;
            if (reqBody.note) {
              updatedTask.notes = { ...target.notes, security: reqBody.note };
            }
          }

          const updatedDoc = updateTaskInDoc(doc, updatedTask);
          const tasksPath = path.join(getSpecflowDir(projectRoot), "specs", specId, "tasks.yaml");

          await withFileWriteLock(tasksPath, () => {
            writeTasksYaml(projectRoot, specId, updatedDoc);
          });

          const specDir = path.join(getSpecflowDir(projectRoot), "specs", specId);
          let logMsg = `Task ${taskId} status transitioned to ${nextStatus} by ${actor}.`;
          if (action === "claim") {
            logMsg = `Task ${taskId} claimed by ${updatedTask.worktree ? `worktree "${updatedTask.worktree}"` : actor}. Status: in-progress.`;
          } else if (action === "submit") {
            logMsg = `Task ${taskId} submitted for review by ${actor}. Status: to-review.${reqBody.note ? ` Note: ${reqBody.note}` : ""}`;
          } else if (action === "approve") {
            logMsg = `Task ${taskId} verified and approved by ${actor}. Status: done.${reqBody.note ? ` Note: ${reqBody.note}` : ""}`;
          } else if (action === "reject") {
            logMsg = `Task ${taskId} changes requested by ${actor}. Status: todo.${reqBody.note ? ` Note: ${reqBody.note}` : ""}`;
          }
          appendToImplementationLog(specDir, logMsg);

          logActivity({
            category: "task",
            action,
            actor,
            message: `Task "${target.title}" (${taskId}) in spec "${specId}" transitioned to ${nextStatus}`,
            details: {
              specId,
              taskId,
              taskTitle: target.title,
              fromStatus: target.status,
              toStatus: nextStatus,
              actor,
              note: reqBody.note,
            },
          });

          broadcast({
            type: "TASK_UPDATED",
            payload: { specId, tasks: flattenTasks(updatedDoc) },
          });

          return json({ success: true, task: updatedTask });
        }

        // GET /api/specs/:id/files & GET /api/features/:id/files
        const specFilesMatch = pathname.match(/^\/api\/(?:specs|features)\/([^/]+)\/files$/);
        if (specFilesMatch && method === "GET") {
          const specId = decodeURIComponent(specFilesMatch[1]);
          try {
            const files = listSpecFiles(projectRoot, specId);
            return json({ files: files || [] });
          } catch {
            return json({ files: [] }, 200);
          }
        }

        // GET /api/specs/:id/files/:filename+ & GET /api/features/:id/files/:filename+
        const specFileContentMatch = pathname.match(/^\/api\/(?:specs|features)\/([^/]+)\/files\/(.+)$/);
        if (specFileContentMatch && (method === "GET" || method === "HEAD")) {
          const specId = decodeURIComponent(specFileContentMatch[1]);
          const filename = decodeURIComponent(specFileContentMatch[2]);
          const specsDir = path.resolve(getSpecflowDir(projectRoot), "specs");
          const specDir = path.resolve(specsDir, specId);
          const targetFile = path.resolve(specDir, filename);

          // Path security check: must resolve within .spexy/specs/{specId}
          if (!targetFile.startsWith(specDir) || !fs.existsSync(targetFile) || !fs.statSync(targetFile).isFile()) {
            return json({ error: `File not found or access denied: ${filename}` }, 404);
          }

          const ext = path.extname(targetFile).toLowerCase();
          const contentType = MIME_TYPES[ext] || "application/octet-stream";

          const content = fs.readFileSync(targetFile);
          return new Response(content, {
            headers: {
              "Content-Type": contentType,
              "Access-Control-Allow-Origin": "*",
            },
          });
        }

        // GET /api/files/raw?path=... (Direct file view/download for attached documents)
        if (pathname === "/api/files/raw" && (method === "GET" || method === "HEAD")) {
          const rawRelPath = url.searchParams.get("path");
          if (!rawRelPath) {
            return json({ error: "Missing 'path' query parameter" }, 400);
          }
          const targetFile = path.resolve(projectRoot, rawRelPath);
          if (!targetFile.startsWith(path.resolve(projectRoot)) || !fs.existsSync(targetFile) || !fs.statSync(targetFile).isFile()) {
            return json({ error: `File not found or access denied: ${rawRelPath}` }, 404);
          }

          const ext = path.extname(targetFile).toLowerCase();
          const contentType = MIME_TYPES[ext] || "application/octet-stream";
          const content = fs.readFileSync(targetFile);
          return new Response(content, {
            headers: {
              "Content-Type": contentType,
              "Access-Control-Allow-Origin": "*",
            },
          });
        }

        // POST /api/upload (General upload for steering docs, specs, comments)
        if (pathname === "/api/upload" && method === "POST") {
          let filename = "";
          let fileBuffer: Buffer | null = null;
          let target = "temp";
          let specId = "";
          let documentId = "";

          const contentType = req.headers.get("content-type") || "";
          if (contentType.includes("multipart/form-data")) {
            const formData = await req.formData();
            const file = formData.get("file") as File | null;
            if (!file) {
              return json({ error: "Missing 'file' form data" }, 400);
            }
            filename = (formData.get("filename")?.toString() || file.name).replace(/[^a-zA-Z0-9._-]/g, "_");
            target = (formData.get("target")?.toString() || "temp").toLowerCase();
            specId = formData.get("specId")?.toString() || "";
            documentId = formData.get("documentId")?.toString() || "";
            fileBuffer = Buffer.from(await file.arrayBuffer());
          } else {
            const body = await parseBody(req);
            if (!body.filename || !body.content) {
              return json({ error: "Missing required 'filename' or 'content'" }, 400);
            }
            filename = body.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
            target = (body.target || "temp").toLowerCase();
            specId = body.specId || "";
            documentId = body.documentId || "";
            const encoding = body.encoding === "base64" ? "base64" : "utf-8";
            fileBuffer = Buffer.from(body.content, encoding);
          }

          // Determine target directory
          let baseDir = path.join(getSpecflowDir(projectRoot), "steering");
          if (specId) {
            baseDir = path.join(getSpecflowDir(projectRoot), "specs", specId);
          } else if (documentId && documentId.includes(":")) {
            const extractedSpec = documentId.split(":")[0];
            const candidate = path.join(getSpecflowDir(projectRoot), "specs", extractedSpec);
            if (fs.existsSync(candidate)) {
              baseDir = candidate;
            }
          }

          const subDir = target === "references" ? "references" : target === "images" ? "images" : ".temp";
          const destDir = path.join(baseDir, subDir);
          fs.mkdirSync(destDir, { recursive: true });

          const destPath = path.join(destDir, filename);
          fs.writeFileSync(destPath, fileBuffer);

          const relPath = path.relative(projectRoot, destPath).split(path.sep).join("/");
          logActivity({
            category: "document",
            action: "upload",
            actor: "human",
            message: `Uploaded file ${filename} (${subDir})`,
            details: { filename, target: subDir, path: relPath },
          });

          return json({
            success: true,
            filename,
            path: relPath,
            is_temp: subDir === ".temp",
            target: subDir,
          });
        }

        // POST /api/preserve-file (General preserve for temporary files)
        if (pathname === "/api/preserve-file" && method === "POST") {
          const body = await parseBody(req);
          const filename = body.filename;
          const filepath = body.filepath || body.path;
          const targetDir = body.target_dir === "images" ? "images" : "references";

          let tempFile = filepath ? path.resolve(projectRoot, filepath) : "";
          if (!tempFile || !fs.existsSync(tempFile)) {
            const sfDir = getSpecflowDir(projectRoot);
            const candidates = [
              path.join(sfDir, "steering", ".temp", filename),
              path.join(sfDir, ".temp", filename),
            ];
            const specsDir = path.join(sfDir, "specs");
            if (fs.existsSync(specsDir)) {
              for (const s of fs.readdirSync(specsDir)) {
                candidates.push(path.join(specsDir, s, ".temp", filename));
              }
            }
            tempFile = candidates.find((c) => fs.existsSync(c)) || "";
          }

          if (!tempFile || !fs.existsSync(tempFile)) {
            return json({ error: `Temporary file not found: ${filename}` }, 404);
          }

          const parentDir = path.dirname(path.dirname(tempFile));
          const targetFolder = path.join(parentDir, targetDir);
          fs.mkdirSync(targetFolder, { recursive: true });
          const targetPath = path.join(targetFolder, filename);
          fs.renameSync(tempFile, targetPath);

          try {
            const commentsDoc = readPendingCommentsDoc(projectRoot);
            let changed = false;
            for (const c of commentsDoc.comments) {
              if (c.attachments) {
                for (const a of c.attachments) {
                  if (a.name === filename || a.path.includes(filename)) {
                    a.path = path.relative(projectRoot, targetPath).split(path.sep).join("/");
                    a.is_temp = false;
                    changed = true;
                  }
                }
              }
            }
            if (changed) {
              writePendingCommentsDoc(projectRoot, commentsDoc);
              broadcast({ type: "COMMENTS_UPDATED", payload: {} });
            }
          } catch {}

          const relPath = path.relative(projectRoot, targetPath).split(path.sep).join("/");
          return json({ success: true, filename, path: relPath, target: targetDir });
        }

        // POST /api/specs/:id/upload & POST /api/features/:id/upload
        const specUploadMatch = pathname.match(/^\/api\/(?:specs|features)\/([^/]+)\/upload$/);
        if (specUploadMatch && method === "POST") {
          const specId = decodeURIComponent(specUploadMatch[1]);
          const specDir = path.resolve(getSpecflowDir(projectRoot), "specs", specId);
          if (!fs.existsSync(specDir)) {
            return json({ error: `Spec "${specId}" not found` }, 404);
          }

          let filename = "";
          let fileBuffer: Buffer | null = null;
          let target = "temp";

          const contentType = req.headers.get("content-type") || "";
          if (contentType.includes("multipart/form-data")) {
            const formData = await req.formData();
            const file = formData.get("file") as File | null;
            if (!file) {
              return json({ error: "Missing 'file' form data" }, 400);
            }
            filename = (formData.get("filename")?.toString() || file.name).replace(/[^a-zA-Z0-9._-]/g, "_");
            target = (formData.get("target")?.toString() || "temp").toLowerCase();
            fileBuffer = Buffer.from(await file.arrayBuffer());
          } else {
            const body = await parseBody(req);
            if (!body.filename || !body.content) {
              return json({ error: "Missing required 'filename' or 'content'" }, 400);
            }
            filename = body.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
            target = (body.target || "temp").toLowerCase();
            const encoding = body.encoding === "base64" ? "base64" : "utf-8";
            fileBuffer = Buffer.from(body.content, encoding);
          }

          const subDir = target === "references" ? "references" : target === "images" ? "images" : ".temp";
          const destDir = path.join(specDir, subDir);
          fs.mkdirSync(destDir, { recursive: true });

          const destPath = path.join(destDir, filename);
          fs.writeFileSync(destPath, fileBuffer);

          const relPath = path.relative(projectRoot, destPath).split(path.sep).join("/");
          logActivity({
            category: "document",
            action: "upload",
            actor: "human",
            message: `Uploaded file ${filename} to spec "${specId}" (${subDir})`,
            details: { specId, filename, target: subDir, path: relPath },
          });

          broadcast({
            type: "SPEC_FILES_UPDATED",
            payload: { specId, filename, path: relPath },
          });

          return json({
            success: true,
            filename,
            path: relPath,
            is_temp: subDir === ".temp",
            target: subDir,
          });
        }

        // POST /api/specs/:id/preserve-file & POST /api/features/:id/preserve-file
        const specPreserveMatch = pathname.match(/^\/api\/(?:specs|features)\/([^/]+)\/preserve-file$/);
        if (specPreserveMatch && method === "POST") {
          const specId = decodeURIComponent(specPreserveMatch[1]);
          const specDir = path.resolve(getSpecflowDir(projectRoot), "specs", specId);
          if (!fs.existsSync(specDir)) {
            return json({ error: `Spec "${specId}" not found` }, 404);
          }

          const body = await parseBody(req);
          const filename = body.filename?.replace(/[^a-zA-Z0-9._-]/g, "_");
          if (!filename) {
            return json({ error: "Missing required 'filename'" }, 400);
          }

          const tempFilePath = path.join(specDir, ".temp", filename);
          if (!fs.existsSync(tempFilePath)) {
            return json({ error: `Temporary file "${filename}" not found in .temp` }, 404);
          }

          const ext = path.extname(filename).toLowerCase();
          const isImg = [".png", ".jpg", ".jpeg", ".svg", ".gif", ".webp"].includes(ext);
          const targetDir = body.target === "images" || (isImg && body.target !== "references") ? "images" : "references";
          const targetPath = path.join(specDir, targetDir, filename);
          fs.mkdirSync(path.join(specDir, targetDir), { recursive: true });

          fs.renameSync(tempFilePath, targetPath);

          // If referenced in pending comments, update their path
          try {
            const commentsDoc = readPendingCommentsDoc(projectRoot);
            let changed = false;
            for (const c of commentsDoc.comments) {
              if (c.attachments) {
                for (const a of c.attachments) {
                  if (a.name === filename || a.path.includes(filename)) {
                    a.path = path.relative(projectRoot, targetPath).split(path.sep).join("/");
                    a.is_temp = false;
                    changed = true;
                  }
                }
              }
            }
            if (changed) {
              writePendingCommentsDoc(projectRoot, commentsDoc);
              broadcast({ type: "COMMENTS_UPDATED", payload: {} });
            }
          } catch {}

          const relPath = path.relative(projectRoot, targetPath).split(path.sep).join("/");
          logActivity({
            category: "document",
            action: "preserve",
            actor: "human",
            message: `Preserved temporary file ${filename} to ${targetDir} in spec "${specId}"`,
            details: { specId, filename, target: targetDir, path: relPath },
          });

          broadcast({
            type: "SPEC_FILES_UPDATED",
            payload: { specId, filename, path: relPath },
          });

          return json({
            success: true,
            filename,
            path: relPath,
            target: targetDir,
            is_temp: false,
          });
        }

        // Compatibility endpoints for UI: claim, submit, review
        const taskActionMatch = pathname.match(
          /^\/api\/(?:specs|features)\/([^/]+)\/tasks\/([^/]+)\/(claim|submit|review)$/,
        );
        if (taskActionMatch && method === "POST") {
          const specId = decodeURIComponent(taskActionMatch[1]);
          const taskId = decodeURIComponent(taskActionMatch[2]);
          const subAction = taskActionMatch[3];
          const reqBody = await parseBody(req);

          let action: TaskAction = "claim";
          let actor: WorkflowActor = "agent";
          const targetStatus = reqBody.status || reqBody.target_status || reqBody.targetStatus;

          if (subAction === "claim") {
            action = "claim";
            actor = "agent";
          } else if (subAction === "submit") {
            action = "submit";
            actor = "agent";
          } else if (subAction === "review") {
            actor = (reqBody.actor as WorkflowActor) || "human";
            if (targetStatus || reqBody.action === "set_status") {
              action = "set_status";
            } else {
              action = reqBody.decision === "approve" ? "approve" : "reject";
            }
          }

          const doc = readTasksYaml(projectRoot, specId);
          const tasks = flattenTasks(doc);
          const target = tasks.find((t) => t.id === taskId);
          if (!target) {
            return json({ error: `Task "${taskId}" not found` }, 404);
          }

          let nextStatus: TaskStatus;
          try {
            nextStatus = transitionTask(target.status, action, actor, targetStatus);
          } catch (err: unknown) {
            const code = err instanceof WorkflowRuleError ? err.code : undefined;
            return json({ error: getErrorMessage(err), code }, 400);
          }

          const updatedTask: TaskItem = { ...target, status: nextStatus };

          if (action === "claim" || (action === "set_status" && nextStatus === "in-progress")) {
            updatedTask.worktree = reqBody.worktree || target.worktree;
            updatedTask.branch = reqBody.branch || target.branch;
            updatedTask.locked_at = new Date().toISOString();
          } else if (action === "submit" && reqBody.note) {
            updatedTask.notes = { ...target.notes, testing: reqBody.note };
          } else if (action === "reject" || (action === "set_status" && nextStatus === "todo")) {
            updatedTask.locked_at = null;
            if (reqBody.note) {
              updatedTask.notes = { ...target.notes, security: reqBody.note };
            }
          }

          const updatedDoc = updateTaskInDoc(doc, updatedTask);
          const tasksPath = path.join(getSpecflowDir(projectRoot), "specs", specId, "tasks.yaml");

          await withFileWriteLock(tasksPath, () => {
            writeTasksYaml(projectRoot, specId, updatedDoc);
          });

          const specDir = path.join(getSpecflowDir(projectRoot), "specs", specId);
          let logMsg = `Task ${taskId} status transitioned to ${nextStatus} by ${actor}.`;
          if (action === "claim") {
            logMsg = `Task ${taskId} claimed by ${updatedTask.worktree ? `worktree "${updatedTask.worktree}"` : actor}. Status: in-progress.`;
          } else if (action === "submit") {
            logMsg = `Task ${taskId} submitted for review by ${actor}. Status: to-review.${reqBody.note ? ` Note: ${reqBody.note}` : ""}`;
          } else if (action === "approve") {
            logMsg = `Task ${taskId} verified and approved by ${actor}. Status: done.${reqBody.note ? ` Note: ${reqBody.note}` : ""}`;
          } else if (action === "reject") {
            logMsg = `Task ${taskId} changes requested by ${actor}. Status: todo.${reqBody.note ? ` Note: ${reqBody.note}` : ""}`;
          }
          appendToImplementationLog(specDir, logMsg);

          const allTasksInDoc = flattenTasks(updatedDoc);
          const statuses: Record<string, TaskStatus> = {};
          for (const t of allTasksInDoc) statuses[t.id] = t.status;
          const availabilityMap = getTaskAvailability(allTasksInDoc, statuses);

          logActivity({
            category: "task",
            action,
            actor,
            message: `Task "${target.title}" (${taskId}) in spec "${specId}" transitioned to ${nextStatus}`,
            details: {
              specId,
              taskId,
              taskTitle: target.title,
              fromStatus: target.status,
              toStatus: nextStatus,
              actor,
              note: reqBody.note,
            },
          });

          broadcast({
            type: "TASK_UPDATED",
            payload: { specId, tasks: allTasksInDoc },
          });

          return json({
            success: true,
            task: {
              ...updatedTask,
              availability: availabilityMap.get(updatedTask.id) ?? updatedTask.status,
            },
          });
        }

        // GET /api/comments
        if (pathname === "/api/comments" && method === "GET") {
          const target_file = url.searchParams.get("target_file") || undefined;
          const target_type = url.searchParams.get("target_type") || undefined;
          const target_id = url.searchParams.get("target_id") || undefined;
          const pendingOnly = url.searchParams.get("pendingOnly") === "true";
          const comments = listComments(projectRoot, { target_file, target_type, target_id, pendingOnly });
          return json(comments.map(formatComment));
        }

        // POST /api/comments
        if (pathname === "/api/comments" && method === "POST") {
          const reqBody = await parseBody(req);
          const data = reqBody.data || reqBody;
          const target_type = data.target_type || (data.target_id ? "task" : (data.target_file || data.documentId) ? "document" : "general");
          const target_file = data.target_file || data.documentId || (target_type === "general" ? "general" : "");
          const instruction = data.instruction;
          const anchor = data.anchor
            ? data.anchor
            : (data.selectedText || data.startLine || data.endLine)
            ? {
                start_line: Number(data.startLine) || Number(data.start_line) || 1,
                end_line: Number(data.endLine) || Number(data.end_line) || 1,
                anchor_text: data.selectedText || data.anchor_text || "",
                context_before: data.contextBefore || data.context_before || "",
              }
            : null;

          if (!instruction || !String(instruction).trim()) {
            return json({ error: "Missing required field (instruction)" }, 400);
          }

          const commentsPath = path.join(getSpecflowDir(projectRoot), ".cache", "pending-comments.yaml");
          let newComment: CommentItem | undefined;

          await withFileWriteLock(commentsPath, () => {
            newComment = addComment(projectRoot, {
              id: data.id,
              target_file,
              target_type,
              target_id: data.target_id || null,
              anchor,
              instruction: String(instruction).trim(),
              author: data.author || "human",
              attachments: data.attachments || [],
            });
          });

          if (!newComment) {
            return json({ error: "Failed to create comment" }, 500);
          }

          broadcast({
            type: "COMMENTS_UPDATED",
            payload: { comments: readPendingCommentsDoc(projectRoot).comments.map(formatComment) },
          });

          logActivity({
            category: "comment",
            action: "create",
            actor: data.author || "human",
            message: target_type === "general" ? "Created general workspace comment" : `Created comment on ${target_file || target_type}`,
            details: { commentId: (newComment as CommentItem).id, target_file, target_type },
          });

          return json(formatComment(newComment), 201);
        }

        // GET /api/comments/history
        if (pathname === "/api/comments/history" && method === "GET") {
          const target_file = url.searchParams.get("target_file") || url.searchParams.get("documentId") || undefined;
          const history = listCommentHistory(projectRoot, target_file);
          return json(history.map(formatComment));
        }

        // POST /api/comments/:id/resolve
        const commentResolveMatch = pathname.match(/^\/api\/comments\/([^/]+)\/resolve$/);
        if (commentResolveMatch && method === "POST") {
          const commentId = decodeURIComponent(commentResolveMatch[1]);
          const reqBody = await parseBody(req).catch(() => ({}));
          const data = reqBody.data || reqBody;
          const note = data.note || "Resolved";
          const purge = data.purge !== false;

          const commentsPath = path.join(getSpecflowDir(projectRoot), ".cache", "pending-comments.yaml");
          let resolved: CommentItem | undefined;

          await withFileWriteLock(commentsPath, () => {
            resolved = resolveComment(projectRoot, commentId, note, { purge });
          });

          if (!resolved) {
            return json({ error: "Failed to resolve comment" }, 500);
          }

          logActivity({
            category: "comment",
            action: "resolve",
            actor: "human",
            message: `Resolved comment "${commentId}": ${note}`,
            details: { commentId, note },
          });

          broadcast({
            type: "COMMENTS_UPDATED",
            payload: { comments: readPendingCommentsDoc(projectRoot).comments.map(formatComment) },
          });

          return json({ success: true, comment: formatComment(resolved) });
        }

        // PUT /api/comments/:id
        const commentIdParamMatch = pathname.match(/^\/api\/comments\/([^/]+)$/);
        if (commentIdParamMatch && method === "PUT") {
          const commentId = decodeURIComponent(commentIdParamMatch[1]);
          const reqBody = await parseBody(req);
          const data = reqBody.data || reqBody;

          const updates: { instruction?: string; anchor?: Partial<CommentAnchor> } = {};
          if (data.instruction !== undefined) {
            updates.instruction = data.instruction;
          }
          if (data.anchor !== undefined) {
            updates.anchor = data.anchor;
          } else if (data.selectedText !== undefined || data.startLine !== undefined) {
            updates.anchor = {
              start_line: Number(data.startLine) || 1,
              end_line: Number(data.endLine) || 1,
              anchor_text: data.selectedText || "",
              context_before: data.contextBefore || "",
            };
          }

          const commentsPath = path.join(getSpecflowDir(projectRoot), ".cache", "pending-comments.yaml");
          let updated: CommentItem | undefined;

          await withFileWriteLock(commentsPath, () => {
            updated = updateComment(projectRoot, commentId, updates);
          });

          if (!updated) {
            return json({ error: "Failed to update comment" }, 500);
          }

          logActivity({
            category: "comment",
            action: "edit",
            actor: data.author || "human",
            message: `Updated comment "${commentId}"`,
            details: { commentId, updates },
          });

          broadcast({
            type: "COMMENTS_UPDATED",
            payload: { comments: readPendingCommentsDoc(projectRoot).comments.map(formatComment) },
          });

          return json(formatComment(updated));
        }

        // DELETE /api/comments/:id
        if (commentIdParamMatch && method === "DELETE") {
          const commentId = decodeURIComponent(commentIdParamMatch[1]);
          const commentsPath = path.join(getSpecflowDir(projectRoot), ".cache", "pending-comments.yaml");

          await withFileWriteLock(commentsPath, () => {
            deleteComment(projectRoot, commentId);
          });

          logActivity({
            category: "comment",
            action: "delete",
            actor: "human",
            message: `Deleted comment "${commentId}"`,
            details: { commentId },
          });

          broadcast({
            type: "COMMENTS_UPDATED",
            payload: { comments: readPendingCommentsDoc(projectRoot).comments.map(formatComment) },
          });

          return json({ success: true, id: commentId });
        }

        // GET /api/checkpoints
        if (pathname === "/api/checkpoints" && method === "GET") {
          const file = url.searchParams.get("file") || undefined;
          const snapshots = listSnapshots(projectRoot, file);
          return json(snapshots);
        }

        // POST /api/checkpoints/:id/restore
        const checkpointRestoreMatch = pathname.match(/^\/api\/checkpoints\/([^/]+)\/restore$/);
        if (checkpointRestoreMatch && method === "POST") {
          const snapshotId = decodeURIComponent(checkpointRestoreMatch[1]);
          const result = restoreSnapshot(projectRoot, snapshotId);

          broadcast({
            type: "DOC_UPDATED",
            payload: { file: result.restoredFile },
          });

          logActivity({
            category: "checkpoint",
            action: "restore",
            actor: "human",
            message: `Restored snapshot "${snapshotId}" to ${result.restoredFile}`,
            details: { snapshotId, file: result.restoredFile },
          });

          return json({ success: true, restoredFile: result.restoredFile, entry: result.entry });
        }

        // GET /api/logs
        if (pathname === "/api/logs" && method === "GET") {
          const category = url.searchParams.get("category");
          const limit = url.searchParams.get("limit");
          let filtered = [...activityLogs];
          if (category) {
            filtered = filtered.filter((l) => l.category === category);
          }
          if (limit) {
            const limNum = parseInt(limit, 10);
            if (!isNaN(limNum) && limNum > 0) {
              filtered = filtered.slice(-limNum);
            }
          }
          return json({ logs: filtered });
        }

        // GET /api/documents (Dashboard document list compatibility)
        if (pathname === "/api/documents" && method === "GET") {
          const steering = getSteeringStatus(projectRoot);
          interface ApiDocItem {
            id: string;
            featureId?: string | null;
            kind: string;
            title: string;
            path: string;
            status: string;
            approvedBy: string | null;
            revision: number;
            updatedAt: string;
          }
          const docs: ApiDocItem[] = [];

          for (const d of steering.documents) {
            docs.push({
              id: d.id,
              featureId: null,
              kind: "steering",
              title: d.title,
              path: d.relativePath,
              status: d.status,
              approvedBy: d.approved_by,
              revision: 1,
              updatedAt: d.updated_at,
            });
          }

          const specs = listSpecs(projectRoot);
          for (const s of specs) {
            const specDir = path.join(getSpecflowDir(projectRoot), "specs", s.id);
            if (s.hasRequirements) {
              docs.push({
                id: `${s.id}:requirements`,
                featureId: s.id,
                kind: "requirements",
                title: `${s.name} - Requirements`,
                path: path.relative(projectRoot, path.join(specDir, "requirements.md")),
                status: s.status,
                approvedBy: null,
                revision: 1,
                updatedAt: new Date().toISOString(),
              });
            }
            if (s.hasDesign) {
              docs.push({
                id: `${s.id}:design`,
                featureId: s.id,
                kind: "design",
                title: `${s.name} - Design`,
                path: path.relative(projectRoot, path.join(specDir, "design.md")),
                status: s.status,
                approvedBy: null,
                revision: 1,
                updatedAt: new Date().toISOString(),
              });
            }
            if (fs.existsSync(path.join(specDir, "tasks.yaml"))) {
              docs.push({
                id: `${s.id}:tasks`,
                featureId: s.id,
                kind: "tasks",
                title: `${s.name} - Tasks`,
                path: path.relative(projectRoot, path.join(specDir, "tasks.yaml")),
                status: s.status,
                approvedBy: null,
                revision: 1,
                updatedAt: new Date().toISOString(),
              });
            }
          }

          return json(docs);
        }

        // GET /api/documents/:id (Dashboard document get compatibility)
        const documentIdMatch = pathname.match(/^\/api\/documents\/([^/]+)$/);
        if (documentIdMatch && method === "GET") {
          const docId = decodeURIComponent(documentIdMatch[1]);
          const cleanId = docId.replace(/^steering-/, "");

          // Steering doc?
          const steering = getSteeringStatus(projectRoot);
          const stDoc = steering.documents.find((d) => d.id === docId || d.id === cleanId || d.filename === docId);
          if (stDoc) {
            return json({
              id: stDoc.id,
              kind: "steering",
              title: stDoc.title,
              path: stDoc.relativePath,
              status: stDoc.status,
              approvedBy: stDoc.approved_by,
              revision: 1,
              content: stDoc.content,
              updatedAt: stDoc.updated_at,
            });
          }

          // Spec doc?
          if (docId.includes(":")) {
            const [specId, kind] = docId.split(":");
            const filename = kind === "requirements" ? "requirements.md" : kind === "design" ? "design.md" : "tasks.yaml";
            const fullPath = path.join(getSpecflowDir(projectRoot), "specs", specId, filename);
            if (fs.existsSync(fullPath)) {
              const raw = fs.readFileSync(fullPath, "utf-8");
              let status = "in-progress";
              let approved_by = null;
              let updated_at = new Date().toISOString();
              try {
                const parsed = parseDocumentFrontmatter(raw);
                if (parsed.frontmatter) {
                  status = parsed.frontmatter.status || status;
                  approved_by = parsed.frontmatter.approved_by || null;
                  updated_at = parsed.frontmatter.updated_at || updated_at;
                }
              } catch {
                // Not frontmatter markdown
              }
              return json({
                id: docId,
                kind,
                title: `${specId} ${kind}`,
                path: path.relative(projectRoot, fullPath),
                status,
                approvedBy: approved_by,
                revision: 1,
                content: raw,
                updatedAt: updated_at,
              });
            }
          }

          return json({ error: `Document "${docId}" not found` }, 404);
        }

        // POST /api/documents/archive
        if (pathname === "/api/documents/archive" && method === "POST") {
          const reqBody = await parseBody(req);
          const target = reqBody.id || reqBody.path || reqBody.documentId || reqBody.docId;
          if (!target) {
            return json({ error: "Missing document id or path" }, 400);
          }
          const res = archiveDocument(projectRoot, target);
          broadcast({
            type: "DOCUMENT_ARCHIVED",
            payload: { originalPath: res.originalPath, archivedPath: res.archivedPath },
          });
          broadcast({
            type: "DOC_UPDATED",
            payload: { file: res.originalPath },
          });
          logActivity({
            category: "document",
            action: "archive",
            actor: "human",
            message: `Archived document "${target}" to ${res.archivedPath}`,
            details: { originalPath: res.originalPath, archivedPath: res.archivedPath },
          });
          return json({ success: true, originalPath: res.originalPath, archivedPath: res.archivedPath });
        }

        // POST /api/documents/:id/archive
        const docArchiveMatch = pathname.match(/^\/api\/documents\/([^/]+)\/archive$/);
        if (docArchiveMatch && method === "POST") {
          const rawId = decodeURIComponent(docArchiveMatch[1]);
          const reqBody = await parseBody(req).catch(() => ({}));
          const target = reqBody.id || reqBody.path || rawId;
          const res = archiveDocument(projectRoot, target);
          broadcast({
            type: "DOCUMENT_ARCHIVED",
            payload: { originalPath: res.originalPath, archivedPath: res.archivedPath },
          });
          broadcast({
            type: "DOC_UPDATED",
            payload: { file: res.originalPath },
          });
          logActivity({
            category: "document",
            action: "archive",
            actor: "human",
            message: `Archived document "${target}" to ${res.archivedPath}`,
            details: { originalPath: res.originalPath, archivedPath: res.archivedPath },
          });
          return json({ success: true, originalPath: res.originalPath, archivedPath: res.archivedPath });
        }

        // GET /api/preferences
        if (pathname === "/api/preferences" && method === "GET") {
          const preferences = getPreferences(projectRoot);
          return json({ preferences });
        }

        // PUT /api/preferences
        if (pathname === "/api/preferences" && method === "PUT") {
          const reqBody = await parseBody(req);
          const prefsToUpdate = reqBody.preferences !== undefined ? reqBody.preferences : reqBody;
          const updated = updatePreferences(projectRoot, prefsToUpdate);
          broadcast({
            type: "PREFERENCES_UPDATED",
            payload: { preferences: updated },
          });
          return json({ success: true, preferences: updated });
        }

        // Unknown API route
        return json({ error: `Endpoint not found: ${method} ${pathname}` }, 404);
      } catch (err: unknown) {
        return errorJson(err);
      }
    }

    // Static Asset Serving & SPA Fallback
    if (method === "GET" || method === "HEAD") {
      let relativeFilePath = pathname.slice(1);
      if (!relativeFilePath) {
        relativeFilePath = "index.html";
      }

      const filePath = path.resolve(staticDir, relativeFilePath);

      // Security check: ensure within staticDir
      if (filePath.startsWith(staticDir) && fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || "application/octet-stream";

        const data = fs.readFileSync(filePath);
        return new Response(data, {
          headers: { "Content-Type": contentType },
        });
      }

      // SPA fallback: return index.html for non-API routes
      const indexPath = path.join(staticDir, "index.html");
      if (fs.existsSync(indexPath)) {
        const indexHtml = fs.readFileSync(indexPath);
        return new Response(indexHtml, {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }

      // Fallback HTML if static/index.html is missing
      return new Response(
        `<!DOCTYPE html><html><head><title>Spexy</title><style>body{font-family:sans-serif;padding:2rem;text-align:center;}</style></head><body><h1>Spexy Server Active</h1><p>API is listening at <code>/api/status</code>.</p><p style="color:#666;">Web UI static assets have not been built yet.<br>Run <code>pnpm local:publish</code> or <code>pnpm build</code> to compile the web dashboard.</p></body></html>`,
        { headers: { "Content-Type": "text/html; charset=utf-8" } },
      );
    }

    return new Response("Method not allowed", { status: 405 });
  };

  const websocket = {
    open(ws: { send: (data: string) => void }) {
      clients.add(ws);
    },
    message(ws: { send: (data: string) => void }, message: string | Buffer | ArrayBuffer) {
      handleWsMessage(ws, message);
    },
    close(ws: { send: (data: string) => void }) {
      clients.delete(ws);
    },
  };

  return {
    fetch: handleFetch,
    websocket,
    broadcast,
    clients,
    logActivity,
    activityLogs,
  };
}

export function startServer(
  projectRootOrOptions?: string | ServerOptions,
  maybeOptions?: ServerOptions,
): ServerInstance {
  let projectRoot: string;
  let options: ServerOptions;

  if (typeof projectRootOrOptions === "string") {
    projectRoot = projectRootOrOptions;
    options = maybeOptions || {};
  } else {
    options = projectRootOrOptions || {};
    projectRoot = options.projectRoot || findProjectRoot();
  }

  const config = readConfig(projectRoot);

  const port = options.port ?? config.server?.port ?? 4200;
  const host = options.host ?? config.server?.host ?? "127.0.0.1";

  const { fetch, websocket, broadcast, clients, logActivity, activityLogs } = createServer({
    ...options,
    projectRoot,
    port,
    host,
  });

  // Start chokidar file watcher
  const watcherHandle: WatcherHandle = startWatcher(projectRoot, broadcast, logActivity);

  // WebSocket Server via ws
  const wss = new WebSocketServer({ noServer: true });

  const httpServer = http.createServer(async (nodeReq, nodeRes) => {
    try {
      const hostHeader = nodeReq.headers.host || `${host}:${port}`;
      const fullUrl = `http://${hostHeader}${nodeReq.url || "/"}`;

      const headers = new Headers();
      for (const [key, val] of Object.entries(nodeReq.headers)) {
        if (val !== undefined) {
          if (Array.isArray(val)) {
            for (const v of val) headers.append(key, v);
          } else {
            headers.set(key, val);
          }
        }
      }

      const hasBody = nodeReq.method !== "GET" && nodeReq.method !== "HEAD";
      let bodyBuffer: Buffer | undefined = undefined;
      if (hasBody) {
        bodyBuffer = await new Promise<Buffer>((resolve, reject) => {
          const chunks: Buffer[] = [];
          nodeReq.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
          nodeReq.on("end", () => resolve(Buffer.concat(chunks)));
          nodeReq.on("error", reject);
        });
      }

      const reqInit: RequestInit = {
        method: nodeReq.method,
        headers,
        body: bodyBuffer,
      };

      const webReq = new Request(fullUrl, reqInit);
      const webRes = await fetch(webReq);

      if (!webRes) {
        if (!nodeRes.headersSent) {
          nodeRes.writeHead(404);
          nodeRes.end();
        }
        return;
      }

      nodeRes.statusCode = webRes.status;
      nodeRes.statusMessage = webRes.statusText;
      webRes.headers.forEach((val, key) => {
        nodeRes.setHeader(key, val);
      });

      const arrayBuf = await webRes.arrayBuffer();
      if (arrayBuf.byteLength > 0) {
        nodeRes.end(Buffer.from(arrayBuf));
      } else {
        nodeRes.end();
      }
    } catch (err: unknown) {
      broadcast({
        type: "BACKGROUND_ERROR",
        payload: {
          title: "Dashboard Server Error",
          message: getErrorMessage(err),
          timestamp: new Date().toISOString(),
        },
      });
      if (!nodeRes.headersSent) {
        nodeRes.writeHead(500, { "Content-Type": "application/json" });
        nodeRes.end(JSON.stringify({ error: getErrorMessage(err) }));
      }
    }
  });

  httpServer.on("upgrade", (req, socket, head) => {
    const parsed = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
    if (parsed.pathname === "/ws") {
      wss.handleUpgrade(req, socket, head, (ws) => {
        clients.add(ws);
        websocket.open(ws);
        ws.on("message", (data) => {
          websocket.message(ws, data.toString());
        });
        ws.on("close", () => {
          clients.delete(ws);
          websocket.close(ws);
        });
        ws.on("error", () => {
          clients.delete(ws);
        });
      });
    } else {
      socket.destroy();
    }
  });

  httpServer.listen(port, host);

  const url = `http://${host}:${port}`;
  console.log(`[Spexy] Server listening at ${url}`);

  return {
    server: httpServer,
    port,
    host,
    url,
    broadcast,
    logActivity,
    activityLogs,
    close: async () => {
      await watcherHandle.close();
      for (const client of clients) {
        try {
          client.close?.();
        } catch {
          // ignore
        }
      }
      clients.clear();
      await new Promise<void>((resolve) => {
        wss.close(() => {
          httpServer.close(() => resolve());
        });
      });
    },
  };
}

export { withFileWriteLock, isFileWriteLocked, startWatcher } from "./watcher";

