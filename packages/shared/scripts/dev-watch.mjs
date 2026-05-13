/**
 * Dev watcher: runs `tsc --watch` and re-runs fix-esm-imports.mjs after every
 * successful incremental compile so the API/web/workers always see fresh
 * `dist/` output without a manual `pnpm --filter @examforge/shared build`.
 *
 * Why a wrapper instead of a chained script: tsc has no built-in
 * "post-emit" hook, so we parse its stdout for the "Watching for file
 * changes" sentinel that follows every compile pass.
 */
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_DIR = join(__dirname, "..");
const FIX_SCRIPT = join(__dirname, "fix-esm-imports.mjs");

// tsc emits this line after every (successful or failing) compile pass when
// run with --watch. Match either flavour so we re-fix on success.
const WATCH_DONE = /Watching for file changes\./;
const COMPILE_OK = /Found 0 errors\./;

const tscBin = process.platform === "win32" ? "tsc.cmd" : "tsc";
const tscPath = join(PKG_DIR, "node_modules", ".bin", tscBin);
const tscCmd = existsSync(tscPath) ? tscPath : tscBin;

const tsc = spawn(tscCmd, ["--watch", "--preserveWatchOutput"], {
  cwd: PKG_DIR,
  stdio: ["ignore", "pipe", "inherit"],
  shell: process.platform === "win32",
});

let hadErrors = false;
let pendingFix = false;
let fixing = false;

async function runFix() {
  if (fixing) {
    pendingFix = true;
    return;
  }
  fixing = true;
  await new Promise((resolve) => {
    const proc = spawn(process.execPath, [FIX_SCRIPT], {
      cwd: PKG_DIR,
      stdio: "inherit",
    });
    proc.on("close", resolve);
  });
  fixing = false;
  if (pendingFix) {
    pendingFix = false;
    void runFix();
  }
}

tsc.stdout.on("data", (chunk) => {
  const text = chunk.toString();
  process.stdout.write(text);

  if (/error TS\d+/.test(text)) hadErrors = true;
  if (COMPILE_OK.test(text)) hadErrors = false;

  if (WATCH_DONE.test(text) && !hadErrors) {
    void runFix();
  }
});

tsc.on("close", (code) => {
  process.exit(code ?? 0);
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    tsc.kill(sig);
  });
}
