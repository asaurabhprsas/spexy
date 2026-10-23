#!/usr/bin/env node
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const projectRoot = path.resolve(import.meta.dirname, "..");
const cliBinPath = path.join(projectRoot, "packages", "cli", "dist", "bin.js");
const homeDir = os.homedir();
const localBinDir = path.join(homeDir, ".local", "bin");
const symlinkPath = path.join(localBinDir, "spexy");

console.log("\n📦 [Spexy] Publishing CLI locally...\n");

// 1. Run typecheck
console.log("1/4  Running typecheck (TypeScript 7)...");
execSync("pnpm run typecheck", { cwd: projectRoot, stdio: "inherit" });

// 2. Build Web UI and CLI bundle
console.log("\n2/4  Building Web UI and CLI bundle...");
execSync("pnpm run build", { cwd: projectRoot, stdio: "inherit" });

// 3. Ensure CLI executable
console.log("\n3/4  Configuring CLI executable...");
fs.chmodSync(cliBinPath, 0o755);

// 4. Create symlink in ~/.local/bin
console.log("\n4/4  Installing binary to ~/.local/bin/spexy...");
if (!fs.existsSync(localBinDir)) {
  fs.mkdirSync(localBinDir, { recursive: true });
}

try {
  if (fs.existsSync(symlinkPath) || fs.lstatSync(symlinkPath).isSymbolicLink()) {
    fs.unlinkSync(symlinkPath);
  }
} catch {
  // ignore
}

fs.symlinkSync(cliBinPath, symlinkPath);

// Also maintain backwards-compatible spec-flow alias in ~/.local/bin
const legacySymlink = path.join(localBinDir, "spec-flow");
try {
  if (fs.existsSync(legacySymlink) || fs.lstatSync(legacySymlink).isSymbolicLink()) {
    fs.unlinkSync(legacySymlink);
  }
} catch {}
try {
  fs.symlinkSync(cliBinPath, legacySymlink);
} catch {}

// Verify installation
console.log("\n✅ Verification:");
try {
  const version = execSync(`${symlinkPath} --version`, { encoding: "utf-8" }).trim();
  console.log(`   spexy v${version} installed successfully at ${symlinkPath}`);
} catch (err: any) {
  console.error("   Warning: Could not execute spexy directly:", err.message);
}

// Check PATH
const currentPath = process.env.PATH || "";
if (!currentPath.split(path.delimiter).includes(localBinDir)) {
  console.log(`\n⚠️  Note: '${localBinDir}' is not in your current PATH.`);
  console.log(`   Add it with: export PATH="${localBinDir}:$PATH"`);
} else {
  console.log("\n🚀 CLI is ready for global use!");
  console.log("   Try running: spexy --help");
  console.log("   Try running: spexy dashboard");
}
