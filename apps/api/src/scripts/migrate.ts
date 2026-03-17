import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("DATABASE_URL environment variable is required");
  process.exit(1);
}

async function runMigrations(): Promise<void> {
  console.log("Running database migrations...");

  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const db = drizzle(pool);

  try {
    await migrate(db, {
      migrationsFolder: "./packages/shared/drizzle",
    });
    console.log("Migrations completed successfully!");
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();
