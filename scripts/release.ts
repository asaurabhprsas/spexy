#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const projectRoot = path.resolve(import.meta.dirname, "..");
const packagesDir = path.join(projectRoot, "packages");

// Monorepo package paths to keep version-synchronized
const packageJsonPaths = [
  path.join(projectRoot, "package.json"),
  path.join(packagesDir, "cli", "package.json"),
  path.join(packagesDir, "core", "package.json"),
  path.join(packagesDir, "ui", "package.json"),
];

interface Semver {
  major: number;
  minor: number;
  patch: number;
  prerelease: string | null;
  prereleaseNum: number | null;
}

function parseSemver(ver: string): Semver {
  const match = ver.match(/^(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z]+)\.(\d+))?$/);
  if (!match) {
    throw new Error(`Invalid semver version format: "${ver}". Expected format like "1.2.3" or "1.2.3-alpha.0"`);
  }
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4] || null,
    prereleaseNum: match[5] !== undefined ? parseInt(match[5], 10) : null,
  };
}

function bumpVersion(currentVer: string, type: string): string {
  const parsed = parseSemver(currentVer);
  switch (type) {
    case "major":
      return `${parsed.major + 1}.0.0`;
    case "minor":
      return `${parsed.major}.${parsed.minor + 1}.0`;
    case "patch":
      if (parsed.prerelease) {
        return `${parsed.major}.${parsed.minor}.${parsed.patch}`;
      }
      return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
    case "alpha":
    case "beta":
    case "rc":
      if (parsed.prerelease === type && parsed.prereleaseNum !== null) {
        return `${parsed.major}.${parsed.minor}.${parsed.patch}-${type}.${parsed.prereleaseNum + 1}`;
      }
      return `${parsed.major}.${parsed.minor}.${parsed.prerelease ? parsed.patch : parsed.patch + 1}-${type}.0`;
    default:
      // If user provided a specific version (e.g. "0.2.0" or "0.2.0-alpha.5")
      parseSemver(type); // Validate format
      return type;
  }
}

function detectDistTag(ver: string, customTag?: string): string {
  if (customTag) return customTag;
  const match = ver.match(/-([a-zA-Z]+)/);
  return match ? match[1] : "latest";
}

function printHelp() {
  console.log(`
Usage: pnpm release <type|version> [options]

Arguments:
  type           Bump type: patch, minor, major, alpha, beta, rc
  version        Specific target version (e.g. 0.2.0, 0.2.0-alpha.1)

Options:
  --tag <tag>    Override NPM dist-tag (default: auto-detected from version)
  --publish      Immediately publish packages/cli to NPM after verification
  --dry-run      Run validation pipeline without writing changes or git tagging
  --no-git       Sync version in package.json files but skip git commit and tag
  --no-test      Skip running tests (caution: emergency use only)
  -h, --help     Show this help message

Examples:
  pnpm release patch              # Bump patch (0.1.0 -> 0.1.1, tag: latest)
  pnpm release minor              # Bump minor (0.1.0 -> 0.2.0, tag: latest)
  pnpm release alpha              # Bump alpha (0.1.0 -> 0.1.1-alpha.0, tag: alpha)
  pnpm release 0.2.0-beta.1       # Set exact version (tag: beta)
  pnpm release patch --publish    # Bump, build, verify, and publish immediately
`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
    printHelp();
    process.exit(0);
  }

  const targetArg = args.find((a) => !a.startsWith("-"));
  if (!targetArg) {
    console.error("❌ Error: Missing release bump type or target version.");
    printHelp();
    process.exit(1);
  }

  const isDryRun = args.includes("--dry-run");
  const isNoGit = args.includes("--no-git");
  const isNoTest = args.includes("--no-test");
  const isPublish = args.includes("--publish");
  const tagIdx = args.indexOf("--tag");
  const customTag = tagIdx !== -1 && args[tagIdx + 1] ? args[tagIdx + 1] : undefined;

  // Read current version from root package.json
  const rootPkgPath = path.join(projectRoot, "package.json");
  const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, "utf-8"));
  const currentVersion = rootPkg.version || "0.1.0";

  const nextVersion = bumpVersion(currentVersion, targetArg);
  const distTag = detectDistTag(nextVersion, customTag);

  console.log("\n🚀 [Spexy Unified Release]");
  console.log(`   Current version : v${currentVersion}`);
  console.log(`   Target version  : v${nextVersion}`);
  console.log(`   NPM Dist-Tag    : ${distTag}`);
  if (isDryRun) console.log("   Mode            : DRY RUN (no files or git modified)");
  console.log("");

  // 1. Synchronize version in package.json files
  console.log("1/5  Updating monorepo package.json files...");
  for (const p of packageJsonPaths) {
    if (!fs.existsSync(p)) continue;
    const pkg = JSON.parse(fs.readFileSync(p, "utf-8"));
    const relPath = path.relative(projectRoot, p);

    pkg.version = nextVersion;

    // For CLI package, also sync publishConfig tag to match distTag
    if (relPath === "packages/cli/package.json") {
      pkg.publishConfig = {
        ...pkg.publishConfig,
        access: "public",
        tag: distTag,
      };
    }

    if (!isDryRun) {
      fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + "\n", "utf-8");
      console.log(`   ✓ ${relPath} -> ${nextVersion}`);
    } else {
      console.log(`   [dry-run] Would update ${relPath} -> ${nextVersion}`);
    }
  }

  // 2. Strict Typecheck
  console.log("\n2/5  Running strict TypeScript typecheck...");
  execSync("pnpm run typecheck", { cwd: projectRoot, stdio: "inherit" });

  // 3. Build UI & CLI bundle
  console.log("\n3/5  Building UI and CLI distribution bundle...");
  execSync("pnpm run build", { cwd: projectRoot, stdio: "inherit" });

  // 4. Test Suite & Health Check
  if (!isNoTest) {
    console.log("\n4/5  Running test suite & health diagnostic...");
    execSync("pnpm test", { cwd: projectRoot, stdio: "inherit" });
    execSync("node ./packages/cli/dist/bin.js doctor --compact", { cwd: projectRoot, stdio: "inherit" });
  } else {
    console.log("\n4/5  Skipping tests (--no-test specified)...");
  }

  // 5. Git commit & Tag or Publish
  console.log("\n5/5  Finalizing release...");
  if (isDryRun) {
    console.log("   [dry-run] Verification passed! Dry run completed successfully.\n");
    return;
  }

  if (!isNoGit) {
    try {
      execSync(`git add ${packageJsonPaths.join(" ")}`, { cwd: projectRoot, stdio: "inherit" });
      execSync(`git commit -m "chore(release): v${nextVersion}"`, { cwd: projectRoot, stdio: "inherit" });
      execSync(`git tag -a "v${nextVersion}" -m "Release v${nextVersion}"`, { cwd: projectRoot, stdio: "inherit" });
      console.log(`   ✓ Created commit: chore(release): v${nextVersion}`);
      console.log(`   ✓ Created tag   : v${nextVersion}`);
    } catch (err: any) {
      console.warn(`   ⚠️ Git commit/tag skipped or encountered error: ${err.message}`);
    }
  }

  if (isPublish) {
    console.log(`\n📦 Publishing spexy-cli@${nextVersion} to NPM under tag "${distTag}"...`);
    const cliDir = path.join(packagesDir, "cli");
    execSync(`npm publish --tag "${distTag}" --access public`, { cwd: cliDir, stdio: "inherit" });
    console.log(`\n🎉 Published spexy-cli@${nextVersion} (tag: ${distTag}) to NPM!`);
  } else {
    console.log(`\n🎉 Release v${nextVersion} prepared successfully!`);
    console.log("\nTo publish via GitHub Actions CI automatically, push the tag:");
    console.log(`   git push origin main --follow-tags`);
    console.log("\nOr publish immediately via CLI:");
    console.log(`   cd packages/cli && npm publish --tag ${distTag} --access public\n`);
  }
}

main().catch((err) => {
  console.error("\n❌ Release failed:", err.message);
  process.exit(1);
});
