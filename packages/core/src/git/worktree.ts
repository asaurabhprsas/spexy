import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { findProjectRoot, getSpecflowDir } from "../fs/workspace";
import { TaskItem, TaskStatus } from "../schemas/tasks";
import { getTaskAvailability, WorkflowRuleError } from "../dag/workflow";

export interface GitContext {
  isGit: boolean;
  commonDir: string | null;
  currentWorktree: string;
  branch: string;
  primaryRoot: string;
}

export function resolveGitContext(cwd: string = process.cwd()): GitContext {
  try {
    const gitDir = execSync("git rev-parse --git-dir", {
      cwd,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf-8",
    }).trim();

    let commonDir: string | null = null;
    try {
      commonDir = execSync("git rev-parse --git-common-dir", {
        cwd,
        stdio: ["ignore", "pipe", "ignore"],
        encoding: "utf-8",
      }).trim();
    } catch {
      commonDir = gitDir;
    }

    let branch = "main";
    try {
      branch = execSync("git rev-parse --abbrev-ref HEAD", {
        cwd,
        stdio: ["ignore", "pipe", "ignore"],
        encoding: "utf-8",
      }).trim();
    } catch {
      // fallback
    }

    const absCommon = path.isAbsolute(commonDir)
      ? commonDir
      : path.resolve(cwd, commonDir);

    // If git common dir is `/repo/.git`, primary root is `/repo`
    let primaryRoot = path.resolve(cwd);
    if (absCommon.endsWith(".git")) {
      primaryRoot = path.dirname(absCommon);
    }

    const currentWorktree = path.basename(cwd);

    return {
      isGit: true,
      commonDir: absCommon,
      currentWorktree,
      branch,
      primaryRoot,
    };
  } catch {
    return {
      isGit: false,
      commonDir: null,
      currentWorktree: path.basename(cwd),
      branch: "main",
      primaryRoot: path.resolve(cwd),
    };
  }
}

export interface WorktreeRegistration {
  id: string;
  path: string;
  branch: string;
  lastHeartbeat: string;
}

export function registerWorktree(projectRoot: string, cwd: string): void {
  const cacheDir = path.join(getSpecflowDir(projectRoot), ".cache");
  fs.mkdirSync(cacheDir, { recursive: true });
  const registryPath = path.join(cacheDir, "worktrees.json");

  let list: WorktreeRegistration[] = [];
  if (fs.existsSync(registryPath)) {
    try {
      list = JSON.parse(fs.readFileSync(registryPath, "utf-8"));
    } catch {
      list = [];
    }
  }

  const git = resolveGitContext(cwd);
  const now = new Date().toISOString();
  const existing = list.findIndex((w) => w.path === cwd);
  if (existing >= 0) {
    list[existing].lastHeartbeat = now;
    list[existing].branch = git.branch;
  } else {
    list.push({
      id: git.currentWorktree,
      path: cwd,
      branch: git.branch,
      lastHeartbeat: now,
    });
  }

  fs.writeFileSync(registryPath, JSON.stringify(list, null, 2), "utf-8");
}

export function listRegisteredWorktrees(projectRoot: string): WorktreeRegistration[] {
  const cacheDir = path.join(getSpecflowDir(projectRoot), ".cache");
  const registryPath = path.join(cacheDir, "worktrees.json");
  if (!fs.existsSync(registryPath)) return [];
  try {
    return JSON.parse(fs.readFileSync(registryPath, "utf-8"));
  } catch {
    return [];
  }
}

export function findCentralProjectRoot(startDir: string = process.cwd()): string {
  const git = resolveGitContext(startDir);
  if (git.isGit && git.primaryRoot) {
    const centralSpexy = path.join(git.primaryRoot, ".spexy");
    const centralLegacy = path.join(git.primaryRoot, ".specflow");
    if (fs.existsSync(centralSpexy) || fs.existsSync(centralLegacy)) {
      return git.primaryRoot;
    }
  }
  return findProjectRoot(startDir);
}

export function acquireTaskLease(
  task: TaskItem,
  worktree: string,
  branch: string,
): TaskItem {
  if (
    task.status === "in-progress" &&
    ((task.worktree && task.worktree !== worktree) || (!task.worktree))
  ) {
    const holder = task.worktree ? `worktree "${task.worktree}"` : "another agent";
    const branchInfo = task.branch ? ` on branch "${task.branch}"` : "";
    const sinceInfo = task.locked_at ? ` since ${task.locked_at}` : "";
    throw new WorkflowRuleError(
      "TASK_LEASE_CONFLICT",
      `Task "${task.id}" is already leased by ${holder}${branchInfo}${sinceInfo}. Concurrency conflict prevented.`,
    );
  }

  return {
    ...task,
    status: "in-progress",
    worktree,
    branch,
    locked_at: new Date().toISOString(),
  };
}

export function releaseTaskLease(task: TaskItem): TaskItem {
  return {
    ...task,
    locked_at: null,
  };
}

export function getAlternativeAvailableTasks(
  tasks: TaskItem[],
  currentTaskId?: string,
): TaskItem[] {
  const statuses: Record<string, TaskStatus | undefined> = {};
  for (const t of tasks) {
    statuses[t.id] = t.status;
  }
  const availability = getTaskAvailability(tasks, statuses);
  return tasks.filter((t) => {
    if (currentTaskId && t.id === currentTaskId) return false;
    return availability.get(t.id) === "available" && t.status === "todo";
  });
}
