import { config } from "dotenv";
config({ path: "../../.env.local" });

import Fastify from "fastify";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import { createDatabase } from "@examforge/shared/db";
import { appRouter } from "./trpc/index.js";
import { createContextFactory } from "./trpc/context.js";
import { registerCors } from "./plugins/cors.js";

const PORT = Number(process.env.PORT) || 4000;
const HOST = process.env.HOST || "0.0.0.0";
const DATABASE_URL = process.env.DATABASE_URL;

async function main(): Promise<void> {
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  const app = Fastify({ logger: true });

  const db = createDatabase(DATABASE_URL);

  await registerCors(app);

  await app.register(fastifyTRPCPlugin, {
    prefix: "/trpc",
    trpcOptions: {
      router: appRouter,
      createContext: createContextFactory(db),
    },
  });

  app.get("/health", async () => {
    return { status: "ok", timestamp: new Date().toISOString() };
  });

  await app.listen({ port: PORT, host: HOST });
  app.log.info(`API server running on http://${HOST}:${PORT}`);
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
