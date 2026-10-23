#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import * as esbuild from "esbuild";

const projectRoot = path.resolve(import.meta.dirname, "..");
const cliDir = path.join(projectRoot, "packages", "cli");
const cliDistDir = path.join(cliDir, "dist");
const entryFile = path.join(cliDir, "src", "bin.ts");
const outFile = path.join(cliDistDir, "bin.js");

console.log("\n🔨 [Spexy] Building standalone CLI distribution bundle...\n");

// 1. Ensure dist directory exists & sync version from root package.json
if (!fs.existsSync(cliDistDir)) {
  fs.mkdirSync(cliDistDir, { recursive: true });
}
const rootPkg = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf-8"));
const cliPkgPath = path.join(cliDir, "package.json");
const cliPkg = JSON.parse(fs.readFileSync(cliPkgPath, "utf-8"));
if (cliPkg.version !== rootPkg.version) {
  cliPkg.version = rootPkg.version;
  fs.writeFileSync(cliPkgPath, JSON.stringify(cliPkg, null, 2) + "\n", "utf-8");
}

// 2. Bundle with esbuild targeting Node.js
console.log("1/4  Bundling TypeScript CLI into standalone JS executable...");
try {
  await esbuild.build({
    entryPoints: [entryFile],
    bundle: true,
    platform: "node",
    target: "node22",
    format: "esm",
    banner: {
      js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
    },
    outfile: outFile,
  });
} catch (err: any) {
  console.error("❌ Failed to bundle CLI:", err.message);
  process.exit(1);
}

// 3. Set executable permissions
console.log("\n2/4  Setting executable permissions (0755)...");
fs.chmodSync(outFile, 0o755);

// 4. Ensure README and LICENSE in packages/cli
console.log("\n3/5  Syncing README.md and LICENSE to packages/cli/...");
const rootLicense = path.join(projectRoot, "LICENSE");
const cliLicense = path.join(cliDir, "LICENSE");
if (fs.existsSync(rootLicense)) {
  fs.copyFileSync(rootLicense, cliLicense);
}

// 5. Ensure root scaffold/ synced to packages/cli/scaffold/
console.log("\n4/5  Syncing root scaffold/ to packages/cli/scaffold/...");
const rootScaffold = path.join(projectRoot, "scaffold");
const cliScaffold = path.join(cliDir, "scaffold");
if (fs.existsSync(rootScaffold)) {
  fs.cpSync(rootScaffold, cliScaffold, { recursive: true });
}

// 6. Verification
console.log("\n5/5  Verifying compiled CLI binary execution...");
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
