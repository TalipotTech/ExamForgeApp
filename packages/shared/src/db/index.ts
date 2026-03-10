import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index";

export type Database = ReturnType<typeof createDatabase>;

export function createDatabase(connectionString: string): ReturnType<typeof drizzle> {
  const pool = new pg.Pool({ connectionString });
  return drizzle(pool, { schema });
}

export { schema };
