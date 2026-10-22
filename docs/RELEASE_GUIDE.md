# Spexy NPM Release Guide

This document describes the workflow for publishing `spexy-cli` to the NPM registry, including alpha releases and automated CI/CD publishing.

---

## 📦 Package Distribution Model

Spexy uses a standalone distribution model for `spexy-cli`:
- **Executable**: `dist/bin.js` (bundled with all dependencies and schemas embedded via Bun/Node).
- **Dashboard UI**: `static/` (pre-compiled Vite React dashboard bundle).
- **Scope**: Published to NPM as `spexy-cli` with `--access public`.
- **Channel**: Alpha releases are tagged with `--tag alpha`.

---

## 🛠️ Local Publishing

### 1. Pre-flight Quality Verification (Dry-Run)
Before publishing, run the automated verification pipeline in dry-run mode:

```bash
bun run release:alpha -- --dry-run
# or
bun run release:pack
```

This validates:
1. TypeScript strict typecheck across all workspaces.
2. Full test suite execution (`NO_PROXY="*" bun test`).
3. Web UI build (`packages/ui` $\to$ `packages/cli/static`).
4. Standalone CLI bundling (`packages/cli/src/bin.ts` $\to$ `packages/cli/dist/bin.js`).
5. Workspace diagnostic check using the newly compiled binary (`doctor --compact`).
6. NPM tarball dry-run inspection (`npm pack --dry-run`).

### 2. Live Publishing to NPM
Ensure you are logged into your NPM account with access to publish `spexy-cli`:

```bash
# Login to npm (if not already authenticated)
npm login

# Run the automated alpha release publisher
bun run release:alpha
```

This runs the complete pre-flight suite and executes:
```bash
npm publish --tag alpha --access public
```

---

## 🤖 Automated Publishing via GitHub Actions

The repository includes a GitHub Actions workflow at [`.github/workflows/publish.yml`](../.github/workflows/publish.yml).

### 1. Configure NPM Token Secret
In your GitHub repository settings:
1. Go to **Settings** $\to$ **Secrets and variables** $\to$ **Actions**.
2. Click **New repository secret**.
3. Name: `NPM_TOKEN`
4. Value: An NPM Automation or Granular Access Token with publish permissions for `spexy-cli`.

### 2. Triggering a Release
You can trigger a release in two ways:

#### Option A: Manual Dispatch (GitHub UI)
1. Go to the **Actions** tab in GitHub.
2. Select **Publish Alpha Release to NPM**.
3. Click **Run workflow**:
   - `tag`: Enter `alpha` (or `latest` for general releases).
   - `dry_run`: Check for verification without uploading to registry.

#### Option B: Git Tag Push
Pushing an alpha release tag automatically triggers the publication workflow:
```bash
git tag v0.1.0-alpha.0
git push origin v0.1.0-alpha.0
```

---

## 🧪 Verifying Published Release

Once published, anyone can test or install the alpha release:

```bash
# Run doctor check without installing
npx spexy-cli@alpha doctor --compact

# Global installation via npm
npm install -g spexy-cli@alpha

# Global installation via bun
bun add -g spexy-cli@alpha
```
