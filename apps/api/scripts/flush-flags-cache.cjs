const Redis = require("ioredis");
const fs = require("fs");
const path = require("path");

const envPath = path.resolve(__dirname, "..", "..", "..", ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)="?([^"]*)"?$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

(async () => {
  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  const redis = new Redis(url);
  const keys = await redis.keys("ff:*");
  if (keys.length) {
    await redis.del(...keys);
  }
  console.log(`Cleared ${keys.length} flag cache keys`);
  await redis.quit();
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
