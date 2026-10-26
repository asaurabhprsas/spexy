import * as vscode from "vscode";
import path from "node:path";
import fs from "node:fs";
import {
  findCentralProjectRoot,
  listSpecs,
  readTasksYaml,
  flattenTasks,
  listComments,
  readCommentHistoryDoc,
  getSteeringStatus,
  listRegisteredWorktrees,
  getSpecflowDir,
  type TaskItem,
  type CommentItem,
} from "@spexy/core";

// Helper to find line number of a task in tasks.yaml
export function findTaskLineInYaml(tasksFilePath: string, taskId: string): number {
  if (!fs.existsSync(tasksFilePath)) return 0;
  const lines = fs.readFileSync(tasksFilePath, "utf-8").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.match(new RegExp(`^\\s*-\\s*id:\\s*["']?${taskId.replace(".", "\\.")}["']?\\s*$`)) ||
        line.match(new RegExp(`^\\s*id:\\s*["']?${taskId.replace(".", "\\.")}["']?\\s*$`))) {
      return i;
    }
  }
  return 0;
}

export function resolveCommentLocation(
  projectRoot: string,
  comment: CommentItem,
): { filePath: string | null; line: number } {
  // 1. Task targets
  if (comment.target_type === "task" || comment.target_id) {
    let tasksFile: string | null = null;
    if (comment.target_file && comment.target_file.includes("tasks.yaml")) {
      const candidate = path.resolve(projectRoot, comment.target_file);
      if (fs.existsSync(candidate)) tasksFile = candidate;
    }
    if (!tasksFile && comment.target_id) {
      try {
        const specs = listSpecs(projectRoot);
        for (const s of specs) {
          const specTasksPath = path.join(getSpecflowDir(projectRoot), "specs", s.id, "tasks.yaml");
          if (fs.existsSync(specTasksPath)) {
            const doc = readTasksYaml(projectRoot, s.id);
            const allTasks = flattenTasks(doc);
            if (allTasks.some((t) => t.id === comment.target_id)) {
              tasksFile = specTasksPath;
              break;
            }
          }
        }
      } catch {}
    }
    if (tasksFile && comment.target_id) {
      const line = findTaskLineInYaml(tasksFile, comment.target_id);
      return { filePath: tasksFile, line };
    }
    if (tasksFile) {
      return { filePath: tasksFile, line: 0 };
    }
  }

  // 2. Document and code target
  const targetFile = comment.target_file;
  if (!targetFile || targetFile === "general") {
    return { filePath: null, line: 0 };
  }

  const candidates = [
    path.resolve(projectRoot, targetFile),
    path.resolve(projectRoot, ".spexy", targetFile),
    path.resolve(projectRoot, ".spexy", "specs", targetFile),
    path.resolve(projectRoot, ".spexy", "steering", targetFile),
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) {
      const line = comment.anchor ? Math.max(0, comment.anchor.start_line - 1) : 0;
      return { filePath: c, line };
    }
  }

  return { filePath: null, line: 0 };
}

// ---------------------------------------------------------------------------
// 1. Steering Corpus Provider
// ---------------------------------------------------------------------------
export class SpexySteeringProvider implements vscode.TreeDataProvider<SteeringTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<SteeringTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: SteeringTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<SteeringTreeItem[]> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) return [];
    const projectRoot = findCentralProjectRoot(folders[0].uri.fsPath);

    try {
      const steering = getSteeringStatus(projectRoot);
      const items: SteeringTreeItem[] = [];

      for (const doc of steering.documents) {
        const fullPath = path.resolve(projectRoot, doc.relativePath);
        const isApproved = doc.status === "approved";
        const item = new SteeringTreeItem(
          doc.id,
          doc.title,
          vscode.TreeItemCollapsibleState.None,
          doc.filename,
          doc.status,
          fullPath,
        );

        item.description = `[${doc.status}]`;
        item.tooltip = `${doc.title}\nStatus: ${doc.status}\nFile: ${doc.relativePath}\nApproved By: ${doc.approved_by || "pending"}`;

        if (isApproved) {
          item.iconPath = new vscode.ThemeIcon("pass-filled", new vscode.ThemeColor("testing.iconPassed"));
        } else {
          item.iconPath = new vscode.ThemeIcon("edit", new vscode.ThemeColor("charts.yellow"));
        }

        if (fs.existsSync(fullPath)) {
          item.command = {
            command: "vscode.open",
            title: "Open Steering Document",
            arguments: [vscode.Uri.file(fullPath)],
          };
        }

        items.push(item);
      }

      return items;
    } catch {
      return [];
    }
  }
}

export class SteeringTreeItem extends vscode.TreeItem {
  constructor(
    public readonly docId: string,
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly filename: string,
    public readonly status: string,
    public readonly fullPath: string,
  ) {
    super(label, collapsibleState);
    this.contextValue = "spexySteeringDoc";
  }
}

// ---------------------------------------------------------------------------
// 2. Specifications & Tasks Provider
// ---------------------------------------------------------------------------
export type SpexyTaskTreeElement = SpecTreeItem | TaskDocTreeItem | TaskTreeItem;

export class SpexyTasksProvider implements vscode.TreeDataProvider<SpexyTaskTreeElement> {
  private _onDidChangeTreeData = new vscode.EventEmitter<SpexyTaskTreeElement | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: SpexyTaskTreeElement): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: SpexyTaskTreeElement): Promise<SpexyTaskTreeElement[]> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) return [];
    const projectRoot = findCentralProjectRoot(folders[0].uri.fsPath);

    if (!element) {
      // Top Level: Specs
      try {
        const specs = listSpecs(projectRoot);
        return specs.map((s) => {
          const item = new SpecTreeItem(
            s.id,
            `${s.name || s.id}`,
            vscode.TreeItemCollapsibleState.Expanded,
            s.taskCount,
            s.completedTaskCount,
            s.status,
          );
          item.description = `${s.completedTaskCount}/${s.taskCount} done`;
          item.tooltip = `Spec: ${s.id}\nStatus: ${s.status}\nProgress: ${s.completedTaskCount}/${s.taskCount} tasks done`;
          item.iconPath = new vscode.ThemeIcon("layers");
          return item;
        });
      } catch {
        return [];
      }
    }

    if (element instanceof SpecTreeItem) {
      // Children of Spec: Documents (Req, Design, Tasks) + Individual Tasks
      const items: SpexyTaskTreeElement[] = [];
      const specDir = path.join(getSpecflowDir(projectRoot), "specs", element.specId);

      // 1. Requirements doc item
      const reqPath = path.join(specDir, "requirements.md");
      if (fs.existsSync(reqPath)) {
        const reqItem = new TaskDocTreeItem(
          `req-${element.specId}`,
          "📄 Requirements (requirements.md)",
          reqPath,
        );
        items.push(reqItem);
      }

      // 2. Design doc item
      const designPath = path.join(specDir, "design.md");
      if (fs.existsSync(designPath)) {
        const designItem = new TaskDocTreeItem(
          `design-${element.specId}`,
          "📐 Design & Architecture (design.md)",
          designPath,
        );
        items.push(designItem);
      }

      // 3. Tasks Configuration doc item
      const tasksPath = path.join(specDir, "tasks.yaml");
      if (fs.existsSync(tasksPath)) {
        const tasksDocItem = new TaskDocTreeItem(
          `yaml-${element.specId}`,
          "📋 Tasks DAG (tasks.yaml)",
          tasksPath,
        );
        items.push(tasksDocItem);
      }

      // 4. Flattened tasks with statuses & blocker info
      try {
        const doc = readTasksYaml(projectRoot, element.specId);
        const allTasks = flattenTasks(doc);
        const taskStatusMap = new Map(allTasks.map((t) => [t.id, t.status]));

        for (const t of allTasks) {
          const isDone = t.status === "done";
          const isInProgress = t.status === "in-progress";
          const isReview = t.status === "to-review";

          // Determine blockers
          const blockers = (t.depends_on || []).filter((dep) => {
            const depStatus = taskStatusMap.get(dep);
            return depStatus && depStatus !== "done";
          });
          const isBlocked = !isDone && !isInProgress && blockers.length > 0;

          const label = `${t.id} - ${t.title}`;
          const item = new TaskTreeItem(
            t.id,
            label,
            vscode.TreeItemCollapsibleState.None,
            element.specId,
            t,
            isBlocked,
            blockers,
          );

          let desc = `[${t.status}]`;
          if (isBlocked) desc += ` 🔒 (blocked by ${blockers.join(", ")})`;
          if (t.worktree) desc += ` (${t.worktree})`;
          item.description = desc;

          item.tooltip = `${t.title}\nID: ${t.id}\nStatus: ${t.status}\nPriority: ${t.priority || "normal"}${
            blockers.length > 0 ? `\nBlocked by: ${blockers.join(", ")}` : ""
          }${t.branch ? `\nBranch: ${t.branch}` : ""}${t.worktree ? `\nWorktree: ${t.worktree}` : ""}`;

          // Set icons
          if (isDone) {
            item.iconPath = new vscode.ThemeIcon("pass-filled", new vscode.ThemeColor("testing.iconPassed"));
          } else if (isInProgress) {
            item.iconPath = new vscode.ThemeIcon("sync~spin", new vscode.ThemeColor("charts.orange"));
          } else if (isReview) {
            item.iconPath = new vscode.ThemeIcon("eye", new vscode.ThemeColor("charts.purple"));
          } else if (isBlocked) {
            item.iconPath = new vscode.ThemeIcon("lock", new vscode.ThemeColor("errorForeground"));
          } else {
            item.iconPath = new vscode.ThemeIcon("circle-outline");
          }

          // Command: Jump to task line in tasks.yaml
          const lineNum = findTaskLineInYaml(tasksPath, t.id);
          item.command = {
            command: "vscode.open",
            title: "View Task in YAML",
            arguments: [
              vscode.Uri.file(tasksPath),
              { selection: new vscode.Range(lineNum, 0, lineNum, 0) },
            ],
          };

          items.push(item);
        }
      } catch {
        // ignore
      }

      return items;
    }

    return [];
  }
}

export class SpecTreeItem extends vscode.TreeItem {
  constructor(
    public readonly specId: string,
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly taskCount: number,
    public readonly completedTaskCount: number,
    public readonly specStatus: string,
  ) {
    super(label, collapsibleState);
    this.contextValue = "spexySpec";
  }
}

export class TaskDocTreeItem extends vscode.TreeItem {
  constructor(
    public readonly id: string,
    public readonly label: string,
    public readonly filePath: string,
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.contextValue = "spexyDoc";
    this.iconPath = new vscode.ThemeIcon("file-text");
    this.command = {
      command: "vscode.open",
      title: "Open Document",
      arguments: [vscode.Uri.file(filePath)],
    };
  }
}

export class TaskTreeItem extends vscode.TreeItem {
  constructor(
    public readonly id: string,
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly specId: string,
    public readonly task: TaskItem,
    public readonly isBlocked: boolean,
    public readonly blockers: string[],
  ) {
    super(label, collapsibleState);
    this.contextValue = `spexyTask_${task.status}`;
  }
}

// ---------------------------------------------------------------------------
// 3. Worktrees Hub Provider
// ---------------------------------------------------------------------------
export type WorktreeTreeElement = WorktreeRootItem | WorktreeItem | WorktreeLeaseItem;

export class SpexyWorktreesProvider implements vscode.TreeDataProvider<WorktreeTreeElement> {
  private _onDidChangeTreeData = new vscode.EventEmitter<WorktreeTreeElement | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: WorktreeTreeElement): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: WorktreeTreeElement): Promise<WorktreeTreeElement[]> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) return [];
    const projectRoot = findCentralProjectRoot(folders[0].uri.fsPath);

    if (!element) {
      try {
        const registrations = listRegisteredWorktrees(projectRoot);
        const rootItem = new WorktreeRootItem(
          `Central Hub (${path.basename(projectRoot)})`,
          projectRoot,
          registrations.length,
        );
        return [rootItem];
      } catch {
        return [];
      }
    }

    if (element instanceof WorktreeRootItem) {
      try {
        const registrations = listRegisteredWorktrees(projectRoot);
        // Find all active task leases across specs
        const specs = listSpecs(projectRoot);
        const allTasks: Array<TaskItem & { specId: string }> = [];
        for (const s of specs) {
          try {
            const doc = readTasksYaml(projectRoot, s.id);
            const tasks = flattenTasks(doc);
            for (const t of tasks) {
              allTasks.push({ ...t, specId: s.id });
            }
          } catch {
            // ignore
          }
        }

        return registrations.map((wt) => {
          const matchingLeases = allTasks.filter(
            (t) => t.worktree === wt.id || t.branch === wt.branch,
          ).map((t) => ({
            taskId: t.id,
            title: t.title,
            actor: "agent",
            claimedAt: t.locked_at || "active",
          }));

          const item = new WorktreeItem(
            wt.id || path.basename(wt.path),
            wt.path,
            wt.branch,
            matchingLeases.length > 0 ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None,
            matchingLeases,
          );
          item.description = `${wt.branch} [${matchingLeases.length} leases]`;
          item.tooltip = `Worktree: ${wt.path}\nBranch: ${wt.branch}\nActive task leases: ${matchingLeases.length}`;
          item.iconPath = new vscode.ThemeIcon("git-branch");
          return item;
        });
      } catch {
        return [];
      }
    }

    if (element instanceof WorktreeItem) {
      return element.leases.map((lease) => {
        const item = new WorktreeLeaseItem(
          lease.taskId,
          `Task #${lease.taskId} - ${lease.title}`,
          lease.actor,
          lease.claimedAt,
        );
        item.description = `claimed by ${lease.actor}`;
        item.tooltip = `Task #${lease.taskId}\nTitle: ${lease.title}\nClaimed by: ${lease.actor}\nClaimed at: ${lease.claimedAt}`;
        item.iconPath = new vscode.ThemeIcon("play", new vscode.ThemeColor("charts.orange"));
        return item;
      });
    }

    return [];
  }
}

export class WorktreeRootItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly mainRepoRoot: string,
    public readonly worktreeCount: number,
  ) {
    super(label, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = "spexyWorktreeRoot";
    this.iconPath = new vscode.ThemeIcon("repo");
    this.description = `${worktreeCount} worktree${worktreeCount === 1 ? "" : "s"}`;
  }
}

export class WorktreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly worktreePath: string,
    public readonly branch: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly leases: Array<{ taskId: string; title: string; actor: string; claimedAt: string }>,
  ) {
    super(label, collapsibleState);
    this.contextValue = "spexyWorktree";
  }
}

export class WorktreeLeaseItem extends vscode.TreeItem {
  constructor(
    public readonly taskId: string,
    public readonly label: string,
    public readonly actor: string,
    public readonly claimedAt: string,
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.contextValue = "spexyWorktreeLease";
  }
}

// ---------------------------------------------------------------------------
// 4. Comments Provider (Pending & Reviewed)
// ---------------------------------------------------------------------------
export type CommentFilterMode = "pending" | "reviewed" | "all";

export class SpexyCommentsProvider implements vscode.TreeDataProvider<CommentTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<CommentTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
  private filterMode: CommentFilterMode = "pending";

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getFilter(): CommentFilterMode {
    return this.filterMode;
  }

  setFilter(mode: CommentFilterMode): void {
    this.filterMode = mode;
    this.refresh();
  }

  toggleFilter(): CommentFilterMode {
    if (this.filterMode === "pending") this.filterMode = "reviewed";
    else if (this.filterMode === "reviewed") this.filterMode = "all";
    else this.filterMode = "pending";
    this.refresh();
    return this.filterMode;
  }

  getTreeItem(element: CommentTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<CommentTreeItem[]> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) return [];
    const projectRoot = findCentralProjectRoot(folders[0].uri.fsPath);

    try {
      const pending = listComments(projectRoot, { pendingOnly: true });
      let reviewed: CommentItem[] = [];
      try {
        const historyDoc = readCommentHistoryDoc(projectRoot);
        reviewed = (historyDoc.comments || []).map((c) => ({
          ...c,
          status: c.status === "deleted" ? ("deleted" as const) : ("addressed" as const),
        }));
      } catch {}

      let displayComments: CommentItem[] = [];
      if (this.filterMode === "pending") {
        displayComments = pending;
      } else if (this.filterMode === "reviewed") {
        displayComments = reviewed;
      } else {
        const map = new Map<string, CommentItem>();
        for (const c of reviewed) map.set(c.id, c);
        for (const c of pending) map.set(c.id, c);
        displayComments = Array.from(map.values());
      }

      displayComments.sort((a, b) => {
        const tA = new Date(a.created_at || 0).getTime();
        const tB = new Date(b.created_at || 0).getTime();
        return tB - tA;
      });

      return displayComments.map((c) => {
        const isDeleted = c.status === "deleted";
        const isResolved =
          !isDeleted &&
          (c.status === "addressed" ||
            c.status === "resolved" ||
            Boolean(c.resolution_note) ||
            Boolean(c.resolved_at));
        const lines = c.anchor ? `L${c.anchor.start_line}-${c.anchor.end_line}` : "General";
        const label = isDeleted
          ? `[Deleted] [${c.id}] ${c.instruction}`
          : `[${c.id}] ${c.instruction}`;
        const item = new CommentTreeItem(
          c.id,
          label,
          vscode.TreeItemCollapsibleState.None,
          c,
          isResolved,
          isDeleted,
        );

        item.description = isDeleted
          ? `${c.target_file || "doc"} (Deleted)`
          : isResolved
          ? `${c.target_file || "doc"} (Resolved)`
          : `${c.target_file || "doc"} (${lines})`;

        item.tooltip = isDeleted
          ? `Comment: ${c.id}\nStatus: Deleted\nAuthor: ${c.author}\nTarget: ${c.target_file || "doc"}\nInstruction: ${c.instruction}\nResolution: ${c.resolution_note || "Deleted by user"}`
          : `Comment: ${c.id}\nStatus: ${isResolved ? "Resolved" : "Pending"}\nAuthor: ${c.author}\nTarget: ${c.target_file || "doc"}\nInstruction: ${c.instruction}${c.resolution_note ? `\nResolution: ${c.resolution_note}` : ""}`;

        if (isDeleted) {
          item.iconPath = new vscode.ThemeIcon("trash", new vscode.ThemeColor("charts.red"));
        } else if (isResolved) {
          item.iconPath = new vscode.ThemeIcon("check", new vscode.ThemeColor("testing.iconPassed"));
        } else {
          item.iconPath = new vscode.ThemeIcon("comment-discussion", new vscode.ThemeColor("charts.yellow"));
        }

        // On clicking any comment, open file location in editor
        item.command = {
          command: "spexy.openCommentLocation",
          title: "Open File Location in Editor",
          arguments: [c],
        };

        return item;
      });
    } catch {
      return [];
    }
  }
}

export class CommentTreeItem extends vscode.TreeItem {
  constructor(
    public readonly id: string,
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly comment: CommentItem,
    public readonly isResolved: boolean = false,
    public readonly isDeleted: boolean = false,
  ) {
    super(label, collapsibleState);
    this.contextValue = isDeleted
      ? "spexyDeletedComment"
      : isResolved
      ? "spexyResolvedComment"
      : "spexyPendingComment";
  }
}

// ---------------------------------------------------------------------------
// 5. Quick Actions Provider
// ---------------------------------------------------------------------------
export class SpexyQuickActionsProvider implements vscode.TreeDataProvider<QuickActionTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<QuickActionTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: QuickActionTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<QuickActionTreeItem[]> {
    return [
      new QuickActionTreeItem(
        "Open Full Dashboard",
        "Open full interactive workspace webview in editor tab",
        "layout-panel",
        "spexy.openDashboard",
      ),
      new QuickActionTreeItem(
        "Open Kanban Board",
        "Open ClickUp/Linear style Kanban board",
        "project",
        "spexy.openKanban",
      ),
      new QuickActionTreeItem(
        "Open Tasks & Sublists",
        "Open hierarchical tasks list with collapsible sublists",
        "checklist",
        "spexy.openTasks",
      ),
      new QuickActionTreeItem(
        "Open DAG Visualizer",
        "Visualize dependencies in directed acyclic graph",
        "type-hierarchy",
        "spexy.openDag",
      ),
      new QuickActionTreeItem(
        "Open Specifications Hub",
        "Open specifications and requirement docs",
        "book",
        "spexy.openSpecs",
      ),
      new QuickActionTreeItem(
        "Open Steering Corpus",
        "Open constitutional steering documents",
        "law",
        "spexy.openSteering",
      ),
      new QuickActionTreeItem(
        "Run Doctor Diagnostics",
        "Verify workspace integrity, steering, schemas & DAG",
        "pulse",
        "spexy.runDoctor",
      ),
      new QuickActionTreeItem(
        "Next Available Task",
        "Query DAG engine for next unblocked task",
        "arrow-right",
        "spexy.taskNext",
      ),
      new QuickActionTreeItem(
        "Add Inline Review Comment",
        "Add review comment anchored to active editor selection",
        "comment-discussion",
        "spexy.addComment",
      ),
      new QuickActionTreeItem(
        "Refresh All Workspace Data",
        "Sync trees, comment threads, and status bar",
        "refresh",
        "spexy.refreshAll",
      ),
    ];
  }
}

export class QuickActionTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly desc: string,
    public readonly iconName: string,
    public readonly cmd: string,
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.description = desc;
    this.tooltip = `${label}: ${desc}`;
    this.iconPath = new vscode.ThemeIcon(iconName);
    this.command = {
      command: cmd,
      title: label,
    };
  }
}
