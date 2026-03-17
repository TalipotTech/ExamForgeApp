/**
 * Post-build script: adds .js extensions to relative imports in compiled ESM output.
 * Required because tsc with module:"ESNext" doesn't add .js extensions,
 * but Node.js ESM requires them.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(__dirname, "..", "dist");

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...walk(full));
    } else if (full.endsWith(".js")) {
      files.push(full);
    }
  }
  return files;
}

let fixed = 0;
for (const file of walk(DIST_DIR)) {
  let content = readFileSync(file, "utf8");
  const updated = content.replace(
    /(from\s+["'])(\.\.?\/[^"']+)(["'])/g,
    (match, prefix, path, suffix) => {
      if (path.endsWith(".js") || path.endsWith(".json")) return match;
      fixed++;
      return `${prefix}${path}.js${suffix}`;
    },
  );
  if (updated !== content) {
    writeFileSync(file, updated);
  }
}

console.log(`fix-esm-imports: added .js extension to ${fixed} imports`);
