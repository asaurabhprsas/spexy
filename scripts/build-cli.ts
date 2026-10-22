#!/usr/bin/env bun
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const projectRoot = path.resolve(import.meta.dirname, "..");
const cliDir = path.join(projectRoot, "packages", "cli");
const cliDistDir = path.join(cliDir, "dist");
const entryFile = path.join(cliDir, "src", "bin.ts");
const outFile = path.join(cliDistDir, "bin.js");

console.log("\n🔨 [Spexy] Building standalone CLI distribution bundle...\n");

// 1. Ensure dist directory exists
if (!fs.existsSync(cliDistDir)) {
  fs.mkdirSync(cliDistDir, { recursive: true });
}

// 2. Bundle with Bun targeting node/bun compatibility
console.log("1/4  Bundling TypeScript CLI into standalone JS executable...");
try {
  execSync(`bun build ${entryFile} --target node --outfile ${outFile}`, {
    cwd: projectRoot,
    stdio: "inherit",
  });
} catch (err: any) {
  console.error("❌ Failed to bundle CLI:", err.message);
  process.exit(1);
}

// 3. Set executable permissions
console.log("\n2/4  Setting executable permissions (0755)...");
fs.chmodSync(outFile, 0o755);

// 4. Ensure README and LICENSE in packages/cli
console.log("\n3/4  Syncing README.md and LICENSE to packages/cli/...");
const rootLicense = path.join(projectRoot, "LICENSE");
const cliLicense = path.join(cliDir, "LICENSE");
if (fs.existsSync(rootLicense)) {
  fs.copyFileSync(rootLicense, cliLicense);
}

// 5. Verification
console.log("\n4/4  Verifying compiled CLI binary execution...");
try {
  const version = execSync(`node ${outFile} --version`, { encoding: "utf-8" }).trim();
  const stat = fs.statSync(outFile);
  const sizeKb = (stat.size / 1024).toFixed(1);
  console.log(`✅ CLI bundled successfully: ${outFile} (${sizeKb} KB)`);
  console.log(`   Binary version check: v${version}`);
} catch (err: any) {
  console.error("❌ Binary execution check failed:", err.message);
  process.exit(1);
}

console.log("\n🚀 CLI distribution bundle ready for packaging!\n");
