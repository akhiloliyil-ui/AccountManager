// Packs the project into ../gpa-money-manager.zip without dependencies, builds, local data or secrets.
import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const out = resolve(dirname(root), `${basename(root)}.zip`);
if (existsSync(out)) rmSync(out);

const exclude = [
  "*/node_modules/*",
  "*/.next/*",
  "*/.data/*",
  "*/test-results/*",
  "*/playwright-report/*",
  "*/.env",
  "*/.env.local",
  "*/.env.*.local",
  "*/.DS_Store",
  "*.tsbuildinfo",
  "*/next-env.d.ts",
  "*/.git/*",
];
execFileSync("zip", ["-r", "-q", out, basename(root), "-x", ...exclude.map((p) => `${basename(root)}/${p.replace(/^\*\//, "*")}`)], {
  cwd: dirname(root),
  stdio: "inherit",
});
console.log(`Wrote ${out}`);
