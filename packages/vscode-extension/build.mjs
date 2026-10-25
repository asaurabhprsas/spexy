import * as esbuild from "esbuild";
import path from "node:path";

const watch = process.argv.includes("--watch");
const extRoot = import.meta.dirname;

const buildOptions = {
  entryPoints: [path.join(extRoot, "src/extension.ts")],
  bundle: true,
  outfile: path.join(extRoot, "dist/extension.js"),
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  target: "node18",
  sourcemap: true,
  logLevel: "info",
};

if (watch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log("Watching for changes in @workspace/spexy-vscode...");
} else {
  await esbuild.build(buildOptions);
  console.log("Built @workspace/spexy-vscode successfully.");
}
