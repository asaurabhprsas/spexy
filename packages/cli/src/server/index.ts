import fs from "node:fs";
import path from "node:path";
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
} from "./core";
import { startWatcher, withFileWriteLock, WatcherHandle } from "./watcher";

export interface ServerOptions {
  port?: number;
  host?: string;
  openBrowser?: boolean;
  projectRoot?: string;
}

export interface ActivityLogEntry {
  id: string;
  timestamp: string;
  category: "task" | "document" | "comment" | "watcher" | "checkpoint";
  action: string;
  actor: string;
  message: string;
  details?: Record<string, any>;
}

export interface ServerInstance {
  server: any;
  port: number;
  host: string;
  url: string;
  broadcast: (event: { type: string; payload: any }) => void;
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

function formatComment(c: any) {
  return {
    ...c,
    documentId: c.target_file,
    target_file: c.target_file,
    selectedText: c.anchor?.anchor_text ?? c.selectedText ?? "",
    startLine: c.anchor?.start_line ?? c.startLine ?? 1,
    endLine: c.anchor?.end_line ?? c.endLine ?? 1,
    status: c.status === "addressed" ? "resolved" : c.status,
    resolutionNote: c.resolution_note ?? null,
    createdAt: c.created_at || new Date().toISOString(),
  };
}

function json(data: any, status: number = 200, headers: Record<string, string> = {}): Response {
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

export function createServer(options: ServerOptions = {}): {
  fetch: (req: Request, server?: any) => Promise<Response | undefined> | Response | undefined;
  websocket: any;
  broadcast: (event: { type: string; payload: any }) => void;
  clients: Set<any>;
  logActivity: (entry: Omit<ActivityLogEntry, "id" | "timestamp">) => ActivityLogEntry;
  activityLogs: ActivityLogEntry[];
} {
  const projectRoot = options.projectRoot || findProjectRoot();
  initSpexyWorkspace(projectRoot);

  const staticDir = path.resolve(import.meta.dirname, "../../static");
  const clients = new Set<any>();

  const broadcast = (event: { type: string; payload: any }) => {
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

  const handleWsMessage = async (ws: any, rawData: any) => {
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
        let newComment: any;

        await withFileWriteLock(commentsPath, () => {
          newComment = addComment(projectRoot, {
            id: payload.id,
            target_file: payload.target_file,
            anchor: payload.anchor,
            instruction: payload.instruction,
            author: payload.author || "human",
          });
        });

        broadcast({
          type: "COMMENTS_UPDATED",
          payload: { comments: readPendingCommentsDoc(projectRoot).comments.map(formatComment) },
        });

        logActivity({
          category: "comment",
          action: "create",
          actor: payload.author || "human",
          message: `Created comment on ${payload.target_file}`,
          details: { commentId: newComment.id, target_file: payload.target_file },
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
        let resolved: any;

        await withFileWriteLock(commentsPath, () => {
          resolved = resolveComment(projectRoot, commentId, note, { purge });
        });

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
    } catch (err: any) {
      ws.send(JSON.stringify({ type: "ERROR", error: err.message }));
    }
  };

  const handleFetch = async (req: Request, server?: any): Promise<Response | undefined> => {
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
          const allTasks: any[] = [];
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
          } catch (err: any) {
            return json({ error: err.message }, 404);
          }

          const { specId, tasksDoc: doc, task: target } = taskLocation;

          let nextStatus: TaskStatus;
          try {
            nextStatus = transitionTask(target.status, action, actor, targetStatus);
          } catch (err: any) {
            return json({ error: err.message, code: err.code }, 400);
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
          } catch (err: any) {
            return json({ error: err.message, code: err.code }, 400);
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

          if (typeof Bun !== "undefined") {
            return new Response(Bun.file(targetFile), {
              headers: {
                "Content-Type": contentType,
                "Access-Control-Allow-Origin": "*",
              },
            });
          }

          const content = fs.readFileSync(targetFile);
          return new Response(content, {
            headers: {
              "Content-Type": contentType,
              "Access-Control-Allow-Origin": "*",
            },
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
          } catch (err: any) {
            return json({ error: err.message, code: err.code }, 400);
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
          const pendingOnly = url.searchParams.get("pendingOnly") === "true";
          const comments = listComments(projectRoot, { target_file, pendingOnly });
          return json(comments.map(formatComment));
        }

        // POST /api/comments
        if (pathname === "/api/comments" && method === "POST") {
          const reqBody = await parseBody(req);
          const data = reqBody.data || reqBody;
          const target_file = data.target_file || data.documentId;
          const instruction = data.instruction;
          const anchor = data.anchor || {
            start_line: Number(data.startLine) || Number(data.start_line) || 1,
            end_line: Number(data.endLine) || Number(data.end_line) || 1,
            anchor_text: data.selectedText || data.anchor_text || "",
            context_before: data.contextBefore || data.context_before || "",
          };

          if (!target_file || !instruction) {
            return json({ error: "Missing required fields (target_file / instruction)" }, 400);
          }

          const commentsPath = path.join(getSpecflowDir(projectRoot), ".cache", "pending-comments.yaml");
          let newComment: any;

          await withFileWriteLock(commentsPath, () => {
            newComment = addComment(projectRoot, {
              id: data.id,
              target_file,
              anchor,
              instruction,
              author: data.author || "human",
            });
          });

          broadcast({
            type: "COMMENTS_UPDATED",
            payload: { comments: readPendingCommentsDoc(projectRoot).comments.map(formatComment) },
          });

          logActivity({
            category: "comment",
            action: "create",
            actor: data.author || "human",
            message: `Created comment on ${target_file}`,
            details: { commentId: newComment.id, target_file },
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
          let resolved: any;

          await withFileWriteLock(commentsPath, () => {
            resolved = resolveComment(projectRoot, commentId, note, { purge });
          });

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

          const updates: any = {};
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
          let updated: any;

          await withFileWriteLock(commentsPath, () => {
            updated = updateComment(projectRoot, commentId, updates);
          });

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
          const docs: any[] = [];

          for (const d of steering.documents) {
            docs.push({
              id: d.id,
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
      } catch (err: any) {
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

        if (typeof Bun !== "undefined") {
          return new Response(Bun.file(filePath), {
            headers: { "Content-Type": contentType },
          });
        }

        const data = fs.readFileSync(filePath);
        return new Response(data, {
          headers: { "Content-Type": contentType },
        });
      }

      // SPA fallback: return index.html for non-API routes
      const indexPath = path.join(staticDir, "index.html");
      if (fs.existsSync(indexPath)) {
        if (typeof Bun !== "undefined") {
          return new Response(Bun.file(indexPath), {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          });
        }
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
    open(ws: any) {
      clients.add(ws);
    },
    message(ws: any, message: any) {
      handleWsMessage(ws, message);
    },
    close(ws: any) {
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

  let bunServer: any = null;

  if (typeof Bun !== "undefined") {
    bunServer = Bun.serve({
      port,
      hostname: host,
      fetch,
      websocket,
    });
  } else {
    throw new Error("Spexy server requires Bun runtime.");
  }

  const url = `http://${host}:${port}`;
  console.log(`[Spexy] Server listening at ${url}`);

  return {
    server: bunServer,
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
          client.close();
        } catch {
          // ignore
        }
      }
      clients.clear();
      if (bunServer && typeof bunServer.stop === "function") {
        bunServer.stop(true);
      }
    },
  };
}

export { withFileWriteLock, isFileWriteLocked, startWatcher } from "./watcher";

