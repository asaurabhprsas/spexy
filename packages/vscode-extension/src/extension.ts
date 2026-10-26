import * as vscode from "vscode";
import path from "node:path";
import fs from "node:fs";
import { SpexyCommentController } from "./comments";
import {
  SpexySteeringProvider,
  SpexyTasksProvider,
  SpexyWorktreesProvider,
  SpexyCommentsProvider,
  SpexyQuickActionsProvider,
  TaskTreeItem,
  SteeringTreeItem,
  CommentTreeItem,
  resolveCommentLocation,
} from "./tree";
import { SpexyDashboardPanel } from "./dashboard";
import { SpexyServerManager } from "./serverManager";
import {
  findCentralProjectRoot,
  runHealthCheck,
  formatHealthReport,
  listComments,
  listSpecs,
  readTasksYaml,
  writeTasksYaml,
  flattenTasks,
  getTaskAvailability,
  getSpecflowDir,
  transitionTask,
  updateSteeringDocument,
  resolveComment,
  deleteComment,
  acquireTaskLease,
  releaseTaskLease,
  resolveGitContext,
  type TaskItem,
  type CommentItem,
} from "@spexy/core";

export function activate(context: vscode.ExtensionContext) {
  const outputChannel = vscode.window.createOutputChannel("Spexy SDD");
  context.subscriptions.push(outputChannel);

  // Helper to get central project root
  const getProjectRoot = (): string | null => {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) return null;
    return findCentralProjectRoot(folders[0].uri.fsPath);
  };

  // 1. Initialize Comment Controller
  const commentController = new SpexyCommentController(context);
  context.subscriptions.push(commentController);

  // 2. Initialize Tree Data Providers
  const steeringProvider = new SpexySteeringProvider();
  const tasksProvider = new SpexyTasksProvider();
  const worktreesProvider = new SpexyWorktreesProvider();
  const commentsProvider = new SpexyCommentsProvider();
  const quickActionsProvider = new SpexyQuickActionsProvider();

  vscode.window.registerTreeDataProvider("spexy.steeringView", steeringProvider);
  vscode.window.registerTreeDataProvider("spexy.tasksView", tasksProvider);
  vscode.window.registerTreeDataProvider("spexy.worktreesView", worktreesProvider);
  vscode.window.registerTreeDataProvider("spexy.commentsView", commentsProvider);
  vscode.window.registerTreeDataProvider("spexy.quickActionsView", quickActionsProvider);

  // 3. Status Bar Item
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.command = "spexy.openDashboard";
  context.subscriptions.push(statusBarItem);

  const updateStatusBar = () => {
    const root = getProjectRoot();
    if (!root) {
      statusBarItem.hide();
      return;
    }

    try {
      const health = runHealthCheck(root);
      const pendingComments = listComments(root, { pendingOnly: true });
      const specs = listSpecs(root);
      const totalTasks = specs.reduce((acc, s) => acc + s.taskCount, 0);
      const doneTasks = specs.reduce((acc, s) => acc + s.completedTaskCount, 0);

      if (health.valid) {
        statusBarItem.text = `$(check) Spexy: ${doneTasks}/${totalTasks} done [${pendingComments.length} cmt]`;
        statusBarItem.tooltip = `Spexy Workspace Healthy\nTasks: ${doneTasks}/${totalTasks} done\nPending Comments: ${pendingComments.length}\nClick to open full dashboard`;
        statusBarItem.backgroundColor = undefined;
      } else {
        statusBarItem.text = `$(warning) Spexy [${health.summary.failed} issues]`;
        statusBarItem.tooltip = `Spexy Diagnostics: ${health.summary.failed} issue(s) detected. Click to inspect.`;
        statusBarItem.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
      }
      statusBarItem.show();
    } catch {
      statusBarItem.hide();
    }
  };

  updateStatusBar();

  // 4. Register Commands
  const refreshAll = () => {
    steeringProvider.refresh();
    tasksProvider.refresh();
    worktreesProvider.refresh();
    commentsProvider.refresh();
    quickActionsProvider.refresh();
    commentController.syncComments();
    updateStatusBar();
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("spexy.refreshAll", () => {
      refreshAll();
      vscode.window.showInformationMessage("Spexy workspace refreshed.");
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("spexy.openDashboard", (route?: string) => {
      void SpexyDashboardPanel.createOrShow(context.extensionUri, typeof route === "string" ? route : "/tasks?view=kanban");
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("spexy.openKanban", () => {
      void SpexyDashboardPanel.createOrShow(context.extensionUri, "/tasks?view=kanban");
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("spexy.openTasks", () => {
      void SpexyDashboardPanel.createOrShow(context.extensionUri, "/tasks?view=list");
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("spexy.openDag", () => {
      void SpexyDashboardPanel.createOrShow(context.extensionUri, "/tasks?view=dag");
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("spexy.openSpecs", () => {
      void SpexyDashboardPanel.createOrShow(context.extensionUri, "/specs");
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("spexy.openSteering", () => {
      void SpexyDashboardPanel.createOrShow(context.extensionUri, "/steering");
    }),
  );

  // Doctor Health Diagnostics
  context.subscriptions.push(
    vscode.commands.registerCommand("spexy.runDoctor", () => {
      const root = getProjectRoot();
      if (!root) return;

      try {
        const report = runHealthCheck(root);
        const formatted = formatHealthReport(report);
        outputChannel.clear();
        outputChannel.appendLine(formatted);
        outputChannel.show(true);

        if (report.valid) {
          vscode.window.showInformationMessage("Spexy Doctor: All workspace checks passed clean (13/13)!");
        } else {
          vscode.window.showErrorMessage(
            `Spexy Doctor: Found ${report.summary.failed} error(s). Check 'Spexy SDD' output tab for details.`,
          );
        }
      } catch (err: unknown) {
        vscode.window.showErrorMessage(`Error running doctor: ${err instanceof Error ? err.message : String(err)}`);
      }
    }),
  );

  // Next Available Task
  context.subscriptions.push(
    vscode.commands.registerCommand("spexy.taskNext", async () => {
      const root = getProjectRoot();
      if (!root) return;

      const specs = listSpecs(root);
      for (const s of specs) {
        try {
          const doc = readTasksYaml(root, s.id);
          const tasks = flattenTasks(doc);
          const statuses: Record<string, "done" | "in-progress" | "to-review" | "todo" | undefined> = {};
          for (const t of tasks) statuses[t.id] = t.status;
          const availabilityMap = getTaskAvailability(tasks, statuses);
          const nextTask = tasks.find((t: TaskItem) => t.status === "todo" && availabilityMap.get(t.id) === "available");

          if (nextTask) {
            const action = await vscode.window.showInformationMessage(
              `Next ready task in "${s.id}": #${nextTask.id} - ${nextTask.title}`,
              "Claim Task",
              "Open in Dashboard",
            );

            if (action === "Claim Task") {
              await vscode.commands.executeCommand("spexy.claimTask", { specId: s.id, task: nextTask });
            } else if (action === "Open in Dashboard") {
              void SpexyDashboardPanel.createOrShow(context.extensionUri, "/tasks");
            }
            return;
          }
        } catch {
          // continue
        }
      }

      vscode.window.showInformationMessage("No pending tasks ready to claim in DAG graph.");
    }),
  );

  // Claim Task
  context.subscriptions.push(
    vscode.commands.registerCommand("spexy.claimTask", async (item?: TaskTreeItem | { specId: string; task: { id: string } }) => {
      const root = getProjectRoot();
      if (!root) return;

      const specId = item?.specId;
      const taskId = item instanceof TaskTreeItem ? item.id : item?.task?.id;

      if (!specId || !taskId) {
        vscode.window.showErrorMessage("Please select a task to claim.");
        return;
      }

      try {
        const doc = readTasksYaml(root, specId);
        let targetTask: { id: string; status: string } | undefined;

        for (const g of doc.groups) {
          for (const t of g.tasks) {
            if (t.id === taskId) {
              targetTask = t;
              break;
            }
          }
          if (targetTask) break;
        }

        if (!targetTask) {
          vscode.window.showErrorMessage(`Task #${taskId} not found in spec ${specId}.`);
          return;
        }

        const newStatus = transitionTask(targetTask.status as "todo", "claim", "agent");
        targetTask.status = newStatus;

        const git = resolveGitContext(root);
        const leased = acquireTaskLease(targetTask as TaskItem, git.currentWorktree, git.branch);
        Object.assign(targetTask, leased);

        writeTasksYaml(root, specId, doc);

        vscode.window.showInformationMessage(`Task #${taskId} claimed [in-progress].`);
        refreshAll();
      } catch (err: unknown) {
        vscode.window.showErrorMessage(`Failed to claim task: ${err instanceof Error ? err.message : String(err)}`);
      }
    }),
  );

  // Submit Task for Review
  context.subscriptions.push(
    vscode.commands.registerCommand("spexy.submitTask", async (item?: TaskTreeItem) => {
      const root = getProjectRoot();
      if (!root || !item) return;

      const note = await vscode.window.showInputBox({
        prompt: `Submit Task #${item.id} for Review`,
        placeHolder: "Implementation notes or PR reference...",
      });

      try {
        const doc = readTasksYaml(root, item.specId);
        for (const g of doc.groups) {
          for (const t of g.tasks) {
            if (t.id === item.id) {
              t.status = transitionTask(t.status as "in-progress", "submit", "agent");
              break;
            }
          }
        }
        writeTasksYaml(root, item.specId, doc);

        vscode.window.showInformationMessage(`Task #${item.id} submitted for review [to-review]. ${note ? `(${note})` : ""}`);
        refreshAll();
      } catch (err: unknown) {
        vscode.window.showErrorMessage(`Failed to submit task: ${err instanceof Error ? err.message : String(err)}`);
      }
    }),
  );

  // Approve Task (Human Gate)
  context.subscriptions.push(
    vscode.commands.registerCommand("spexy.approveTask", async (item?: TaskTreeItem) => {
      const root = getProjectRoot();
      if (!root || !item) return;

      const confirm = await vscode.window.showQuickPick(["Yes, Approve Task to Done", "Cancel"], {
        placeHolder: `Approve Task #${item.id} as Done (Human Gate)?`,
      });

      if (confirm !== "Yes, Approve Task to Done") return;

      try {
        const doc = readTasksYaml(root, item.specId);
        for (const g of doc.groups) {
          for (const t of g.tasks) {
            if (t.id === item.id) {
              t.status = transitionTask(t.status as "to-review", "approve", "human");
              releaseTaskLease(t as TaskItem);
              break;
            }
          }
        }
        writeTasksYaml(root, item.specId, doc);

        vscode.window.showInformationMessage(`Task #${item.id} approved and marked [done].`);
        refreshAll();
      } catch (err: unknown) {
        vscode.window.showErrorMessage(`Failed to approve task: ${err instanceof Error ? err.message : String(err)}`);
      }
    }),
  );

  // Approve Steering Document
  context.subscriptions.push(
    vscode.commands.registerCommand("spexy.approveSteeringDoc", async (item?: SteeringTreeItem) => {
      const root = getProjectRoot();
      if (!root || !item) return;

      const confirm = await vscode.window.showQuickPick(["Yes, Approve Document", "Cancel"], {
        placeHolder: `Approve "${item.label}" as human reviewer?`,
      });

      if (confirm !== "Yes, Approve Document") return;

      try {
        const docPath = path.join(getSpecflowDir(root), "steering", item.filename);
        const current = fs.existsSync(docPath) ? fs.readFileSync(docPath, "utf-8") : "";
        updateSteeringDocument(root, item.filename, current, { status: "approved", approved_by: "human" }, "human");
        vscode.window.showInformationMessage(`Steering document "${item.label}" approved.`);
        refreshAll();
      } catch (err: unknown) {
        vscode.window.showErrorMessage(`Failed to approve steering doc: ${err instanceof Error ? err.message : String(err)}`);
      }
    }),
  );

  // Set Steering Document Status (Draft / In-Review / Approved)
  context.subscriptions.push(
    vscode.commands.registerCommand("spexy.setSteeringStatus", async (item?: SteeringTreeItem) => {
      const root = getProjectRoot();
      if (!root || !item) return;

      const pick = await vscode.window.showQuickPick(
        [
          { label: "Approved (Human Reviewer)", value: "approved" },
          { label: "In Review", value: "in-review" },
          { label: "Draft", value: "draft" },
        ],
        { placeHolder: `Set status for "${item.label}"` },
      );
      if (!pick) return;

      try {
        const docPath = path.join(getSpecflowDir(root), "steering", item.filename);
        const current = fs.existsSync(docPath) ? fs.readFileSync(docPath, "utf-8") : "";
        updateSteeringDocument(
          root,
          item.filename,
          current,
          { status: pick.value as any, approved_by: pick.value === "approved" ? "human" : null },
          "human",
        );
        vscode.window.showInformationMessage(`Steering doc "${item.label}" set to [${pick.value}].`);
        refreshAll();
      } catch (err: unknown) {
        vscode.window.showErrorMessage(`Failed to set steering status: ${err instanceof Error ? err.message : String(err)}`);
      }
    }),
  );

  // Add Comment directly to Steering Document
  context.subscriptions.push(
    vscode.commands.registerCommand("spexy.addCommentToSteeringDoc", async (item?: SteeringTreeItem) => {
      if (!item) return;
      await vscode.commands.executeCommand("spexy.addComment", {
        filePath: item.fullPath,
        targetType: "document",
      });
    }),
  );

  // Set Task Status (Todo / In-Progress / To-Review / Done)
  context.subscriptions.push(
    vscode.commands.registerCommand("spexy.setTaskStatus", async (item?: TaskTreeItem) => {
      const root = getProjectRoot();
      if (!root || !item) return;

      const pick = await vscode.window.showQuickPick(
        [
          { label: "Todo", value: "todo", description: "Not yet started" },
          { label: "In Progress", value: "in-progress", description: "Currently being implemented" },
          { label: "To Review", value: "to-review", description: "Submitted for human/agent review" },
          { label: "Done", value: "done", description: "Verified & approved" },
        ],
        { placeHolder: `Set status for Task #${item.id}` },
      );
      if (!pick) return;

      try {
        const doc = readTasksYaml(root, item.specId);
        for (const g of doc.groups) {
          for (const t of g.tasks) {
            if (t.id === item.id) {
              t.status = pick.value as any;
              break;
            }
          }
        }
        writeTasksYaml(root, item.specId, doc);
        vscode.window.showInformationMessage(`Task #${item.id} status updated to [${pick.value}].`);
        refreshAll();
      } catch (err: unknown) {
        vscode.window.showErrorMessage(`Failed to update task status: ${err instanceof Error ? err.message : String(err)}`);
      }
    }),
  );

  // Set Task Priority (Low / Medium / High)
  context.subscriptions.push(
    vscode.commands.registerCommand("spexy.setTaskPriority", async (item?: TaskTreeItem) => {
      const root = getProjectRoot();
      if (!root || !item) return;

      const pick = await vscode.window.showQuickPick(
        ["high", "medium", "low"],
        { placeHolder: `Set priority for Task #${item.id}` },
      );
      if (!pick) return;

      try {
        const doc = readTasksYaml(root, item.specId);
        for (const g of doc.groups) {
          for (const t of g.tasks) {
            if (t.id === item.id) {
              t.priority = pick as "high" | "medium" | "low";
              break;
            }
          }
        }
        writeTasksYaml(root, item.specId, doc);
        vscode.window.showInformationMessage(`Task #${item.id} priority set to [${pick}].`);
        refreshAll();
      } catch (err: unknown) {
        vscode.window.showErrorMessage(`Failed to update task priority: ${err instanceof Error ? err.message : String(err)}`);
      }
    }),
  );

  // Add Comment directly to Task
  context.subscriptions.push(
    vscode.commands.registerCommand("spexy.addCommentToTask", async (item?: TaskTreeItem) => {
      const root = getProjectRoot();
      if (!root || !item) return;
      const tasksPath = path.join(getSpecflowDir(root), "specs", item.specId, "tasks.yaml");
      await vscode.commands.executeCommand("spexy.addComment", {
        filePath: tasksPath,
        targetType: "task",
      });
    }),
  );

  // Create New Task in Spec
  context.subscriptions.push(
    vscode.commands.registerCommand("spexy.createTaskInSpec", async (item?: { specId: string }) => {
      const root = getProjectRoot();
      if (!root || !item?.specId) return;

      const title = await vscode.window.showInputBox({
        prompt: `New Task in Spec "${item.specId}"`,
        placeHolder: "Task title, e.g., Implement OAuth2 refresh token rotation",
      });
      if (!title) return;

      try {
        const doc = readTasksYaml(root, item.specId);
        const allTasks = flattenTasks(doc);
        const nextNum = allTasks.length + 1;
        const newTaskId = `${nextNum}.1`;

        if (doc.groups.length === 0) {
          doc.groups.push({ id: "1", name: "Implementation Phase", tasks: [] });
        }

        doc.groups[0].tasks.push({
          id: newTaskId,
          parent_id: null,
          title,
          description: "",
          status: "todo",
          priority: "medium",
          depends_on: [],
          worktree: null,
          branch: null,
          locked_at: null,
          leverage: "",
          files: [],
          requirements_ref: [],
          notes: { security: null, testing: null },
        });

        writeTasksYaml(root, item.specId, doc);
        vscode.window.showInformationMessage(`Task #${newTaskId} "${title}" created.`);
        refreshAll();
      } catch (err: unknown) {
        vscode.window.showErrorMessage(`Failed to create task: ${err instanceof Error ? err.message : String(err)}`);
      }
    }),
  );

  // Delete / Dismiss Comment
  context.subscriptions.push(
    vscode.commands.registerCommand("spexy.deleteComment", async (arg0?: unknown, arg1?: unknown) => {
      const root = getProjectRoot();
      if (!root) return;

      let commentId: string | undefined;
      if (arg0 instanceof CommentTreeItem) {
        commentId = arg0.comment.id;
      } else if (arg0 && typeof arg0 === "object" && "id" in arg0 && typeof (arg0 as { id: unknown }).id === "string") {
        commentId = (arg0 as { id: string }).id;
      } else {
        const thread = (arg1 && typeof arg1 === "object" && "comments" in arg1 ? arg1 : (arg0 && typeof arg0 === "object" && "comments" in arg0 ? arg0 : undefined)) as vscode.CommentThread | undefined;
        if (thread) {
          commentId = commentController.getCommentIdForThread(thread);
        }
      }
      if (!commentId) return;

      try {
        deleteComment(root, commentId);
        vscode.window.showInformationMessage(`Comment "${commentId}" deleted.`);
        refreshAll();
      } catch (err: unknown) {
        vscode.window.showErrorMessage(`Failed to delete comment: ${err instanceof Error ? err.message : String(err)}`);
      }
    }),
  );

  // Open Comment Location in Editor
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "spexy.openCommentLocation",
      async (commentOrItem?: CommentItem | CommentTreeItem) => {
        const root = getProjectRoot();
        if (!root) return;

        const comment: CommentItem | undefined =
          commentOrItem instanceof CommentTreeItem
            ? commentOrItem.comment
            : commentOrItem;

        if (!comment) return;

        const { filePath, line } = resolveCommentLocation(root, comment);
        if (filePath && fs.existsSync(filePath)) {
          try {
            const doc = await vscode.workspace.openTextDocument(filePath);
            const editor = await vscode.window.showTextDocument(doc, {
              selection: new vscode.Range(line, 0, line, 0),
              preview: false,
            });
            editor.revealRange(
              new vscode.Range(line, 0, line, 0),
              vscode.TextEditorRevealType.InCenter,
            );
          } catch (err: unknown) {
            vscode.window.showErrorMessage(
              `Could not open file: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
        } else {
          const action = await vscode.window.showInformationMessage(
            `Comment [${comment.id}]: "${comment.instruction}"`,
            "Open in Dashboard",
          );
          if (action === "Open in Dashboard") {
            void SpexyDashboardPanel.createOrShow(context.extensionUri, "/comments");
          }
        }
      },
    ),
  );

  // Toggle / Filter Comments View
  context.subscriptions.push(
    vscode.commands.registerCommand("spexy.toggleCommentsFilter", async () => {
      const current = commentsProvider.getFilter();
      const pick = await vscode.window.showQuickPick(
        [
          {
            label: "$(clock) Pending Comments",
            description: current === "pending" ? "(Active)" : undefined,
            value: "pending" as const,
          },
          {
            label: "$(check) Reviewed / Resolved Comments",
            description: current === "reviewed" ? "(Active)" : undefined,
            value: "reviewed" as const,
          },
          {
            label: "$(list-unordered) All Comments",
            description: current === "all" ? "(Active)" : undefined,
            value: "all" as const,
          },
        ],
        { placeHolder: `Filter Comments View (Currently: ${current})` },
      );

      if (pick) {
        commentsProvider.setFilter(pick.value);
        vscode.window.showInformationMessage(`Comments view filtered to: ${pick.value}`);
      }
    }),
  );

  // 5. Watch for workspace changes to auto-refresh trees & status bar with debounce
  let debounceTimer: NodeJS.Timeout | undefined;
  const debouncedRefresh = () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      refreshAll();
    }, 250);
  };
  const watcher = vscode.workspace.createFileSystemWatcher("**/.spexy/**/*");
  watcher.onDidChange(debouncedRefresh);
  watcher.onDidCreate(debouncedRefresh);
  watcher.onDidDelete(debouncedRefresh);
  context.subscriptions.push(watcher);
}

export function deactivate() {
  if (SpexyDashboardPanel.currentPanel) {
    SpexyDashboardPanel.currentPanel.dispose();
  }
  SpexyServerManager.getInstance().stopServer();
}
