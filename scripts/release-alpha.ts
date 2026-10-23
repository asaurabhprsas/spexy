#!/usr/bin/env node
import { execSync } from "node:child_process";
import path from "node:path";

const releaseScript = path.resolve(import.meta.dirname, "release.ts");
const args = process.argv.slice(2).join(" ");
execSync(`pnpx tsx ${releaseScript} alpha ${args}`, { stdio: "inherit" });
