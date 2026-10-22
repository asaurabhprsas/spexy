#!/usr/bin/env bun
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const projectRoot = path.resolve(import.meta.dirname, "..");
const cliDir = path.join(projectRoot, "packages", "cli");
const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");

console.log("\n🚀 [Spexy] Preparing Alpha Release Publication...\n");

// 1. Strict Typecheck
console.log("1/6  Running TypeScript strict typecheck...");
execSync("bun run typecheck", { cwd: projectRoot, stdio: "inherit" });

// 2. Automated Tests
console.log("\n2/6  Running full automated test suite...");
execSync('NO_PROXY="*" bun test', { cwd: projectRoot, stdio: "inherit" });

// 3. Build UI & CLI
console.log("\n3/6  Building Web UI bundle and standalone CLI executable...");
execSync("bun run build", { cwd: projectRoot, stdio: "inherit" });

// 4. Pre-flight health check on built binary
console.log("\n4/6  Running pre-flight workspace diagnostic with compiled binary...");
execSync("./packages/cli/dist/bin.js doctor --compact", { cwd: projectRoot, stdio: "inherit" });

// 5. Inspect NPM package tarball
console.log("\n5/6  Inspecting NPM package contents (dry-run)...");
execSync("npm pack --dry-run", { cwd: cliDir, stdio: "inherit" });

const pkgJson = JSON.parse(fs.readFileSync(path.join(cliDir, "package.json"), "utf-8"));
console.log(`\n📦 Target Package: ${pkgJson.name}@${pkgJson.version}`);
console.log(`🏷️  NPM Tag: ${pkgJson.publishConfig?.tag || "alpha"}`);
console.log(`🌐 Access: ${pkgJson.publishConfig?.access || "public"}`);

// 6. Publish or Dry Run exit
if (isDryRun) {
  console.log("\n✅ Dry-run completed successfully! Package is ready for release.");
  console.log("   To publish to NPM registry, run: bun run release:alpha\n");
  process.exit(0);
}

console.log("\n6/6  Publishing to NPM registry...");
try {
  execSync("npm publish --tag alpha --access public", { cwd: cliDir, stdio: "inherit" });
  console.log(`\n🎉 Successfully published ${pkgJson.name}@${pkgJson.version} to NPM!`);
  console.log(`\nUsers can now install or run it via:`);
  console.log(`   npx ${pkgJson.name}@alpha doctor --compact`);
  console.log(`   npm install -g ${pkgJson.name}@alpha\n`);
} catch (err: any) {
  console.error("\n❌ Failed to publish to NPM registry:", err.message);
  console.error("   Ensure you are logged into npm (npm login) or have NPM_TOKEN set.");
  process.exit(1);
}
