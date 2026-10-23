#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const skillsDir = path.join(projectRoot, "skills");
const agentsSkillsDir = path.join(projectRoot, ".agents", "skills");

// Ensure .agents/skills directory exists
if (!fs.existsSync(agentsSkillsDir)) {
  fs.mkdirSync(agentsSkillsDir, { recursive: true });
}

// Find all skills in skills/ directory (e.g. spexy)
const skills = fs.existsSync(skillsDir)
  ? fs
      .readdirSync(skillsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
  : [];

// Ensure spexy is explicitly included if present in skills/
if (!skills.includes("spexy") && fs.existsSync(path.join(skillsDir, "spexy"))) {
  skills.push("spexy");
}

for (const skill of skills) {
  const targetPath = path.join(agentsSkillsDir, skill);
  const relativeSource = path.relative(agentsSkillsDir, path.join(skillsDir, skill));

  try {
    const stat = fs.lstatSync(targetPath);
    if (stat.isSymbolicLink()) {
      const currentTarget = fs.readlinkSync(targetPath);
      if (currentTarget === relativeSource) {
        console.log(`✓ Skill '${skill}' already linked to ${relativeSource}`);
        continue;
      }
      fs.unlinkSync(targetPath);
    } else {
      fs.rmSync(targetPath, { recursive: true, force: true });
    }
  } catch (error: any) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  fs.symlinkSync(relativeSource, targetPath, "dir");
  console.log(`✓ Linked skill '${skill}' -> ${relativeSource}`);
}
