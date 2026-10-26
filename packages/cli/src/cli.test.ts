import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";
import YAML from "yaml";

describe("@spexy/cli Comprehensive Test Suite", () => {
  let tmpDir: string;
  const binPath = path.resolve(__dirname, "bin.ts");
  const distPath = path.resolve(__dirname, "../dist/bin.js");
  const localTsx = path.resolve(__dirname, "../../../node_modules/.bin/tsx");
  const tsxCmd = fs.existsSync(localTsx) ? `"${localTsx}"` : "tsx";
  const cliExec = `${tsxCmd} "${binPath}"`;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "spexy-cli-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function runCli(args: string[], options?: { expectFail?: boolean }): string {
    try {
      const quoted = args.map((a) => (a.includes(" ") ? `"${a.replace(/"/g, '\\"')}"` : a)).join(" ");
      const output = execSync(`${cliExec} ${quoted}`, {
        cwd: tmpDir,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      return output;
    } catch (err: unknown) {
      const execErr = err as { stdout?: Buffer | string; stderr?: Buffer | string; message?: string };
      if (options?.expectFail) {
        return (execErr.stdout?.toString() || "") + (execErr.stderr?.toString() || "");
      }
      throw new Error(`CLI execution failed: ${execErr.stderr?.toString() || execErr.message}`);
    }
  }

  it("prints help successfully", () => {
    const output = runCli(["--help"]);
    expect(output).toContain("Spexy CLI");
    expect(output).toContain("init");
    expect(output).toContain("status");
    expect(output).toContain("spec");
    expect(output).toContain("task");
    expect(output).toContain("comment");
    expect(output).toContain("checkpoint");
    expect(output).toContain("doc");
  });

  it("initializes workspace and reports status", () => {
    const initOutput = runCli(["init"]);
    expect(initOutput).toContain("Spexy workspace initialized");
    expect(fs.existsSync(path.join(tmpDir, ".spexy", "config.yaml"))).toBe(true);

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

    // AI Gate: Attempting to claim before steering documents are approved must be blocked
    const steeringBlocked = runCli(["task", "start", taskId], { expectFail: true });
    expect(steeringBlocked).toContain("Workspace steering documents are not approved");

    // Human approves steering
    runCli(["doc", "approve", "product.md"]);
    runCli(["doc", "approve", "tech.md"]);
    runCli(["doc", "approve", "structure.md"]);

    // AI Gate: Attempting to claim before spec requirements/design are approved must be blocked
    const specBlocked = runCli(["task", "start", taskId], { expectFail: true });
    expect(specBlocked).toContain("must be approved by a human before AI execution");

    // Human approves spec requirements & design
    runCli(["doc", "approve", "specs/payment-gateway/requirements.md"]);
    runCli(["doc", "approve", "specs/payment-gateway/design.md"]);

    // task start now succeeds
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
  }, 25000);

  it("lists and resolves comments with auto-purging", () => {
    runCli(["init"]);

    // Add a comment directly into cache
    const commentsPath = path.join(tmpDir, ".spexy", ".cache", "pending-comments.yaml");
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
    fs.mkdirSync(path.join(tmpDir, "docs"), { recursive: true });
    const testDoc = path.join(tmpDir, "docs", "PROGRESS.md");
    fs.writeFileSync(testDoc, "Version 1 content", "utf-8");

    // Create a snapshot by importing createSnapshot from core
    const checkpointsDir = path.join(tmpDir, ".spexy", ".cache", "checkpoints");
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

  it("outputs token-optimized compact and formatted task lists", () => {
    runCli(["init"]);
    runCli(["spec", "create", "compact-tasks-spec", "--force"]);

    // 1. spexy task list --compact --json
    const compactJsonOut = runCli(["task", "list", "--compact", "--json"]);
    const compactTasks = JSON.parse(compactJsonOut);
    expect(Array.isArray(compactTasks)).toBe(true);
    expect(compactTasks.length).toBeGreaterThan(0);
    const taskJson = compactTasks[0];
    expect(Object.keys(taskJson).sort()).toEqual(
      ["availability", "blockers", "id", "priority", "spec_id", "status", "title"].sort(),
    );
    expect(taskJson.description).toBeUndefined();
    expect(taskJson.files).toBeUndefined();
    expect(taskJson.requirements_ref).toBeUndefined();
    expect(taskJson.notes).toBeUndefined();
    expect(taskJson.history).toBeUndefined();

    // 2. spexy task list --compact --yaml
    const compactYamlOut = runCli(["task", "list", "--compact", "--yaml"]);
    const compactYamlTasks = YAML.parse(compactYamlOut);
    expect(Array.isArray(compactYamlTasks)).toBe(true);
    expect(compactYamlTasks.length).toBeGreaterThan(0);
    const taskYaml = compactYamlTasks[0];
    expect(Object.keys(taskYaml).sort()).toEqual(
      ["availability", "blockers", "id", "priority", "spec_id", "status", "title"].sort(),
    );
    expect(taskYaml.description).toBeUndefined();
    expect(taskYaml.files).toBeUndefined();

    // Also verify --format yaml
    const formatYamlOut = runCli(["task", "list", "-c", "--format", "yaml"]);
    const formatYamlTasks = YAML.parse(formatYamlOut);
    expect(formatYamlTasks).toEqual(compactYamlTasks);
  });

  it("outputs token-optimized compact comment list", () => {
    runCli(["init"]);
    const commentsPath = path.join(tmpDir, ".spexy", ".cache", "pending-comments.yaml");
    const commentContent = `comments:
  - id: cmt-compact-1
    target_file: docs/ARCHITECTURE.md
    status: pending
    author: human
    created_at: "${new Date().toISOString()}"
    anchor:
      start_line: 12
      end_line: 15
      anchor_text: "## Section"
      context_before: "Introduction text"
    instruction: "Shorten this section"
    resolution_note: null
`;
    fs.writeFileSync(commentsPath, commentContent, "utf-8");

    // spexy comment list --compact --json
    const compactCommentOut = runCli(["comment", "list", "--compact", "--json"]);
    const compactComments = JSON.parse(compactCommentOut);
    expect(Array.isArray(compactComments)).toBe(true);
    expect(compactComments.length).toBe(1);
    const cmt = compactComments[0];
    expect(cmt).toEqual({
      id: "cmt-compact-1",
      status: "pending",
      author: "human",
      target_file: "docs/ARCHITECTURE.md",
      lines: "12-15",
      instruction: "Shorten this section",
    });
    expect(cmt.anchor).toBeUndefined();
    expect(cmt.resolution_note).toBeUndefined();

    // spexy comment list --compact --yaml
    const compactCommentYaml = runCli(["comment", "list", "-c", "--yaml"]);
    const parsedYamlComments = YAML.parse(compactCommentYaml);
    expect(parsedYamlComments[0].lines).toBe("12-15");
    expect(parsedYamlComments[0].instruction).toBe("Shorten this section");
  });

  it("outputs token-optimized compact spec list", () => {
    runCli(["init"]);
    runCli(["spec", "create", "spec-a", "--force"]);
    runCli(["spec", "create", "spec-b", "--force"]);

    // spexy spec list --compact --json
    const compactSpecOut = runCli(["spec", "list", "--compact", "--json"]);
    const compactSpecs = JSON.parse(compactSpecOut);
    expect(Array.isArray(compactSpecs)).toBe(true);
    expect(compactSpecs.length).toBe(2);
    const specA = compactSpecs.find((s: any) => s.id === "spec-a");
    expect(specA).toEqual({
      id: "spec-a",
      status: "in-progress",
      tasks: "0/1",
    });

    // spexy spec list --compact --yaml
    const compactSpecYaml = runCli(["spec", "list", "-c", "--yaml"]);
    const parsedSpecYaml = YAML.parse(compactSpecYaml);
    expect(parsedSpecYaml.length).toBe(2);
    const yamlSpecA = parsedSpecYaml.find((s: any) => s.id === "spec-a");
    expect(yamlSpecA.tasks).toBe("0/1");
    expect(yamlSpecA.status).toBe("in-progress");
  });

  it("manages doc list and doc get with token killer compact modes", () => {
    runCli(["init"]);
    runCli(["spec", "create", "auth-feature", "--force", "--title", "Authentication Feature"]);

    // 1. spexy doc list --compact --json
    const compactDocListOut = runCli(["doc", "list", "--compact", "--json"]);
    const compactDocs = JSON.parse(compactDocListOut);
    expect(Array.isArray(compactDocs)).toBe(true);
    expect(compactDocs.length).toBeGreaterThanOrEqual(3);
    for (const d of compactDocs) {
      expect(Object.keys(d).sort()).toEqual(["id", "path", "status"].sort());
      expect(d.kind).toBeUndefined();
      expect(d.title).toBeUndefined();
      expect(d.content).toBeUndefined();
    }
    expect(compactDocs.some((d: any) => d.id === "product")).toBe(true);
    expect(compactDocs.some((d: any) => d.id === "auth-feature:requirements")).toBe(true);

    // 2. spexy doc list (full) --json
    const fullDocListOut = runCli(["doc", "list", "--json"]);
    const fullDocs = JSON.parse(fullDocListOut);
    expect(fullDocs.some((d: any) => d.id === "product" && d.kind === "steering" && d.title)).toBe(true);

    // 3. spexy doc get product.md --compact --json
    const compactDocGetJson = runCli(["doc", "get", "product.md", "--compact", "--json"]);
    const parsedGetJson = JSON.parse(compactDocGetJson);
    expect(parsedGetJson.status).toBe("draft");
    expect(parsedGetJson.updated_at).toBeDefined();
    expect(parsedGetJson.approved_by).toBeNull();
    expect(parsedGetJson.title).toBeDefined();
    expect(parsedGetJson.content).toBeUndefined();
    expect(parsedGetJson.body).toBeUndefined();

    // 4. spexy doc get product.md --compact --yaml
    const compactDocGetYaml = runCli(["doc", "get", "product.md", "--compact", "--yaml"]);
    const parsedGetYaml = YAML.parse(compactDocGetYaml);
    expect(parsedGetYaml.status).toBe("draft");
    expect(parsedGetYaml.updated_at).toBeDefined();
    expect(parsedGetYaml.approved_by).toBeNull();
    expect(parsedGetYaml.title).toBeDefined();
    // Ensure markdown body was completely omitted
    expect(compactDocGetYaml).not.toContain("Refer");

    // 5. spexy doc get with full content (default text output)
    const fullDocText = runCli(["doc", "get", "product.md"]);
    expect(fullDocText).toContain("# Product Vision & Strategy");
    expect(fullDocText).toContain("Refer");

    // 6. spexy doc get with nonexistent doc should fail gracefully
    const failOutput = runCli(["doc", "get", "does-not-exist.md"], { expectFail: true });
    expect(failOutput).toContain('Document "does-not-exist.md" not found');
  });

  it("archives documents via spexy doc archive <path-or-id>", () => {
    runCli(["init"]);

    // Create a steering document to archive
    const docPath = path.join(tmpDir, ".spexy", "steering", "constitution.md");
    fs.writeFileSync(docPath, "# Constitution\nTeam principles.", "utf-8");

    const output = runCli(["doc", "archive", "constitution.md"]);
    expect(output).toContain("Archived .spexy/steering/constitution.md -> .spexy/archived/steering/constitution.md");

    expect(fs.existsSync(docPath)).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, ".spexy", "archived", "steering", "constitution.md"))).toBe(true);

    // Archiving non-existent doc should fail
    const failOut = runCli(["doc", "archive", "does-not-exist.md"], { expectFail: true });
    expect(failOut).toContain('Error archiving document "does-not-exist.md"');
  });

  it("performs comprehensive workspace health checks via doctor and check commands and flags", () => {
    runCli(["init"]);
    runCli(["spec", "create", "core-feature", "--force", "--title", "Core Feature"]);

    // 1. spexy doctor
    const doctorOut = runCli(["doctor"]);
    expect(doctorOut).toContain("Spexy Health Check Diagnostic Report");
    expect(doctorOut).toContain("Steering Documents");
    expect(doctorOut).toContain("Feature Specifications");
    expect(doctorOut).toContain("Workspace is healthy");

    // 2. spexy check (alias for doctor)
    const checkOut = runCli(["check"]);
    expect(checkOut).toContain("Spexy Health Check Diagnostic Report");
    expect(checkOut).toContain("Workspace is healthy");

    // 3. spexy --doctor root flag
    const flagDoctorOut = runCli(["--doctor"]);
    expect(flagDoctorOut).toContain("Spexy Health Check Diagnostic Report");
    expect(flagDoctorOut).toContain("Workspace is healthy");

    // 4. spexy --check root flag
    const flagCheckOut = runCli(["--check"]);
    expect(flagCheckOut).toContain("Spexy Health Check Diagnostic Report");
    expect(flagCheckOut).toContain("Workspace is healthy");

    // 5. spexy doctor --compact
    const compactDoctorOut = runCli(["doctor", "--compact"]);
    expect(compactDoctorOut).toContain("PASS");
    expect(compactDoctorOut).toContain("steering");
    expect(compactDoctorOut).toContain("specs");

    // 6. spexy check --compact
    const compactCheckOut = runCli(["check", "--compact"]);
    expect(compactCheckOut).toContain("PASS");

    // 7. spexy doctor --json
    const jsonDoctorOut = runCli(["doctor", "--json"]);
    const parsedReport = JSON.parse(jsonDoctorOut);
    expect(parsedReport.valid).toBe(true);
    expect(parsedReport.summary.failed).toBe(0);
    expect(parsedReport.summary.passed).toBeGreaterThan(0);
    expect(Array.isArray(parsedReport.checks)).toBe(true);

    // 8. Corrupt the workspace: delete tech.md and break tasks.yaml
    fs.unlinkSync(path.join(tmpDir, ".spexy", "steering", "tech.md"));
    fs.writeFileSync(
      path.join(tmpDir, ".spexy", "specs", "core-feature", "tasks.yaml"),
      "broken: [yaml syntax",
      "utf-8",
    );

    const failDoctorOut = runCli(["doctor"], { expectFail: true });
    expect(failDoctorOut).toContain("✖");
    expect(failDoctorOut).toContain("Actionable");

    const failCompactOut = runCli(["doctor", "--compact"], { expectFail: true });
    expect(failCompactOut).toContain("FAIL");
  });

  it("adds inline code review comments and queries next available task", () => {
    runCli(["init"]);
    runCli(["spec", "create", "demo-feature", "--force", "--title", "Demo Feature"]);

    // 1. Add comment with spexy comment add
    const addOut = runCli([
      "comment",
      "add",
      "-f",
      "packages/core/src/index.ts",
      "-i",
      "Verify export completeness",
      "-l",
      "5-12",
      "-s",
      "export * from",
      "-t",
      "code",
    ]);
    expect(addOut).toContain("✓ Comment");
    expect(addOut).toContain("packages/core/src/index.ts");
    expect(addOut).toContain("5-12");

    // 2. Query comment via spexy comment list
    const listOut = runCli(["comment", "list", "--compact", "--json"]);
    const comments = JSON.parse(listOut);
    expect(comments.some((c: { target_file: string; instruction: string }) => 
      c.target_file === "packages/core/src/index.ts" && c.instruction === "Verify export completeness"
    )).toBe(true);

    // 3. Query next available task via spexy task next
    const nextOut = runCli(["task", "next", "demo-feature"]);
    expect(nextOut).toContain("Next available task: 1");
    expect(nextOut).toContain("spexy task start 1");

    // 4. Query worktree list
    const worktreeOut = runCli(["worktree", "list", "--json"]);
    expect(worktreeOut).toBeDefined();

    // 5. Test CLI execution from inside an isolated git worktree
    execSync("git init && git config user.name test && git config user.email test@test.com && git add -A && git commit -m initial", { cwd: tmpDir, stdio: "ignore" });
    const worktreeDir = path.join(os.tmpdir(), `spexy-cli-wt-${Date.now()}`);
    try {
      execSync(`git worktree add ${worktreeDir} -b wt-test-branch`, { cwd: tmpDir, stdio: "ignore" });
      const statusFromWt = execSync(`${cliExec} status --json`, { cwd: worktreeDir, encoding: "utf-8" });
      const parsedStatus = JSON.parse(statusFromWt);
      expect(path.resolve(parsedStatus.projectRoot)).toBe(path.resolve(tmpDir));
    } finally {
      try { execSync(`git worktree remove --force ${worktreeDir}`, { cwd: tmpDir, stdio: "ignore" }); } catch {}
    }
  });

  it("verifies package configuration and bundled distribution artifact", () => {
    const pkgJsonPath = path.resolve(__dirname, "..", "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8"));

    expect(pkg.name).toBe("spexy-cli");
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(pkg.private).toBeUndefined();
    expect(pkg.publishConfig.access).toBe("public");
    expect(pkg.publishConfig.tag).toBeDefined();
    expect(pkg.bin).toEqual({ spexy: "./dist/bin.js", "spec-flow": "./dist/bin.js" });
    expect(pkg.files).toContain("dist");
    expect(pkg.files).toContain("static");

    // Test version flag
    const versionOut = runCli(["--version"]).trim();
    expect(versionOut).toBe(pkg.version);

    // Verify dist/bin.js exists and is runnable via node
    const distBin = path.resolve(__dirname, "..", "dist", "bin.js");
    if (fs.existsSync(distBin)) {
      const nodeVersion = execSync(`node ${distBin} --version`, { encoding: "utf-8" }).trim();
      expect(nodeVersion).toBe(pkg.version);
    }
  });
});
