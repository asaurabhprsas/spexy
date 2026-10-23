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

function bumpVersion(currentVer: string, inputType: string): { nextVersion: string; distTag: string } {
  const cleanType = inputType.trim();

  // Explicit semver provided (e.g. "0.2.0" or "0.2.0-alpha.5")
  if (/^\d+\.\d+\.\d+/.test(cleanType)) {
    parseSemver(cleanType);
    return {
      nextVersion: cleanType,
      distTag: detectDistTag(cleanType),
    };
  }

  const parsed = parseSemver(currentVer);

  // Match syntax: alpha, alpha@next, alpha:next, beta, beta@next, next@next, etc.
  const match = cleanType.match(/^([a-zA-Z]+)(?:[@:](next|bump|\d+))?$/);
  if (match) {
    const tag = match[1].toLowerCase();
    const modifier = match[2];

    if (tag === "major") {
      return { nextVersion: `${parsed.major + 1}.0.0`, distTag: "latest" };
    }
    if (tag === "minor") {
      return { nextVersion: `${parsed.major}.${parsed.minor + 1}.0`, distTag: "latest" };
    }
    if (tag === "patch") {
      if (parsed.prerelease) {
        return { nextVersion: `${parsed.major}.${parsed.minor}.${parsed.patch}`, distTag: "latest" };
      }
      return { nextVersion: `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`, distTag: "latest" };
    }

    // Prerelease tags: alpha, beta, rc, next, canary, dev, etc.
    // If currently on this prerelease tag (e.g. 0.1.0-alpha.2 and tag is alpha)
    if (parsed.prerelease === tag && parsed.prereleaseNum !== null) {
      const nextNum = modifier && /^\d+$/.test(modifier) ? parseInt(modifier, 10) : parsed.prereleaseNum + 1;
      return {
        nextVersion: `${parsed.major}.${parsed.minor}.${parsed.patch}-${tag}.${nextNum}`,
        distTag: tag,
      };
    }

    // If currently on another prerelease tag (e.g. 0.1.0-alpha.2 and tag is beta)
    if (parsed.prerelease && parsed.prerelease !== tag) {
      return {
        nextVersion: `${parsed.major}.${parsed.minor}.${parsed.patch}-${tag}.0`,
        distTag: tag,
      };
    }

    // If currently on stable version (e.g. 0.1.0 and tag is alpha)
    return {
      nextVersion: `${parsed.major}.${parsed.minor}.${parsed.patch + 1}-${tag}.0`,
      distTag: tag,
    };
  }

  throw new Error(`Unrecognized release type: "${inputType}". Use patch, minor, major, alpha, alpha@next, beta@next, next@next, rc@next, or exact version.`);
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
  type           Bump type: patch, minor, major, alpha, beta, rc, next
                 Supports prerelease bump: alpha@next, beta@next, next@next, rc@next
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
  pnpm release alpha@next         # Bump alpha (0.1.0 -> 0.1.1-alpha.0, or 0.1.1-alpha.0 -> 0.1.1-alpha.1)
  pnpm release beta@next          # Bump beta (tag: beta)
  pnpm release next@next          # Bump next (tag: next)
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

  const { nextVersion, distTag: detectedTag } = bumpVersion(currentVersion, targetArg);
  const distTag = customTag || detectedTag;

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

  // 2. Strict Typecheck (prefer npx)
  console.log("\n2/5  Running strict TypeScript typecheck (npx tsc)...");
  execSync("npx tsc --noEmit && npx tsc -p packages/ui/tsconfig.json --noEmit", { cwd: projectRoot, stdio: "inherit" });

  // 3. Build UI & CLI bundle
  console.log("\n3/5  Building UI and CLI distribution bundle...");
  execSync("pnpm run build", { cwd: projectRoot, stdio: "inherit" });

  // 4. Test Suite & Health Check (prefer npx)
  if (!isNoTest) {
    console.log("\n4/5  Running test suite (npx vitest) & health diagnostic...");
    execSync("npx vitest run", { cwd: projectRoot, stdio: "inherit" });
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
