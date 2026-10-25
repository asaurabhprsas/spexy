import * as vscode from "vscode";
import { findCentralProjectRoot } from "@spexy/core";
import { SpexyServerManager } from "./serverManager";

export class SpexyDashboardPanel {
  public static currentPanel: SpexyDashboardPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];
  private _currentRoute: string = "/";
  private _port: number = 4200;

  public static async createOrShow(
    extensionUri: vscode.Uri,
    route: string = "/",
    port: number = 4200,
  ) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (SpexyDashboardPanel.currentPanel) {
      SpexyDashboardPanel.currentPanel._panel.reveal(column);
      SpexyDashboardPanel.currentPanel.navigate(route);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "spexyDashboard",
      "Spexy Full Workspace",
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      },
    );

    SpexyDashboardPanel.currentPanel = new SpexyDashboardPanel(panel, extensionUri, route, port);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly extensionUri: vscode.Uri,
    route: string,
    port: number,
  ) {
    this._panel = panel;
    this._currentRoute = route;
    this._port = port;

    // Handle messages from Webview
    this._panel.webview.onDidReceiveMessage(
      async (message: { command: string; route?: string; url?: string }) => {
        switch (message.command) {
          case "navigate":
            if (message.route) this._currentRoute = message.route;
            break;
          case "openExternal":
            if (message.url) {
              await vscode.env.openExternal(vscode.Uri.parse(message.url));
            }
            break;
          case "refresh":
            await this.updateHtml();
            break;
          case "restartServer": {
            const folders = vscode.workspace.workspaceFolders;
            if (folders && folders.length > 0) {
              const root = findCentralProjectRoot(folders[0].uri.fsPath);
              vscode.window.showInformationMessage("Restarting Spexy Dashboard server...");
              await SpexyServerManager.getInstance().restartServer(root, this._port);
              await this.updateHtml();
              vscode.window.showInformationMessage("Spexy Dashboard server restarted.");
            }
            break;
          }
          case "runDoctor":
            await vscode.commands.executeCommand("spexy.runDoctor");
            break;
        }
      },
      null,
      this._disposables,
    );

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    void this.initialize();
  }

  public navigate(route: string) {
    this._currentRoute = route;
    this._panel.webview.postMessage({ command: "setRoute", route });
  }

  private async initialize() {
    this.renderLoadingHtml("Connecting to Spexy dashboard daemon...");

    const folders = vscode.workspace.workspaceFolders;
    if (folders && folders.length > 0) {
      const root = findCentralProjectRoot(folders[0].uri.fsPath);
      try {
        await SpexyServerManager.getInstance().ensureServerRunning(root, this._port);
      } catch (err: unknown) {
        this.renderErrorHtml(err instanceof Error ? err.message : String(err));
        return;
      }
    }

    await this.updateHtml();
  }

  private renderLoadingHtml(message: string) {
    this._panel.webview.html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <style>
          body {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            font-family: var(--vscode-font-family);
          }
          .spinner {
            width: 36px;
            height: 36px;
            border: 3px solid rgba(255, 60, 0, 0.2);
            border-top-color: #FF3C00;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
            margin-bottom: 16px;
          }
          @keyframes spin { to { transform: rotate(360deg); } }
          .title { font-size: 16px; font-weight: 600; margin-bottom: 6px; }
          .desc { font-size: 13px; color: var(--vscode-descriptionForeground); }
        </style>
      </head>
      <body>
        <div class="spinner"></div>
        <div class="title">Spexy SDD Dashboard</div>
        <div class="desc">${message}</div>
      </body>
      </html>
    `;
  }

  private renderErrorHtml(error: string) {
    this._panel.webview.html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <style>
          body {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            font-family: var(--vscode-font-family);
            text-align: center;
            padding: 24px;
          }
          .icon { font-size: 40px; margin-bottom: 12px; }
          .title { font-size: 18px; font-weight: 600; margin-bottom: 8px; color: var(--vscode-errorForeground); }
          .msg { font-size: 13px; margin-bottom: 20px; max-width: 500px; color: var(--vscode-descriptionForeground); font-family: monospace; }
          button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            font-size: 13px;
            cursor: pointer;
          }
          button:hover { background: var(--vscode-button-hoverBackground); }
        </style>
      </head>
      <body>
        <div class="icon">⚠️</div>
        <div class="title">Dashboard Connection Failed</div>
        <div class="msg">${error}</div>
        <button onclick="vscode.postMessage({ command: 'refresh' })">Retry Connection</button>
        <script>const vscode = acquireVsCodeApi();</script>
      </body>
      </html>
    `;
  }

  private async updateHtml() {
    const serverUrl = `http://127.0.0.1:${this._port}`;
    const initialUrl = `${serverUrl}${this._currentRoute}`;

    this._panel.webview.html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src vscode-resource: https: http: data: blob:; script-src 'unsafe-inline' 'unsafe-eval' vscode-resource: https: http:; style-src 'unsafe-inline' vscode-resource: https: http:; frame-src http://127.0.0.1:* http://localhost:*; connect-src ws://127.0.0.1:* ws://localhost:* http://127.0.0.1:* http://localhost:*; font-src vscode-resource: https: http: data:;">
        <style>
          * { box-sizing: border-box; }
          body, html {
            margin: 0;
            padding: 0;
            width: 100%;
            height: 100%;
            overflow: hidden;
            background: #090a0f;
            display: flex;
            flex-direction: column;
            font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
          }

          #spexy-toolbar {
            height: 38px;
            background: #0e1117;
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 12px;
            user-select: none;
            flex-shrink: 0;
          }

          .brand-group {
            display: flex;
            align-items: center;
            gap: 8px;
          }

          .logo-badge {
            background: #FF3C00;
            color: white;
            font-weight: 700;
            font-size: 11px;
            padding: 2px 6px;
            border-radius: 4px;
            letter-spacing: 0.5px;
          }

          .live-status {
            display: flex;
            align-items: center;
            gap: 5px;
            font-size: 11px;
            color: #10b981;
            font-family: monospace;
          }

          .status-dot {
            width: 7px;
            height: 7px;
            border-radius: 50%;
            background: #10b981;
            box-shadow: 0 0 6px rgba(16, 185, 129, 0.6);
          }

          .nav-tabs {
            display: flex;
            align-items: center;
            gap: 4px;
          }

          .nav-btn {
            background: transparent;
            border: 1px solid transparent;
            color: #94a3b8;
            padding: 4px 10px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.15s ease;
          }

          .nav-btn:hover {
            color: #f1f5f9;
            background: rgba(255, 255, 255, 0.06);
          }

          .nav-btn.active {
            color: #f1f5f9;
            background: rgba(255, 255, 255, 0.1);
            border-color: rgba(255, 255, 255, 0.15);
          }

          .actions-group {
            display: flex;
            align-items: center;
            gap: 6px;
          }

          .icon-btn {
            background: transparent;
            border: 1px solid rgba(255, 255, 255, 0.08);
            color: #94a3b8;
            padding: 3px 8px;
            border-radius: 4px;
            font-size: 11px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 4px;
            transition: all 0.15s;
          }

          .icon-btn:hover {
            color: white;
            background: rgba(255, 255, 255, 0.08);
            border-color: rgba(255, 255, 255, 0.2);
          }

          #spexy-frame {
            flex: 1;
            width: 100%;
            height: calc(100% - 38px);
            border: none;
            background: #090a0f;
          }
        </style>
      </head>
      <body>
        <div id="spexy-toolbar">
          <div class="brand-group">
            <span class="logo-badge">SPEXY</span>
            <div class="live-status">
              <span class="status-dot"></span>
              <span>127.0.0.1:${this._port}</span>
            </div>
          </div>

          <div class="nav-tabs">
            <button class="nav-btn ${this._currentRoute.includes("view=kanban") ? "active" : ""}" onclick="navigate('/tasks?view=kanban')">📊 Kanban Board</button>
            <button class="nav-btn ${this._currentRoute.includes("view=list") ? "active" : ""}" onclick="navigate('/tasks?view=list')">📋 Tasks & Sublists</button>
            <button class="nav-btn ${this._currentRoute.includes("view=dag") ? "active" : ""}" onclick="navigate('/tasks?view=dag')">🌐 DAG Visualizer</button>
            <button class="nav-btn ${this._currentRoute.startsWith("/specs") ? "active" : ""}" onclick="navigate('/specs')">📐 Specifications</button>
            <button class="nav-btn ${this._currentRoute.startsWith("/steering") ? "active" : ""}" onclick="navigate('/steering')">📜 Steering</button>
            <button class="nav-btn ${this._currentRoute === "/" ? "active" : ""}" onclick="navigate('/')">🏠 Overview</button>
            <button class="nav-btn" onclick="runDoctor()">🩺 Doctor</button>
          </div>

          <div class="actions-group">
            <button class="icon-btn" onclick="reloadFrame()" title="Reload Frame">🔄</button>
            <button class="icon-btn" onclick="openExternal()" title="Open in External Browser">↗️ Browser</button>
            <button class="icon-btn" onclick="restartServer()" title="Restart Spexy Server">⚡ Restart</button>
          </div>
        </div>

        <iframe
          src="${initialUrl}"
          id="spexy-frame"
          allow="clipboard-read; clipboard-write;"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads"
        ></iframe>

        <script>
          const vscode = acquireVsCodeApi();
          const frame = document.getElementById('spexy-frame');

          function navigate(route) {
            document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
            event.target.classList.add('active');
            frame.src = 'http://127.0.0.1:${this._port}' + route;
            vscode.postMessage({ command: 'navigate', route: route });
          }

          function reloadFrame() {
            frame.src = frame.src;
          }

          function openExternal() {
            vscode.postMessage({ command: 'openExternal', url: frame.src });
          }

          function restartServer() {
            vscode.postMessage({ command: 'restartServer' });
          }

          function runDoctor() {
            vscode.postMessage({ command: 'runDoctor' });
          }

          window.addEventListener('message', event => {
            const msg = event.data;
            if (msg.command === 'setRoute') {
              frame.src = 'http://127.0.0.1:${this._port}' + msg.route;
              document.querySelectorAll('.nav-btn').forEach(btn => {
                const onclickAttr = btn.getAttribute('onclick') || '';
                btn.classList.toggle('active', onclickAttr.includes(msg.route));
              });
            }
          });
        </script>
      </body>
      </html>
    `;
  }

  public dispose() {
    SpexyDashboardPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) x.dispose();
    }
  }
}
