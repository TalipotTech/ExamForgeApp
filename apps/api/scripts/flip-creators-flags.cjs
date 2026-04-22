const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

// Load .env.local from monorepo root (two levels up from apps/api)
const envPath = path.resolve(__dirname, "..", "..", "..", ".env.local");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf8");
  for (const line of envContent.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)="?([^"]*)"?$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

const mode = process.argv[2]; // "on" or "off"
if (mode !== "on" && mode !== "off") {
  console.error("Usage: node flip-creators-flags.cjs [on|off]");
  process.exit(1);
}
const target = mode === "on" ? "true" : "false";

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  await c.query(
    `UPDATE admin_feature_flags SET value = $1::jsonb WHERE key IN ('creators.enabled', 'creators.marketplace_enabled', 'creators.registration_open')`,
    [target],
  );
  const res = await c.query(
    "SELECT key, value FROM admin_feature_flags WHERE category = 'creators' ORDER BY key",
  );
  for (const row of res.rows) console.log(`  ${row.key} = ${JSON.stringify(row.value)}`);
  await c.end();
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
