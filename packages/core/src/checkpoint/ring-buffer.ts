import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { getSpecflowDir } from "../fs/workspace";

export interface SnapshotEntry {
  id: string;
  filename: string;
  relativePath: string;
  snapshotFile: string;
  timestamp: string;
  size: number;
  hash: string;
}

export interface CheckpointIndex {
  version: "1.0";
  snapshots: SnapshotEntry[];
}

function getCheckpointsDir(projectRoot: string): string {
  return path.join(getSpecflowDir(projectRoot), ".cache", "checkpoints");
}

function getIndexPath(projectRoot: string): string {
  return path.join(getCheckpointsDir(projectRoot), "index.json");
}

export function readCheckpointIndex(projectRoot: string): CheckpointIndex {
  const indexPath = getIndexPath(projectRoot);
  if (!fs.existsSync(indexPath)) {
    return { version: "1.0", snapshots: [] };
  }
  try {
    const raw = fs.readFileSync(indexPath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return { version: "1.0", snapshots: [] };
  }
}

export function writeCheckpointIndex(
  projectRoot: string,
  index: CheckpointIndex,
): void {
  const checkpointsDir = getCheckpointsDir(projectRoot);
  fs.mkdirSync(checkpointsDir, { recursive: true });
  fs.writeFileSync(
    getIndexPath(projectRoot),
    JSON.stringify(index, null, 2),
    "utf-8",
  );
}

export function createSnapshot(
  projectRoot: string,
  targetFilePath: string,
  maxSnapshotsPerFile: number = 20,
): SnapshotEntry | null {
  const absPath = path.isAbsolute(targetFilePath)
    ? targetFilePath
    : path.join(projectRoot, targetFilePath);

  if (!fs.existsSync(absPath)) return null;

  const content = fs.readFileSync(absPath);
  const hash = crypto.createHash("sha256").update(content).digest("hex").slice(0, 12);
  const id = `chk-${Date.now()}-${hash}`;
  const filename = path.basename(absPath);
  const relPath = path.relative(projectRoot, absPath);
  const snapshotFileName = `${hash}-${filename}.bak`;

  const checkpointsDir = getCheckpointsDir(projectRoot);
  fs.mkdirSync(checkpointsDir, { recursive: true });

  const snapshotAbsPath = path.join(checkpointsDir, snapshotFileName);
  fs.writeFileSync(snapshotAbsPath, content);

  const index = readCheckpointIndex(projectRoot);
  const newEntry: SnapshotEntry = {
    id,
    filename,
    relativePath: relPath,
    snapshotFile: snapshotFileName,
    timestamp: new Date().toISOString(),
    size: content.length,
    hash,
  };

  const fileSnapshots = index.snapshots.filter((s) => s.relativePath === relPath);
  fileSnapshots.push(newEntry);

  // Enforce ring-buffer cap per file
  let remainingForFile = fileSnapshots;
  if (fileSnapshots.length > maxSnapshotsPerFile) {
    const toRemoveCount = fileSnapshots.length - maxSnapshotsPerFile;
    const toRemove = fileSnapshots.slice(0, toRemoveCount);
    for (const item of toRemove) {
      const p = path.join(checkpointsDir, item.snapshotFile);
      if (fs.existsSync(p)) {
        try {
          fs.unlinkSync(p);
        } catch {
          // ignore
        }
      }
    }
    remainingForFile = fileSnapshots.slice(toRemoveCount);
  }

  const otherSnapshots = index.snapshots.filter((s) => s.relativePath !== relPath);
  index.snapshots = [...otherSnapshots, ...remainingForFile];
  writeCheckpointIndex(projectRoot, index);

  return newEntry;
}

export function listSnapshots(
  projectRoot: string,
  targetFilePath?: string,
): SnapshotEntry[] {
  const index = readCheckpointIndex(projectRoot);
  if (!targetFilePath) {
    return [...index.snapshots].reverse();
  }

  const rel = path.isAbsolute(targetFilePath)
    ? path.relative(projectRoot, targetFilePath)
    : targetFilePath;

  return index.snapshots
    .filter((s) => s.relativePath === rel || s.filename === targetFilePath)
    .reverse();
}

export function restoreSnapshot(
  projectRoot: string,
  snapshotId: string,
): { restoredFile: string; entry: SnapshotEntry } {
  const index = readCheckpointIndex(projectRoot);
  const entry = index.snapshots.find(
    (s) => s.id === snapshotId || s.snapshotFile === snapshotId,
  );

  if (!entry) {
    throw new Error(`Checkpoint snapshot not found: "${snapshotId}"`);
  }

  const checkpointsDir = getCheckpointsDir(projectRoot);
  const snapshotPath = path.join(checkpointsDir, entry.snapshotFile);

  if (!fs.existsSync(snapshotPath)) {
    throw new Error(
      `Snapshot backup file missing on disk: ${entry.snapshotFile}`,
    );
  }

  const targetPath = path.join(projectRoot, entry.relativePath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });

  const backupData = fs.readFileSync(snapshotPath);
  fs.writeFileSync(targetPath, backupData);

  return { restoredFile: entry.relativePath, entry };
}
