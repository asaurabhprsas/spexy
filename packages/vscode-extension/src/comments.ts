import * as vscode from "vscode";
import path from "node:path";
import fs from "node:fs";
import {
  findCentralProjectRoot,
  listComments,
  listSpecs,
  addComment,
  resolveComment,
  type CommentItem,
} from "@spexy/core";

export class SpexyCommentController implements vscode.Disposable {
  private commentController: vscode.CommentController;
  private threadsByCommentId = new Map<string, vscode.CommentThread>();
  private fileWatcher?: vscode.FileSystemWatcher;
  private disposables: vscode.Disposable[] = [];

  constructor(private context: vscode.ExtensionContext) {
    this.commentController = vscode.comments.createCommentController(
      "spexy-comments",
      "Spexy Review Comments",
    );
    this.commentController.commentingRangeProvider = {
      provideCommentingRanges: (document: vscode.TextDocument) => {
        const lineCount = document.lineCount;
        return [new vscode.Range(0, 0, lineCount - 1, 0)];
      },
    };
    this.disposables.push(this.commentController);

    this.registerCommands();
    this.setupFileWatcher();
    this.syncComments();

    // Re-sync when documents open
    this.disposables.push(
      vscode.workspace.onDidOpenTextDocument(() => {
        this.syncComments();
      }),
    );
  }

  private getProjectRoot(): string | null {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) return null;
    return findCentralProjectRoot(folders[0].uri.fsPath);
  }

  public getCommentIdForThread(thread: vscode.CommentThread): string | undefined {
    for (const [id, t] of this.threadsByCommentId.entries()) {
      if (t === thread) {
        return id;
      }
    }
    return undefined;
  }

  private registerCommands() {
    this.disposables.push(
      vscode.commands.registerCommand(
        "spexy.addComment",
        async (targetOrReply?: vscode.CommentReply | { filePath?: string; file?: string; line?: number; targetType?: string }) => {
          if (targetOrReply && "thread" in targetOrReply) {
            await this.createCommentFromReply(targetOrReply);
            return;
          }

          const projectRoot = this.getProjectRoot();
          if (!projectRoot) return;

          let targetRelPath: string | undefined;
          let startLine = 1;
          let endLine = 1;
          let snippet = "";
          let targetType = "code";

          if (targetOrReply && ("filePath" in targetOrReply || "file" in targetOrReply)) {
            const rawPath = targetOrReply.filePath || targetOrReply.file || "";
            targetRelPath = path.isAbsolute(rawPath) ? path.relative(projectRoot, rawPath) : rawPath;
            startLine = targetOrReply.line || 1;
            endLine = startLine;
            targetType = targetOrReply.targetType || (targetRelPath.includes("steering") ? "document" : targetRelPath.includes("specs") ? "spec" : "code");
          } else {
            let editor = vscode.window.activeTextEditor;
            if (!editor && vscode.window.visibleTextEditors.length > 0) {
              editor = vscode.window.visibleTextEditors[0];
            }

            if (editor) {
              targetRelPath = path.relative(projectRoot, editor.document.uri.fsPath);
              const selection = editor.selection;
              startLine = selection.start.line + 1;
              endLine = selection.end.line + 1;
              snippet = editor.document.getText(selection) || editor.document.lineAt(selection.start.line).text.trim();
              if (targetRelPath.includes("steering/")) targetType = "document";
              else if (targetRelPath.includes("specs/")) targetType = targetRelPath.endsWith("tasks.yaml") ? "task" : "spec";
            } else {
              // Interactive QuickPick: Choose a document or file to comment on
              interface PickItem extends vscode.QuickPickItem {
                fileRelPath: string;
                docType: "document" | "spec" | "code" | "task";
              }

              const items: PickItem[] = [
                { label: "$(law) Product Vision & Problem", description: ".spexy/steering/product.md", fileRelPath: ".spexy/steering/product.md", docType: "document" },
                { label: "$(law) Tech Stack & Architecture", description: ".spexy/steering/tech.md", fileRelPath: ".spexy/steering/tech.md", docType: "document" },
                { label: "$(law) Project Structure & Conventions", description: ".spexy/steering/structure.md", fileRelPath: ".spexy/steering/structure.md", docType: "document" },
              ];

              try {
                const specs = listSpecs(projectRoot);
                for (const s of specs) {
                  items.push({
                    label: `$(book) ${s.name} - Requirements`,
                    description: `.spexy/specs/${s.id}/requirements.md`,
                    fileRelPath: `.spexy/specs/${s.id}/requirements.md`,
                    docType: "spec",
                  });
                  items.push({
                    label: `$(symbol-ruler) ${s.name} - Design`,
                    description: `.spexy/specs/${s.id}/design.md`,
                    fileRelPath: `.spexy/specs/${s.id}/design.md`,
                    docType: "spec",
                  });
                  items.push({
                    label: `$(checklist) ${s.name} - Tasks DAG`,
                    description: `.spexy/specs/${s.id}/tasks.yaml`,
                    fileRelPath: `.spexy/specs/${s.id}/tasks.yaml`,
                    docType: "task",
                  });
                }
              } catch {}

              const pick = await vscode.window.showQuickPick(items, {
                placeHolder: "Select a Steering or Specification document to leave a comment on",
              });

              if (!pick) return;

              targetRelPath = pick.fileRelPath;
              targetType = pick.docType;

              const lineInput = await vscode.window.showInputBox({
                prompt: `Enter line number in ${path.basename(targetRelPath)} (default: 1)`,
                value: "1",
              });
              if (lineInput) {
                const parsed = parseInt(lineInput, 10);
                if (!isNaN(parsed) && parsed > 0) {
                  startLine = parsed;
                  endLine = parsed;
                }
              }

              // Open document in editor for context
              const fullTarget = path.resolve(projectRoot, targetRelPath);
              if (fs.existsSync(fullTarget)) {
                try {
                  const doc = await vscode.workspace.openTextDocument(fullTarget);
                  await vscode.window.showTextDocument(doc, { selection: new vscode.Range(startLine - 1, 0, startLine - 1, 0) });
                } catch {}
              }
            }
          }

          const instruction = await vscode.window.showInputBox({
            prompt: `Review instruction for ${path.basename(targetRelPath || "file")}:${startLine}`,
            placeHolder: "e.g., Clarify architectural boundary for auth tokens...",
          });

          if (!instruction) return;

          const comment = addComment(projectRoot, {
            target_file: targetRelPath,
            target_type: targetType as any,
            author: "human",
            instruction,
            anchor: {
              start_line: startLine,
              end_line: endLine,
              anchor_text: snippet,
              context_before: "",
            },
          });

          vscode.window.showInformationMessage(`Spexy comment "${comment.id}" created on ${path.basename(targetRelPath || "file")}.`);
          this.syncComments();
        },
      ),
    );

    this.disposables.push(
      vscode.commands.registerCommand(
        "spexy.resolveComment",
        async (arg0?: unknown, arg1?: unknown) => {
          const projectRoot = this.getProjectRoot();
          if (!projectRoot) return;

          let commentId: string | null = null;
          let thread: vscode.CommentThread | undefined;

          if (arg0 && typeof arg0 === "object") {
            if ("id" in arg0 && typeof (arg0 as { id: unknown }).id === "string") {
              commentId = (arg0 as { id: string }).id;
            } else if ("comments" in arg0) {
              thread = arg0 as vscode.CommentThread;
            }
          }
          if (!thread && arg1 && typeof arg1 === "object" && "comments" in arg1) {
            thread = arg1 as vscode.CommentThread;
          }

          if (!commentId && thread) {
            commentId = this.getCommentIdForThread(thread) || null;
          }

          if (!commentId) {
            vscode.window.showErrorMessage("Could not resolve comment: ID not found.");
            return;
          }

          const note = await vscode.window.showInputBox({
            prompt: "Resolution note (optional)",
            placeHolder: "Addressed and verified.",
          });

          try {
            resolveComment(projectRoot, commentId, note || "Resolved via VSCode extension.", { purge: true });
            const threadToDispose = this.threadsByCommentId.get(commentId);
            if (threadToDispose) {
              threadToDispose.dispose();
              this.threadsByCommentId.delete(commentId);
            }
            vscode.window.showInformationMessage(`Spexy comment "${commentId}" resolved.`);
            this.syncComments();
          } catch (err: unknown) {
            vscode.window.showErrorMessage(`Error resolving comment: ${err instanceof Error ? err.message : String(err)}`);
          }
        },
      ),
    );

    this.disposables.push(
      vscode.commands.registerCommand(
        "spexy.saveComment",
        async (reply?: vscode.CommentReply) => {
          if (reply && "thread" in reply) {
            await this.createCommentFromReply(reply);
            return;
          }
          await vscode.commands.executeCommand("spexy.addComment");
        },
      ),
    );

    this.disposables.push(
      vscode.commands.registerCommand(
        "spexy.cancelComment",
        async (replyOrThread?: vscode.CommentReply | vscode.CommentThread) => {
          if (!replyOrThread) return;
          const thread = "thread" in replyOrThread ? replyOrThread.thread : replyOrThread;
          if (thread && thread.comments.length === 0) {
            thread.dispose();
          }
        },
      ),
    );
  }

  private async createCommentFromReply(reply: vscode.CommentReply) {
    const projectRoot = this.getProjectRoot();
    if (!projectRoot) return;

    if (!reply.text || !reply.text.trim()) {
      vscode.window.showWarningMessage("Please enter a comment instruction before saving.");
      return;
    }

    const thread = reply.thread;
    const relPath = path.relative(projectRoot, thread.uri.fsPath);
    const range = thread.range || new vscode.Range(0, 0, 0, 0);
    const startLine = range.start.line + 1;
    const endLine = range.end.line + 1;

    let snippet = "";
    try {
      const doc = await vscode.workspace.openTextDocument(thread.uri);
      snippet = doc.getText(range) || doc.lineAt(range.start.line).text.trim();
    } catch {
      // fallback
    }

    const targetType = relPath.includes("steering")
      ? "document"
      : relPath.includes("specs")
      ? (relPath.endsWith("tasks.yaml") ? "task" : "spec")
      : "code";

    const comment = addComment(projectRoot, {
      target_file: relPath,
      target_type: targetType as any,
      author: "human",
      instruction: reply.text.trim(),
      anchor: {
        start_line: startLine,
        end_line: endLine,
        anchor_text: snippet,
        context_before: "",
      },
    });

    reply.thread.label = `Spexy Review: ${comment.id}`;
    reply.thread.comments = [
      ...reply.thread.comments,
      {
        author: { name: "👤 Human Reviewer" },
        body: new vscode.MarkdownString(`**[${comment.id}]** ${reply.text.trim()}`),
        mode: vscode.CommentMode.Preview,
        contextValue: "spexyComment",
      },
    ];

    this.threadsByCommentId.set(comment.id, reply.thread);
    vscode.window.showInformationMessage(`Spexy comment "${comment.id}" saved.`);
  }

  private setupFileWatcher() {
    this.fileWatcher = vscode.workspace.createFileSystemWatcher("**/.spexy/comments/*.yaml");
    this.fileWatcher.onDidChange(() => this.syncComments());
    this.fileWatcher.onDidCreate(() => this.syncComments());
    this.fileWatcher.onDidDelete(() => this.syncComments());
    this.disposables.push(this.fileWatcher);
  }

  public syncComments() {
    const projectRoot = this.getProjectRoot();
    if (!projectRoot) return;

    let pending: CommentItem[] = [];
    try {
      pending = listComments(projectRoot, { pendingOnly: true });
    } catch {
      return;
    }

    // Existing IDs
    const activeIds = new Set(pending.map((c) => c.id));

    // Dispose old threads that are no longer pending
    for (const [id, thread] of this.threadsByCommentId.entries()) {
      if (!activeIds.has(id)) {
        thread.dispose();
        this.threadsByCommentId.delete(id);
      }
    }

    // Render active comments
    for (const c of pending) {
      if (!c.target_file) continue;

      const fullPath = path.resolve(projectRoot, c.target_file);
      if (!fs.existsSync(fullPath)) continue;

      const uri = vscode.Uri.file(fullPath);
      const startLine = c.anchor ? Math.max(0, c.anchor.start_line - 1) : 0;
      const endLine = c.anchor ? Math.max(0, c.anchor.end_line - 1) : 0;
      const range = new vscode.Range(startLine, 0, endLine, 0);

      let thread = this.threadsByCommentId.get(c.id);
      const commentsData: vscode.Comment[] = [
        {
          author: { name: c.author === "agent" ? "🤖 AI Agent" : "👤 Reviewer" },
          body: new vscode.MarkdownString(`**[${c.id}]** ${c.instruction}`),
          mode: vscode.CommentMode.Preview,
          contextValue: "spexyComment",
        },
      ];
      if (!thread) {
        thread = this.commentController.createCommentThread(uri, range, commentsData);
        thread.label = `Spexy Review: ${c.id}`;
        this.threadsByCommentId.set(c.id, thread);
      } else {
        thread.range = range;
        thread.comments = commentsData;
      }
    }
  }

  public dispose() {
    for (const t of this.threadsByCommentId.values()) {
      t.dispose();
    }
    this.threadsByCommentId.clear();
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
