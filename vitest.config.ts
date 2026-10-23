import { defineConfig } from "vitest/config";
import os from "node:os";
import path from "node:path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["packages/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    cache: false,
    fsModuleCache: false,
    fsModuleCachePath: path.join(os.tmpdir(), ".vitest-cache"),
  },
  cacheDir: path.join(os.tmpdir(), ".vitest-spexy-cache"),
});
