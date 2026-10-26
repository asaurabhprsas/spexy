import * as vscode from "vscode";
import * as http from "node:http";
import * as path from "node:path";
import * as fs from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";

export class SpexyServerManager {
  private static instance: SpexyServerManager;
  private serverProcess: ChildProcess | null = null;
  private outputChannel: vscode.OutputChannel;
  private startingPromise: Promise<string> | null = null;

  private constructor() {
    this.outputChannel = vscode.window.createOutputChannel("Spexy Server");
  }

  public static getInstance(): SpexyServerManager {
    if (!SpexyServerManager.instance) {
      SpexyServerManager.instance = new SpexyServerManager();
    }
    return SpexyServerManager.instance;
  }

  public async isServerRunning(port = 4200): Promise<boolean> {
    return new Promise((resolve) => {
      const req = http.get(`http://127.0.0.1:${port}/api/status`, { timeout: 1500 }, (res) => {
        resolve(res.statusCode === 200);
      });
      req.on("error", () => resolve(false));
      req.on("timeout", () => {
        req.destroy();
        resolve(false);
      });
    });
  }

  public async ensureServerRunning(projectRoot: string, port = 4200): Promise<string> {
    if (await this.isServerRunning(port)) {
      return `http://127.0.0.1:${port}`;
    }

    if (this.startingPromise) {
      return this.startingPromise;
    }

    this.startingPromise = this.startServer(projectRoot, port);
    try {
      return await this.startingPromise;
    } finally {
      this.startingPromise = null;
    }
  }

  private async startServer(projectRoot: string, port = 4200): Promise<string> {
    this.outputChannel.appendLine(`[Spexy] Starting dashboard server on port ${port}...`);

    // Check possible locations for CLI executable
    const candidates = [
      path.join(projectRoot, "packages", "cli", "dist", "bin.js"),
      path.join(projectRoot, "node_modules", ".bin", "spexy"),
      "spexy",
    ];

    let cliPath: string | null = null;
    let isNodeScript = false;

    for (const cand of candidates) {
      if (cand === "spexy") {
        cliPath = cand;
        break;
      }
      if (fs.existsSync(cand)) {
        cliPath = cand;
        isNodeScript = cand.endsWith(".js") || cand.endsWith(".ts");
        break;
      }
    }

    if (!cliPath) {
      throw new Error("Could not find Spexy CLI binary. Ensure @spexy/cli is built.");
    }

    const command = isNodeScript ? process.execPath : cliPath;
    const args = isNodeScript ? [cliPath, "dashboard", "--port", String(port)] : ["dashboard", "--port", String(port)];

    this.outputChannel.appendLine(`[Spexy] Executing: ${command} ${args.join(" ")}`);

    const child = spawn(command, args, {
      cwd: projectRoot,
      env: { ...process.env, NODE_ENV: "production" },
      stdio: ["ignore", "pipe", "pipe"],
    });

    this.serverProcess = child;

    child.stdout?.on("data", (data: Buffer) => {
      this.outputChannel.append(data.toString());
    });

    child.stderr?.on("data", (data: Buffer) => {
      this.outputChannel.append(data.toString());
    });

    child.on("error", (err) => {
      this.outputChannel.appendLine(`[Spexy] Server process error: ${err.message}`);
      this.serverProcess = null;
    });

    child.on("exit", (code) => {
      this.outputChannel.appendLine(`[Spexy] Server process exited with code ${code}`);
      this.serverProcess = null;
    });

    // Poll until server responds
    const maxRetries = 40; // 10 seconds total
    for (let i = 0; i < maxRetries; i++) {
      await new Promise((r) => setTimeout(r, 250));
      if (await this.isServerRunning(port)) {
        this.outputChannel.appendLine(`[Spexy] Server is active at http://127.0.0.1:${port}`);
        return `http://127.0.0.1:${port}`;
      }
    }

    this.stopServer();
    throw new Error(`Dashboard server failed to start within 10s on port ${port}`);
  }

  public stopServer(): void {
    if (this.serverProcess) {
      this.outputChannel.appendLine("[Spexy] Stopping dashboard server...");
      try {
        this.serverProcess.kill("SIGTERM");
      } catch {
        // ignore
      }
      this.serverProcess = null;
    }
  }

  public async restartServer(projectRoot: string, port = 4200): Promise<string> {
    this.stopServer();
    await new Promise((r) => setTimeout(r, 500));
    return this.ensureServerRunning(projectRoot, port);
  }
}
