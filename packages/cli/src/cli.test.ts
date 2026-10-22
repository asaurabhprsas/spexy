import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";

describe("@spec-flow/cli Comprehensive Test Suite", () => {
  let tmpDir: string;
  const binPath = path.resolve(__dirname, "bin.ts");

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "specflow-cli-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function runCli(args: string[], options?: { expectFail?: boolean }): string {
    try {
      const quoted = args.map((a) => (a.includes(" ") ? `"${a.replace(/"/g, '\\"')}"` : a)).join(" ");
      const output = execSync(`bun ${binPath} ${quoted}`, {
        cwd: tmpDir,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      return output;
    } catch (err: any) {
      if (options?.expectFail) {
        return (err.stdout?.toString() || "") + (err.stderr?.toString() || "");
      }
      throw new Error(`CLI execution failed: ${err.stderr?.toString() || err.message}`);
    }
  }

  it("prints help successfully", () => {
    const output = runCli(["--help"]);
    expect(output).toContain("Spec-Flow CLI");
    expect(output).toContain("init");
    expect(output).toContain("status");
    expect(output).toContain("spec");
    expect(output).toContain("task");
    expect(output).toContain("comment");
    expect(output).toContain("checkpoint");
  });

  it("initializes workspace and reports status", () => {
    const initOutput = runCli(["init"]);
    expect(initOutput).toContain("Spec-Flow workspace initialized");
    expect(fs.existsSync(path.join(tmpDir, ".specflow", "config.yaml"))).toBe(true);

    const statusOutput = runCli(["status"]);
    expect(statusOutput).toContain("Steering Documents Gate");
    expect(statusOutput).toContain("product.md");

    const jsonOutput = runCli(["status", "--json"]);
    const parsed = JSON.parse(jsonOutput);
    expect(parsed.steering.approved).toBe(false);
    expect(parsed.steering.total).toBe(3);
    expect(parsed.specs).toEqual([]);
  });

  it("enforces steering gate on spec create unless forced", () => {
    runCli(["init"]);

    // Attempt without force should fail
    const failOutput = runCli(["spec", "create", "user-auth"], { expectFail: true });
    expect(failOutput).toContain("steering documents are not yet approved");

    // With --force should succeed
    const createOutput = runCli(["spec", "create", "user-auth", "--force", "--title", "User Authentication"]);
    expect(createOutput).toContain('Spec "user-auth" created successfully');

    // spec list
    const listOutput = runCli(["spec", "list"]);
    expect(listOutput).toContain("user-auth");

    const jsonList = JSON.parse(runCli(["spec", "list", "--json"]));
    expect(jsonList.length).toBe(1);
    expect(jsonList[0].id).toBe("user-auth");
  });

  it("manages full task lifecycle with HITL gates", () => {
    runCli(["init"]);
    runCli(["spec", "create", "payment-gateway", "--force"]);

    // task list
    const tasksJson = JSON.parse(runCli(["task", "list", "payment-gateway", "--json"]));
    expect(tasksJson.length).toBe(1);
    const taskId = tasksJson[0].id;
    expect(tasksJson[0].availability).toBe("available");

    // task start
    const startOutput = runCli(["task", "start", taskId]);
    expect(startOutput).toContain(`Task "${taskId}" claimed successfully`);

    // Verify task is now claimed
    const claimedJson = JSON.parse(runCli(["task", "list", "payment-gateway", "--json"]));
    expect(claimedJson[0].availability).toBe("claimed");
    expect(claimedJson[0].status).toBe("in-progress");

    // task complete (submits for review)
    const completeOutput = runCli(["task", "complete", taskId, "--note", "Implemented stripe integration with unit tests"]);
    expect(completeOutput).toContain("submitted for human review");
    expect(completeOutput).toContain("to-review");

    // Attempt to approve without --human must fail
    const unauthApprove = runCli(["task", "approve", taskId], { expectFail: true });
    expect(unauthApprove).toContain("Human verification required");

    // Human reject
    const rejectOutput = runCli(["task", "reject", taskId, "--human", "--note", "Mock tests failed"]);
    expect(rejectOutput).toContain("rejected by human reviewer");
    expect(rejectOutput).toContain("todo");

    // Re-claim and re-submit
    runCli(["task", "start", taskId]);
    runCli(["task", "complete", taskId, "--note", "Fixed mock tests"]);

    // Human approve
    const approveOutput = runCli(["task", "approve", taskId, "--human"]);
    expect(approveOutput).toContain("approved by human reviewer");
    expect(approveOutput).toContain("done");

    // Spec completion should now be 100%
    const specList = JSON.parse(runCli(["spec", "list", "--json"]));
    expect(specList[0].completionPercentage).toBe(100);
  });

  it("lists and resolves comments with auto-purging", () => {
    runCli(["init"]);

    // Add a comment directly into cache
    const commentsPath = path.join(tmpDir, ".specflow", ".cache", "pending-comments.yaml");
    const commentContent = `comments:
  - id: cmt-test-1
    target_file: docs/ARCHITECTURE.md
    status: pending
    author: human
    created_at: "${new Date().toISOString()}"
    anchor:
      start_line: 1
      end_line: 2
      anchor_text: "# Title"
      context_before: ""
    instruction: "Update architecture header"
    resolution_note: null
`;
    fs.writeFileSync(commentsPath, commentContent, "utf-8");

    // comment list
    const listOutput = runCli(["comment", "list"]);
    expect(listOutput).toContain("cmt-test-1");

    // comment resolve
    const resolveOutput = runCli(["comment", "resolve", "cmt-test-1", "--note", "Header updated"]);
    expect(resolveOutput).toContain("resolved and purged");

    // comment list --pending should be empty
    const pendingOutput = runCli(["comment", "list", "--pending"]);
    expect(pendingOutput).toContain("No pending comments found");

    // comment history should show resolved comment
    const historyOutput = runCli(["comment", "history"]);
    expect(historyOutput).toContain("cmt-test-1");
    expect(historyOutput).toContain("Header updated");

    const historyJson = JSON.parse(runCli(["comment", "history", "--json"]));
    expect(historyJson.length).toBe(1);
    expect(historyJson[0].id).toBe("cmt-test-1");

    // Add a second comment to test edit and delete
    const comment2 = `comments:
  - id: cmt-test-2
    target_file: docs/PROGRESS.md
    status: pending
    author: human
    created_at: "${new Date().toISOString()}"
    anchor:
      start_line: 1
      end_line: 2
      anchor_text: "# Progress"
      context_before: ""
    instruction: "Old instruction"
    resolution_note: null
`;
    fs.writeFileSync(commentsPath, comment2, "utf-8");

    // comment edit
    const editOutput = runCli(["comment", "edit", "cmt-test-2", "--instruction", "Updated instruction text"]);
    expect(editOutput).toContain("updated");
    expect(editOutput).toContain("Updated instruction text");

    const listAfterEdit = runCli(["comment", "list"]);
    expect(listAfterEdit).toContain("Updated instruction text");

    // comment delete
    const deleteOutput = runCli(["comment", "delete", "cmt-test-2"]);
    expect(deleteOutput).toContain("deleted");

    const listAfterDelete = runCli(["comment", "list", "--pending"]);
    expect(listAfterDelete).toContain("No pending comments found");
  });

  it("lists and restores snapshots", () => {
    runCli(["init"]);
    const testDoc = path.join(tmpDir, "docs", "PROGRESS.md");
    fs.writeFileSync(testDoc, "Version 1 content", "utf-8");

    // Create a snapshot by importing createSnapshot from core
    const checkpointsDir = path.join(tmpDir, ".specflow", ".cache", "checkpoints");
    fs.mkdirSync(checkpointsDir, { recursive: true });
    const backupFile = "hash1-PROGRESS.md.bak";
    fs.writeFileSync(path.join(checkpointsDir, backupFile), "Version 1 content", "utf-8");

    const indexJson = {
      version: "1.0",
      snapshots: [
        {
          id: "chk-test-snap",
          filename: "PROGRESS.md",
          relativePath: "docs/PROGRESS.md",
          snapshotFile: backupFile,
          timestamp: new Date().toISOString(),
          size: 17,
          hash: "hash1",
        },
      ],
    };
    fs.writeFileSync(path.join(checkpointsDir, "index.json"), JSON.stringify(indexJson), "utf-8");

    // Overwrite file
    fs.writeFileSync(testDoc, "Corrupted content", "utf-8");

    // checkpoint list
    const chkList = runCli(["checkpoint", "list"]);
    expect(chkList).toContain("chk-test-snap");

    // checkpoint restore
    const restoreOutput = runCli(["checkpoint", "restore", "chk-test-snap"]);
    expect(restoreOutput).toContain("Restored snapshot");
    expect(fs.readFileSync(testDoc, "utf-8")).toBe("Version 1 content");
  });
});
