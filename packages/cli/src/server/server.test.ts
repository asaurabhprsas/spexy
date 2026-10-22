import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { startServer, ServerInstance } from "./index";
import { initSpecFlowWorkspace, createSnapshot } from "./core";
import { withFileWriteLock, isFileWriteLocked, startWatcher } from "./watcher";

describe("Track B: Fastify/Bun WebSocket Server & File Watcher", () => {
  let tmpDir: string;
  let serverInstance: ServerInstance;
  let testPort: number;
  let baseUrl: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "specflow-test-"));
    initSpecFlowWorkspace(tmpDir);

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
  });

  it("POST /api/comments creates anchored comment and POST /api/comments/:id/resolve resolves it", async () => {
    // Create comment
    const createRes = await fetch(`${baseUrl}/api/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        target_file: ".specflow/steering/product.md",
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
          target_file: ".specflow/steering/tech.md",
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
    const dummyFile = path.join(tmpDir, ".specflow", "steering", "temp.md");

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
    const docPath = path.join(tmpDir, ".specflow", "steering", "structure.md");
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
    const tasksPath = path.join(tmpDir, ".specflow", "specs", "auth-system", "tasks.yaml");
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
});

