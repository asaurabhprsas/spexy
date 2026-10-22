import fs from "node:fs";
import path from "node:path";
import { getSpecflowDir } from "./fs/workspace";

export function getPreferencesConfigPath(projectRoot: string): string {
  return path.join(getSpecflowDir(projectRoot), "config.json");
}

export function getPreferences(projectRoot: string): Record<string, any> {
  const configJsonPath = getPreferencesConfigPath(projectRoot);
  if (!fs.existsSync(configJsonPath)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(configJsonPath, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.preferences && typeof parsed.preferences === "object") {
      return parsed.preferences;
    }
    return {};
  } catch {
    return {};
  }
}

export function updatePreferences(
  projectRoot: string,
  prefs: Record<string, any>,
): Record<string, any> {
  const configJsonPath = getPreferencesConfigPath(projectRoot);
  fs.mkdirSync(path.dirname(configJsonPath), { recursive: true });

  let configObj: Record<string, any> = {};
  if (fs.existsSync(configJsonPath)) {
    try {
      const raw = fs.readFileSync(configJsonPath, "utf-8");
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        configObj = parsed;
      }
    } catch {
      configObj = {};
    }
  }

  const existingPrefs = (configObj.preferences && typeof configObj.preferences === "object")
    ? configObj.preferences
    : {};

  const mergedPrefs = {
    ...existingPrefs,
    ...prefs,
  };

  configObj.preferences = mergedPrefs;

  fs.writeFileSync(configJsonPath, JSON.stringify(configObj, null, 2), "utf-8");

  return mergedPrefs;
}
