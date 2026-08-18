import { build } from "esbuild";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const packageJson = JSON.parse(
  await readFile(path.join(rootDir, "package.json"), "utf8"),
);

await mkdir(path.join(rootDir, "dist", "worker"), { recursive: true });

await build({
  absWorkingDir: rootDir,
  entryPoints: ["scripts/run-backup-worker.ts"],
  outfile: "dist/worker/run-backup-worker.js",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  packages: "external",
  sourcemap: false,
  tsconfig: "tsconfig.json",
  define: {
    "process.env.APP_VERSION": JSON.stringify(packageJson.version || "0.0.0"),
  },
});

console.log(
  `[build:worker] wrote dist/worker/run-backup-worker.js (v${packageJson.version || "0.0.0"})`,
);
