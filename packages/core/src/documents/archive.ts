import fs from "node:fs";
import path from "node:path";
import { findDocument } from "../fs/workspace";

export interface ArchiveDocumentResult {
  originalPath: string;
  archivedPath: string;
}

export function archiveDocument(projectRoot: string, docPathOrId: string): ArchiveDocumentResult {
  let sourceAbsPath: string;
  let originalRelPath: string;

  try {
    const doc = findDocument(projectRoot, docPathOrId);
    sourceAbsPath = doc.fullPath;
    originalRelPath = doc.path;
  } catch (err) {
    const candidateAbs = path.isAbsolute(docPathOrId)
      ? docPathOrId
      : path.resolve(projectRoot, docPathOrId);
    if (fs.existsSync(candidateAbs) && fs.statSync(candidateAbs).isFile()) {
      sourceAbsPath = candidateAbs;
      originalRelPath = path.relative(projectRoot, candidateAbs).split(path.sep).join("/");
    } else {
      throw err;
    }
  }

  const sfDir = path.join(projectRoot, ".specflow");
  let subRelPath: string;

  if (sourceAbsPath.startsWith(sfDir)) {
    subRelPath = path.relative(sfDir, sourceAbsPath);
  } else {
    subRelPath = path.relative(projectRoot, sourceAbsPath);
  }

  const archivedDir = path.join(sfDir, "archived", path.dirname(subRelPath));
  const ext = path.extname(subRelPath);
  const baseName = path.basename(subRelPath, ext);

  let targetFilename = `${baseName}${ext}`;
  let targetAbsPath = path.join(archivedDir, targetFilename);

  let counter = 1;
  while (fs.existsSync(targetAbsPath)) {
    targetFilename = `${baseName}_${counter}${ext}`;
    targetAbsPath = path.join(archivedDir, targetFilename);
    counter++;
  }

  fs.mkdirSync(archivedDir, { recursive: true });

  try {
    fs.renameSync(sourceAbsPath, targetAbsPath);
  } catch {
    fs.copyFileSync(sourceAbsPath, targetAbsPath);
    fs.unlinkSync(sourceAbsPath);
  }

  const archivedRelPath = path.relative(projectRoot, targetAbsPath).split(path.sep).join("/");

  return {
    originalPath: originalRelPath.split(path.sep).join("/"),
    archivedPath: archivedRelPath,
  };
}
