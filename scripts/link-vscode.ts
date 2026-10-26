#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const projectRoot = path.resolve(import.meta.dirname, "..");
const extensionSrc = path.join(projectRoot, "packages", "vscode-extension");
const homeDir = os.homedir();
const extensionsDir = path.join(homeDir, ".vscode", "extensions");
const extPkg = JSON.parse(fs.readFileSync(path.join(extensionSrc, "package.json"), "utf-8"));
const targetLink = path.join(extensionsDir, `spexy.spexy-vscode-${extPkg.version}`);

console.log("\n📦 [Spexy] Linking VS Code extension locally...\n");

if (!fs.existsSync(extensionsDir)) {
  fs.mkdirSync(extensionsDir, { recursive: true });
}

try {
  if (fs.existsSync(targetLink) || fs.lstatSync(targetLink).isSymbolicLink()) {
    fs.rmSync(targetLink, { recursive: true, force: true });
  }
} catch {
  // ignore
}

fs.symlinkSync(extensionSrc, targetLink, "dir");

console.log(`✅ Extension symlinked to ${targetLink}`);
console.log("👉 In VS Code, run command: 'Developer: Reload Window' to activate.");
