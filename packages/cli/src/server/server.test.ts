import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { startServer, ServerInstance } from "./index";
import { initSpexyWorkspace, createSnapshot } from "./core";
import { withFileWriteLock, isFileWriteLocked, startWatcher } from "./watcher";

describe("Track B: Fastify/Bun WebSocket Server & File Watcher", () => {
  let tmpDir: string;
  let serverInstance: ServerInstance;
  let testPort: number;
  let baseUrl: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "spexy-test-"));
    initSpexyWorkspace(tmpDir);

    testPort = 42000 + Math.floor(Math.random() * 1000);
    serverInstance = startServer({
      projectRoot: tmpDir,
      port: testPort,
      host: "127.0.0.1",
    });
    baseUrl = `http://127.0.0.1:${testPort}`;
  });

  afterAll(async () => {
    await serverInstance.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("GET /api/status returns steering, specs, and config", async () => {
    const res = await fetch(`${baseUrl}/api/status`);
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body).toHaveProperty("steering");
    expect(body).toHaveProperty("specs");
    expect(body).toHaveProperty("config");
    expect(body.steering.documents.length).toBeGreaterThanOrEqual(3);
    expect(body.steering.approved).toBe(false);
  });

  it("GET /api/steering returns list of steering documents", async () => {
    const res = await fetch(`${baseUrl}/api/steering`);
    expect(res.status).toBe(200);
    const docs: any = await res.json();
    expect(Array.isArray(docs)).toBe(true);
    expect(docs.some((d: any) => d.id === "product")).toBe(true);
  });

  it("GET /api/steering/:id returns content and frontmatter", async () => {
    const res = await fetch(`${baseUrl}/api/steering/product`);
    expect(res.status).toBe(200);
    const doc: any = await res.json();
    expect(doc.id).toBe("product");
    expect(doc).toHaveProperty("frontmatter");
    expect(doc).toHaveProperty("body");
    expect(doc.frontmatter.status).toBe("draft");
  });

  it("PUT /api/steering/:id updates document body and frontmatter", async () => {
    const res = await fetch(`${baseUrl}/api/steering/product`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        body: "# Updated Vision\n\nNew product details.",
        frontmatter: { status: "in-review" },
      }),
    });
    expect(res.status).toBe(200);
    const result: any = await res.json();
    expect(result.success).toBe(true);

    const checkRes = await fetch(`${baseUrl}/api/steering/product`);
    const doc: any = await checkRes.json();
    expect(doc.frontmatter.status).toBe("in-review");
    expect(doc.body).toContain("New product details.");
  });

  it("POST /api/steering/:id/approve marks document approved by human", async () => {
    for (const docId of ["product", "tech", "structure"]) {
      const res = await fetch(`${baseUrl}/api/steering/${docId}/approve`, {
        method: "POST",
      });
      expect(res.status).toBe(200);
      const data: any = await res.json();
      expect(data.status).toBe("approved");
      expect(data.approved_by).toBe("human");
    }

    const statusRes = await fetch(`${baseUrl}/api/status`);
    const statusData: any = await statusRes.json();
    expect(statusData.steering.approved).toBe(true);
  });

  it("POST /api/specs creates a new spec and GET /api/specs lists it", async () => {
    const createRes = await fetch(`${baseUrl}/api/specs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "auth-system",
        title: "User Authentication",
      }),
    });
    expect(createRes.status).toBe(201);
    const createData: any = await createRes.json();
    expect(createData.id).toBe("auth-system");

    const listRes = await fetch(`${baseUrl}/api/specs`);
    const specs: any = await listRes.json();
    expect(specs.some((s: any) => s.id === "auth-system")).toBe(true);
  });

  it("GET /api/specs/:id/tasks returns DAG availability and blockers", async () => {
    const res = await fetch(`${baseUrl}/api/specs/auth-system/tasks`);
    expect(res.status).toBe(200);
    const data: any = await res.json();
    expect(data).toHaveProperty("tasks");
    expect(data).toHaveProperty("availability");
    expect(data).toHaveProperty("blockers");
    expect(data.tasks.length).toBeGreaterThan(0);
    expect(data.tasks[0].availability).toBe("available");
  });

  it("POST /api/specs/:id/tasks/:taskId/transition validates human vs agent roles", async () => {
    // 1. Claim task (agent or human can claim)
    const claimRes = await fetch(`${baseUrl}/api/specs/auth-system/tasks/1/transition`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "claim",
        actor: "agent",
        worktree: "agent-worktree",
      }),
    });
    expect(claimRes.status).toBe(200);
    const claimData: any = await claimRes.json();
    expect(claimData.task.status).toBe("in-progress");
    expect(claimData.task.worktree).toBe("agent-worktree");

    // 2. Submit task for review (agent only)
    const submitRes = await fetch(`${baseUrl}/api/specs/auth-system/tasks/1/transition`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "submit",
        actor: "agent",
        note: "Implemented auth foundation with tests",
      }),
    });
    expect(submitRes.status).toBe(200);
    const submitData: any = await submitRes.json();
    expect(submitData.task.status).toBe("to-review");

    // 3. Agent trying to approve task directly must fail (HITL gate)
    const illegalApproveRes = await fetch(`${baseUrl}/api/specs/auth-system/tasks/1/transition`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "approve",
        actor: "agent",
      }),
    });
    expect(illegalApproveRes.status).toBe(400);
    const errData: any = await illegalApproveRes.json();
    expect(errData.code).toBe("HUMAN_REVIEW_REQUIRED");

    // 4. Human approving task succeeds
    const humanApproveRes = await fetch(`${baseUrl}/api/specs/auth-system/tasks/1/transition`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "approve",
        actor: "human",
      }),
    });
    expect(humanApproveRes.status).toBe(200);
    const approvedData: any = await humanApproveRes.json();
    expect(approvedData.task.status).toBe("done");

    // 5. Manual human status override: backwards transition from done -> in-progress
    const backwardsRes = await fetch(`${baseUrl}/api/specs/auth-system/tasks/1/transition`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "in-progress",
        actor: "human",
      }),
    });
    expect(backwardsRes.status).toBe(200);
    const backwardsData: any = await backwardsRes.json();
    expect(backwardsData.task.status).toBe("in-progress");

    // 6. Manual human status override: backwards transition to todo via target_status
    const toTodoRes = await fetch(`${baseUrl}/api/specs/auth-system/tasks/1/transition`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "set_status",
        target_status: "todo",
        actor: "human",
      }),
    });
    expect(toTodoRes.status).toBe(200);
    const toTodoData: any = await toTodoRes.json();
    expect(toTodoData.task.status).toBe("todo");

    // 7. Test review endpoint: reject decision sets task to todo and availability to available (not blocked)
    // First claim & submit task 1
    await fetch(`${baseUrl}/api/specs/auth-system/tasks/1/transition`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "claim", actor: "agent" }),
    });
    await fetch(`${baseUrl}/api/specs/auth-system/tasks/1/transition`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "submit", actor: "agent", note: "Ready for review" }),
    });

    const rejectRes = await fetch(`${baseUrl}/api/specs/auth-system/tasks/1/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decision: "reject",
        note: "Needs additional unit test",
      }),
    });
    expect(rejectRes.status).toBe(200);
    const rejectData: any = await rejectRes.json();
    expect(rejectData.success).toBe(true);
    expect(rejectData.task.status).toBe("todo");
    expect(rejectData.task.availability).toBe("available");

    // 8. Manual human status override via review endpoint
    const manualReviewRes = await fetch(`${baseUrl}/api/specs/auth-system/tasks/1/review`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: "in-progress",
        actor: "human",
      }),
    });
    expect(manualReviewRes.status).toBe(200);
    const manualReviewData: any = await manualReviewRes.json();
    expect(manualReviewData.task.status).toBe("in-progress");

    // Finally approve task 1 back to done for subsequent tests
    await fetch(`${baseUrl}/api/specs/auth-system/tasks/1/transition`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set_status", status: "done", actor: "human" }),
    });
  });

  it("POST /api/comments creates anchored comment and POST /api/comments/:id/resolve resolves it", async () => {
    // Create comment
    const createRes = await fetch(`${baseUrl}/api/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        target_file: ".spexy/steering/product.md",
        anchor: {
          start_line: 1,
          end_line: 3,
          anchor_text: "Updated Vision",
          context_before: "",
        },
        instruction: "Please elaborate on target users.",
        author: "human",
      }),
    });
    expect(createRes.status).toBe(201);
    const comment: any = await createRes.json();
    expect(comment.id).toBeDefined();
    expect(comment.status).toBe("pending");

    // List comments
    const listRes = await fetch(`${baseUrl}/api/comments?pendingOnly=true`);
    const comments: any = await listRes.json();
    expect(comments.some((c: any) => c.id === comment.id)).toBe(true);

    // Resolve comment
    const resolveRes = await fetch(`${baseUrl}/api/comments/${comment.id}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: "Added target audience details." }),
    });
    expect(resolveRes.status).toBe(200);

    // List comments again - should be purged
    const afterListRes = await fetch(`${baseUrl}/api/comments?pendingOnly=true`);
    const afterComments: any = await afterListRes.json();
    expect(afterComments.some((c: any) => c.id === comment.id)).toBe(false);
  });

  it("GET /api/checkpoints and POST /api/checkpoints/:id/restore", async () => {
    const testFile = path.join(tmpDir, "test-checkpoint.txt");
    fs.writeFileSync(testFile, "Version 1", "utf-8");

    const snap = createSnapshot(tmpDir, testFile);
    expect(snap).toBeDefined();

    // Overwrite file
    fs.writeFileSync(testFile, "Version 2 (Corrupted)", "utf-8");

    // List snapshots
    const listRes = await fetch(`${baseUrl}/api/checkpoints?file=test-checkpoint.txt`);
    expect(listRes.status).toBe(200);
    const snapshots: any = await listRes.json();
    expect(snapshots.length).toBeGreaterThan(0);

    // Restore snapshot
    const restoreRes = await fetch(`${baseUrl}/api/checkpoints/${snap!.id}/restore`, {
      method: "POST",
    });
    expect(restoreRes.status).toBe(200);
    const restored: any = await restoreRes.json();
    expect(restored.success).toBe(true);

    // File content restored
    expect(fs.readFileSync(testFile, "utf-8")).toBe("Version 1");
  });

  it("WebSocket endpoint /ws handles real-time messages and acknowledges", async () => {
    const wsUrl = `ws://127.0.0.1:${testPort}/ws`;
    const ws = new WebSocket(wsUrl);

    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = (e) => reject(e);
      setTimeout(() => reject(new Error("WS connection timeout")), 2000);
    });

    const received: any[] = [];
    ws.onmessage = (event) => {
      received.push(JSON.parse(String(event.data)));
    };

    // Send PING
    ws.send(JSON.stringify({ type: "PING" }));
    await new Promise((r) => setTimeout(r, 100));

    expect(received.some((m) => m.type === "PONG")).toBe(true);

    // Send COMMENT_CREATE via WebSocket
    ws.send(
      JSON.stringify({
        type: "COMMENT_CREATE",
        payload: {
          target_file: ".spexy/steering/tech.md",
          anchor: { start_line: 1, end_line: 2, anchor_text: "Technical Architecture" },
          instruction: "Verify DB migration strategy",
          author: "human",
        },
      }),
    );
    await new Promise((r) => setTimeout(r, 150));

    expect(
      received.some((m) => m.type === "ACK" && m.action === "COMMENT_CREATE"),
    ).toBe(true);

    ws.close();
  });

  it("Serves static assets and fallback index.html for SPA", async () => {
    // Root request -> index.html
    const rootRes = await fetch(`${baseUrl}/`);
    expect(rootRes.status).toBe(200);
    const html = await rootRes.text();
    expect(html).toContain("<!DOCTYPE html>");

    // Non-API route -> index.html fallback
    const spaRes = await fetch(`${baseUrl}/documents`);
    expect(spaRes.status).toBe(200);
    const spaHtml = await spaRes.text();
    expect(spaHtml).toContain("<!DOCTYPE html>");
  });

  it("Lock token inhibitor prevents watcher echoing back internal writes", async () => {
    const dummyFile = path.join(tmpDir, ".spexy", "steering", "temp.md");

    let lockActiveInside = false;
    await withFileWriteLock(dummyFile, () => {
      lockActiveInside = isFileWriteLocked(dummyFile);
    }, 150);

    expect(lockActiveInside).toBe(true);
    // Immediately after, lock is still valid (in inhibitor window)
    expect(isFileWriteLocked(dummyFile)).toBe(true);

    // After inhibitor expires (>160ms)
    await new Promise((r) => setTimeout(r, 200));
    expect(isFileWriteLocked(dummyFile)).toBe(false);
  });

  it("File watcher detects external markdown change and broadcasts DOC_UPDATED", async () => {
    const wsUrl = `ws://127.0.0.1:${testPort}/ws`;
    const ws = new WebSocket(wsUrl);

    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = (e) => reject(e);
      setTimeout(() => reject(new Error("WS connection timeout")), 2000);
    });

    const received: any[] = [];
    ws.onmessage = (event) => {
      received.push(JSON.parse(String(event.data)));
    };

    // External markdown change
    const docPath = path.join(tmpDir, ".spexy", "steering", "structure.md");
    fs.appendFileSync(docPath, "\n\n<!-- External comment addition -->\n");

    // Wait for chokidar event
    let matched = false;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 100));
      if (received.some((e) => e.type === "DOC_UPDATED" && e.payload?.file?.includes("structure.md"))) {
        matched = true;
        break;
      }
    }

    expect(matched).toBe(true);
    ws.close();
  });

  it("File watcher detects external corrupted tasks.yaml and broadcasts FILE_CORRUPTED", async () => {
    const wsUrl = `ws://127.0.0.1:${testPort}/ws`;
    const ws = new WebSocket(wsUrl);

    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = (e) => reject(e);
      setTimeout(() => reject(new Error("WS connection timeout")), 2000);
    });

    const received: any[] = [];
    ws.onmessage = (event) => {
      received.push(JSON.parse(String(event.data)));
    };

    // Write corrupted tasks.yaml with cycle or invalid schema
    const tasksPath = path.join(tmpDir, ".spexy", "specs", "auth-system", "tasks.yaml");
    fs.writeFileSync(tasksPath, "broken_yaml: [not valid task schema", "utf-8");

    let matched = false;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 100));
      if (received.some((e) => e.type === "FILE_CORRUPTED")) {
        matched = true;
        break;
      }
    }

    expect(matched).toBe(true);
    ws.close();
  });

  it("UI compatibility: GET /api/dashboard, POST /api/documents/tech/approve, and UI-formatted comments", async () => {
    // 1. GET /api/dashboard
    const dashRes = await fetch(`${baseUrl}/api/dashboard`);
    expect(dashRes.status).toBe(200);
    const dashData: any = await dashRes.json();
    expect(dashData).toHaveProperty("projectName");
    expect(dashData).toHaveProperty("taskCounts");
    expect(dashData).toHaveProperty("steeringApproved");

    // 2. POST /api/documents/tech/approve
    const approveRes = await fetch(`${baseUrl}/api/documents/tech/approve`, { method: "POST" });
    expect(approveRes.status).toBe(200);
    const approveData: any = await approveRes.json();
    expect(approveData.status).toBe("approved");

    // 3. POST /api/comments with UI body shape
    const commentRes = await fetch(`${baseUrl}/api/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: {
          documentId: "tech",
          selectedText: "Tech Stack & Architecture",
          startLine: 1,
          endLine: 2,
          instruction: "Please explain database migration strategy",
        },
      }),
    });
    expect(commentRes.status).toBe(201);
    const commentData: any = await commentRes.json();
    expect(commentData.documentId).toBe("tech");
    expect(commentData.selectedText).toBe("Tech Stack & Architecture");
    expect(commentData.startLine).toBe(1);
    expect(commentData.endLine).toBe(2);

    // 4. GET /api/comments contains documentId
    const listRes = await fetch(`${baseUrl}/api/comments`);
    expect(listRes.status).toBe(200);
    const listData: any = await listRes.json();
    expect(listData.some((c: any) => c.documentId === "tech")).toBe(true);

    // 5. GET /dashboard serves SPA index.html
    const pageRes = await fetch(`${baseUrl}/dashboard`);
    expect(pageRes.status).toBe(200);
    const html = await pageRes.text();
    expect(html.toLowerCase()).toContain("<!doctype html>");
  });

  it("PUT /api/comments/:id updates comment and DELETE /api/comments/:id deletes it", async () => {
    // 1. Create a comment
    const createRes = await fetch(`${baseUrl}/api/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        target_file: "product.md",
        instruction: "Initial comment instruction",
        anchor: {
          start_line: 5,
          end_line: 6,
          anchor_text: "Target product statement",
        },
      }),
    });
    expect(createRes.status).toBe(201);
    const created: any = await createRes.json();
    const commentId = created.id;
    expect(created.instruction).toBe("Initial comment instruction");

    // 2. PUT /api/comments/:id to update instruction
    const updateRes = await fetch(`${baseUrl}/api/comments/${commentId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instruction: "Updated instruction via PUT",
        anchor: {
          start_line: 10,
          end_line: 12,
          anchor_text: "Updated statement",
        },
      }),
    });
    expect(updateRes.status).toBe(200);
    const updated: any = await updateRes.json();
    expect(updated.id).toBe(commentId);
    expect(updated.instruction).toBe("Updated instruction via PUT");
    expect(updated.startLine).toBe(10);
    expect(updated.endLine).toBe(12);

    // Verify it is updated in GET /api/comments
    const listRes = await fetch(`${baseUrl}/api/comments`);
    const listData: any = await listRes.json();
    const found = listData.find((c: any) => c.id === commentId);
    expect(found).toBeDefined();
    expect(found.instruction).toBe("Updated instruction via PUT");

    // 3. DELETE /api/comments/:id
    const deleteRes = await fetch(`${baseUrl}/api/comments/${commentId}`, {
      method: "DELETE",
    });
    expect(deleteRes.status).toBe(200);
    const deleteData: any = await deleteRes.json();
    expect(deleteData).toEqual({ success: true, id: commentId });

    // Verify it is removed from GET /api/comments
    const afterDeleteRes = await fetch(`${baseUrl}/api/comments`);
    const afterDeleteData: any = await afterDeleteRes.json();
    expect(afterDeleteData.some((c: any) => c.id === commentId)).toBe(false);
  });

  it("GET /api/comments/history returns resolved comments", async () => {
    // 1. Create a comment
    const createRes = await fetch(`${baseUrl}/api/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        target_file: "history-target.md",
        instruction: "Needs historical tracking",
        anchor: {
          start_line: 1,
          end_line: 2,
          anchor_text: "Historical line",
        },
      }),
    });
    const created: any = await createRes.json();
    const commentId = created.id;

    // 2. Resolve comment
    const resolveRes = await fetch(`${baseUrl}/api/comments/${commentId}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        note: "Addressed in commit abc1234",
      }),
    });
    expect(resolveRes.status).toBe(200);

    // 3. GET /api/comments/history
    const historyRes = await fetch(`${baseUrl}/api/comments/history`);
    expect(historyRes.status).toBe(200);
    const history: any = await historyRes.json();
    expect(Array.isArray(history)).toBe(true);
    const found = history.find((c: any) => c.id === commentId);
    expect(found).toBeDefined();
    expect(found.status).toBe("resolved");
    expect(found.resolutionNote).toBe("Addressed in commit abc1234");

    // 4. Test target_file filter
    const filteredRes = await fetch(`${baseUrl}/api/comments/history?target_file=history-target.md`);
    const filtered: any = await filteredRes.json();
    expect(filtered.some((c: any) => c.id === commentId)).toBe(true);

    const nonExistentRes = await fetch(`${baseUrl}/api/comments/history?target_file=nonexistent.md`);
    const nonExistent: any = await nonExistentRes.json();
    expect(nonExistent.length).toBe(0);
  });

  it("GET /api/specs/:id/files lists files and serves raw file content with security checks", async () => {
    // 1. GET /api/specs/auth-system/files
    const filesRes = await fetch(`${baseUrl}/api/specs/auth-system/files`);
    expect(filesRes.status).toBe(200);
    const body: any = await filesRes.json();
    expect(body).toHaveProperty("files");
    expect(Array.isArray(body.files)).toBe(true);
    expect(body.files.some((f: any) => f.name === "requirements.md")).toBe(true);
    expect(body.files.some((f: any) => f.name === "tasks.yaml")).toBe(true);

    // 2. Add an extra file in references/
    const specDir = path.join(tmpDir, ".spexy", "specs", "auth-system");
    const refDir = path.join(specDir, "references");
    fs.mkdirSync(refDir, { recursive: true });
    fs.writeFileSync(path.join(refDir, "architecture.md"), "# Architecture Reference\nContent", "utf-8");

    const recheckRes = await fetch(`${baseUrl}/api/specs/auth-system/files`);
    const recheckBody: any = await recheckRes.json();
    expect(recheckBody.files.some((f: any) => f.name === "architecture.md")).toBe(true);

    // 3. Serve file content via GET /api/specs/:id/files/:filename+
    const serveRes = await fetch(`${baseUrl}/api/specs/auth-system/files/references/architecture.md`);
    expect(serveRes.status).toBe(200);
    const contentType = serveRes.headers.get("Content-Type");
    expect(contentType).toContain("text/markdown");
    const content = await serveRes.text();
    expect(content).toContain("# Architecture Reference");

    // 4. Security check: path traversal attempts must return 404
    const traversalRes = await fetch(`${baseUrl}/api/specs/auth-system/files/../../config.yaml`);
    expect(traversalRes.status).toBe(404);
  });

  it("GET /api/specs/:id/tasks supports format=array normalization", async () => {
    // Create a valid spec for this test
    await fetch(`${baseUrl}/api/specs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "norm-spec", title: "Normalization Spec", force: true }),
    });

    // Default format
    const defaultRes = await fetch(`${baseUrl}/api/specs/norm-spec/tasks`);
    expect(defaultRes.status).toBe(200);
    const defaultBody: any = await defaultRes.json();
    expect(defaultBody).toHaveProperty("tasks");
    expect(Array.isArray(defaultBody.tasks)).toBe(true);

    // format=array
    const arrayRes = await fetch(`${baseUrl}/api/specs/norm-spec/tasks?format=array`);
    expect(arrayRes.status).toBe(200);
    const arrayBody: any = await arrayRes.json();
    expect(Array.isArray(arrayBody)).toBe(true);
    expect(arrayBody.length).toBe(defaultBody.tasks.length);
  });

  it("GET /api/logs and WebSocket LOG_EVENT broadcasting", async () => {
    const wsUrl = `ws://127.0.0.1:${testPort}/ws`;
    const ws = new WebSocket(wsUrl);

    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = (e) => reject(e);
      setTimeout(() => reject(new Error("WS connection timeout")), 2000);
    });

    const receivedEvents: any[] = [];
    ws.onmessage = (event) => {
      receivedEvents.push(JSON.parse(String(event.data)));
    };

    // Trigger comment creation (should emit LOG_EVENT)
    await fetch(`${baseUrl}/api/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        target_file: "log-test.md",
        instruction: "Testing activity log generation",
      }),
    });

    // Wait for LOG_EVENT on WebSocket
    let foundLogEvent = false;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 50));
      if (receivedEvents.some((e) => e.type === "LOG_EVENT" && e.payload?.category === "comment")) {
        foundLogEvent = true;
        break;
      }
    }
    expect(foundLogEvent).toBe(true);
    ws.close();

    // Verify GET /api/logs
    const logsRes = await fetch(`${baseUrl}/api/logs`);
    expect(logsRes.status).toBe(200);
    const logsBody: any = await logsRes.json();
    expect(logsBody).toHaveProperty("logs");
    expect(Array.isArray(logsBody.logs)).toBe(true);
    expect(logsBody.logs.length).toBeGreaterThan(0);

    const commentLog = logsBody.logs.find((l: any) => l.category === "comment");
    expect(commentLog).toBeDefined();
    expect(commentLog).toHaveProperty("id");
    expect(commentLog).toHaveProperty("timestamp");
    expect(commentLog).toHaveProperty("action");
    expect(commentLog).toHaveProperty("actor");
    expect(commentLog).toHaveProperty("message");

    // Verify filtering by category
    const filteredRes = await fetch(`${baseUrl}/api/logs?category=comment`);
    const filteredBody: any = await filteredRes.json();
    expect(filteredBody.logs.every((l: any) => l.category === "comment")).toBe(true);

    // Verify limit parameter
    const limitedRes = await fetch(`${baseUrl}/api/logs?limit=1`);
    const limitedBody: any = await limitedRes.json();
    expect(limitedBody.logs.length).toBe(1);
  });

  it("logs task creation and transition activities with taskTitle and details", async () => {
    // 0. Create a valid spec
    await fetch(`${baseUrl}/api/specs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "task-log-spec", title: "Task Log Spec", force: true }),
    });

    // 1. Create a task via POST /api/specs/task-log-spec/tasks
    const createRes = await fetch(`${baseUrl}/api/specs/task-log-spec/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "task-log-test",
        title: "Log Test Task",
        description: "Testing activity log details",
        priority: "high",
      }),
    });
    expect(createRes.status).toBe(201);

    // 2. Transition task via POST /api/specs/task-log-spec/tasks/task-log-test/transition
    const transitionRes = await fetch(`${baseUrl}/api/specs/task-log-spec/tasks/task-log-test/transition`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "claim",
        actor: "agent",
      }),
    });
    expect(transitionRes.status).toBe(200);

    // 3. Check logs
    const logsRes = await fetch(`${baseUrl}/api/logs?category=task`);
    expect(logsRes.status).toBe(200);
    const logsBody: any = await logsRes.json();
    const taskLogs = logsBody.logs;

    const createLog = taskLogs.find((l: any) => l.action === "create" && l.details?.taskId === "task-log-test");
    expect(createLog).toBeDefined();
    expect(createLog.message).toBe('Task "Log Test Task" (task-log-test) created in spec "task-log-spec"');
    expect(createLog.details).toEqual({
      specId: "task-log-spec",
      taskId: "task-log-test",
      taskTitle: "Log Test Task",
      actor: "human",
    });

    const transitionLog = taskLogs.find((l: any) => l.action === "claim" && l.details?.taskId === "task-log-test");
    expect(transitionLog).toBeDefined();
    expect(transitionLog.message).toBe('Task "Log Test Task" (task-log-test) in spec "task-log-spec" transitioned to in-progress');
    expect(transitionLog.details).toEqual({
      specId: "task-log-spec",
      taskId: "task-log-test",
      taskTitle: "Log Test Task",
      fromStatus: "todo",
      toStatus: "in-progress",
      actor: "agent",
      note: undefined,
    });
  });

  it("GET /api/tasks and GET /api/specs/all/tasks return all tasks across active specs", async () => {
    // 1. GET /api/tasks returns object with tasks and total
    const res = await fetch(`${baseUrl}/api/tasks`);
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body).toHaveProperty("tasks");
    expect(body).toHaveProperty("total");
    expect(Array.isArray(body.tasks)).toBe(true);
    expect(body.total).toBe(body.tasks.length);
    expect(body.tasks.length).toBeGreaterThan(0);
    // Task has spec_id, availability, and blockers
    const task = body.tasks[0];
    expect(task).toHaveProperty("spec_id");
    expect(task).toHaveProperty("availability");
    expect(task).toHaveProperty("blockers");

    // 2. GET /api/specs/all/tasks?format=array returns array of tasks
    const arrayRes = await fetch(`${baseUrl}/api/specs/all/tasks?format=array`);
    expect(arrayRes.status).toBe(200);
    const arrayBody: any = await arrayRes.json();
    expect(Array.isArray(arrayBody)).toBe(true);
    expect(arrayBody.length).toBe(body.total);
    expect(arrayBody[0]).toHaveProperty("spec_id");
  });

  it("POST /api/tasks/:taskId/transition transitions task located across specs", async () => {
    // Create a valid spec for global tasks
    await fetch(`${baseUrl}/api/specs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "global-spec", title: "Global Spec", force: true }),
    });

    const taskRes = await fetch(`${baseUrl}/api/specs/global-spec/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "global-task-1",
        title: "Global Task 1",
      }),
    });
    expect(taskRes.status).toBe(201);

    // Transition via POST /api/tasks/:taskId/transition
    const transitionRes = await fetch(`${baseUrl}/api/tasks/global-task-1/transition`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "claim",
        actor: "agent",
      }),
    });
    expect(transitionRes.status).toBe(200);
    const transitionBody: any = await transitionRes.json();
    expect(transitionBody.success).toBe(true);
    expect(transitionBody.task.status).toBe("in-progress");

    // Transition via POST /api/specs/all/tasks/:taskId/transition
    const submitRes = await fetch(`${baseUrl}/api/specs/all/tasks/global-task-1/transition`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "submit",
        actor: "agent",
        note: "Submitted via global endpoint",
      }),
    });
    expect(submitRes.status).toBe(200);
    const submitBody: any = await submitRes.json();
    expect(submitBody.success).toBe(true);
    expect(submitBody.task.status).toBe("to-review");
  });

  it("GET /api/specs/nonexistent-spec/files returns 200 with empty array", async () => {
    const res = await fetch(`${baseUrl}/api/specs/nonexistent-spec/files`);
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body).toEqual({ files: [] });
  });

  it("GET /api/comments/history supports normalized target_file matching", async () => {
    // 1. Create and resolve a comment on .spexy/steering/tech.md
    const createRes = await fetch(`${baseUrl}/api/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        target_file: ".spexy/steering/tech.md",
        anchor: {
          start_line: 1,
          end_line: 2,
          anchor_text: "Tech Stack",
        },
        instruction: "Clarify database selection.",
      }),
    });
    expect(createRes.status).toBe(201);
    const comment: any = await createRes.json();

    const resolveRes = await fetch(`${baseUrl}/api/comments/${comment.id}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: "Chose SQLite/libsql" }),
    });
    expect(resolveRes.status).toBe(200);

    // 2. Query with normalized variants: "steering/tech.md", ".spexy/steering/tech.md", or "documentId=steering/tech.md"
    const res1 = await fetch(`${baseUrl}/api/comments/history?target_file=steering/tech.md`);
    expect(res1.status).toBe(200);
    const history1: any = await res1.json();
    expect(history1.some((c: any) => c.id === comment.id)).toBe(true);

    const res2 = await fetch(`${baseUrl}/api/comments/history?documentId=.spexy/steering/tech.md`);
    expect(res2.status).toBe(200);
    const history2: any = await res2.json();
    expect(history2.some((c: any) => c.id === comment.id)).toBe(true);
  });

  it("broadcasts SPEC_FILES_UPDATED when file in references or images is created or deleted", async () => {
    const wsUrl = `ws://127.0.0.1:${testPort}/ws`;
    const ws = new WebSocket(wsUrl);

    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve();
      ws.onerror = (e) => reject(e);
      setTimeout(() => reject(new Error("WS connection timeout")), 2000);
    });

    const received: any[] = [];
    ws.onmessage = (event) => {
      received.push(JSON.parse(String(event.data)));
    };

    // 1. Create file in references
    const specDir = path.join(tmpDir, ".spexy", "specs", "auth-system");
    const refDir = path.join(specDir, "references");
    fs.mkdirSync(refDir, { recursive: true });
    const testDoc = path.join(refDir, "spec-file-test.txt");
    fs.writeFileSync(testDoc, "Auxiliary content", "utf-8");

    // Wait for SPEC_FILES_UPDATED
    let addMatched = false;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 100));
      if (
        received.some(
          (e) =>
            e.type === "SPEC_FILES_UPDATED" &&
            e.payload?.specId === "auth-system" &&
            e.payload?.file?.includes("spec-file-test.txt"),
        )
      ) {
        addMatched = true;
        break;
      }
    }
    expect(addMatched).toBe(true);

    // 2. Delete file in references
    fs.unlinkSync(testDoc);

    let unlinkMatched = false;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 100));
      if (
        received.some(
          (e) =>
            e.type === "SPEC_FILES_UPDATED" &&
            e.payload?.specId === "auth-system" &&
            e.payload?.file?.includes("spec-file-test.txt"),
        )
      ) {
        unlinkMatched = true;
        break;
      }
    }
    expect(unlinkMatched).toBe(true);

    ws.close();
  });

  it("POST /api/documents/:id/archive and POST /api/documents/archive moves docs to .spexy/archived/ and broadcasts event", async () => {
    // 1. Create a custom steering document
    const steeringDocPath = path.join(tmpDir, ".spexy", "steering", "custom-rules.md");
    fs.writeFileSync(steeringDocPath, "# Custom Rules\nSome rules.", "utf-8");

    // Test POST /api/documents/:id/archive
    const res1 = await fetch(`${baseUrl}/api/documents/custom-rules/archive`, {
      method: "POST",
    });
    expect(res1.status).toBe(200);
    const body1: any = await res1.json();
    expect(body1.success).toBe(true);
    expect(body1.originalPath).toBe(".spexy/steering/custom-rules.md");
    expect(body1.archivedPath).toBe(".spexy/archived/steering/custom-rules.md");
    expect(fs.existsSync(steeringDocPath)).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, body1.archivedPath))).toBe(true);

    // 2. Create another doc and test POST /api/documents/archive with body
    const arbitraryDocPath = path.join(tmpDir, "docs", "archivable.md");
    fs.mkdirSync(path.dirname(arbitraryDocPath), { recursive: true });
    fs.writeFileSync(arbitraryDocPath, "# Archivable\nTest content.", "utf-8");

    const res2 = await fetch(`${baseUrl}/api/documents/archive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "docs/archivable.md" }),
    });
    expect(res2.status).toBe(200);
    const body2: any = await res2.json();
    expect(body2.success).toBe(true);
    expect(body2.originalPath).toBe("docs/archivable.md");
    expect(body2.archivedPath).toBe(".spexy/archived/docs/archivable.md");
    expect(fs.existsSync(arbitraryDocPath)).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, body2.archivedPath))).toBe(true);
  });

  it("GET /api/preferences and PUT /api/preferences manages user preferences", async () => {
    // Initial GET should return empty preferences
    const res1 = await fetch(`${baseUrl}/api/preferences`);
    expect(res1.status).toBe(200);
    const body1: any = await res1.json();
    expect(body1).toHaveProperty("preferences");
    expect(body1.preferences).toEqual({});

    // PUT to set preferences
    const res2 = await fetch(`${baseUrl}/api/preferences`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme: "dark", compactView: true }),
    });
    expect(res2.status).toBe(200);
    const body2: any = await res2.json();
    expect(body2.success).toBe(true);
    expect(body2.preferences).toEqual({ theme: "dark", compactView: true });

    // GET should now return saved preferences
    const res3 = await fetch(`${baseUrl}/api/preferences`);
    expect(res3.status).toBe(200);
    const body3: any = await res3.json();
    expect(body3.preferences).toEqual({ theme: "dark", compactView: true });

    // PUT again to merge preferences
    const res4 = await fetch(`${baseUrl}/api/preferences`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme: "light", fontSize: 16 }),
    });
    expect(res4.status).toBe(200);
    const body4: any = await res4.json();
    expect(body4.success).toBe(true);
    expect(body4.preferences).toEqual({ theme: "light", compactView: true, fontSize: 16 });
  });
});

