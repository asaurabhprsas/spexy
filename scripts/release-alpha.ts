#!/usr/bin/env node
import { execSync } from "node:child_process";
import path from "node:path";

const releaseScript = path.resolve(import.meta.dirname, "release.ts");
const args = process.argv.slice(2).join(" ");
execSync(`node ./node_modules/tsx/dist/cli.mjs ${releaseScript} alpha ${args}`, { stdio: "inherit" });
