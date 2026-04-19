import { config } from "dotenv";
config({ path: "../../.env.local" });

import Fastify from "fastify";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import { createDatabase } from "@examforge/shared/db";
import { appRouter } from "./trpc/index.js";
import { createContextFactory } from "./trpc/context.js";
import { registerCors } from "./plugins/cors.js";

const PORT = Number(process.env.PORT) || 4100;
const HOST = process.env.HOST || "0.0.0.0";
const DATABASE_URL = process.env.DATABASE_URL;

async function main(): Promise<void> {
  if (!DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  const app = Fastify({
    logger: true,
    maxParamLength: 1000, // tRPC batch routes can have long comma-separated procedure names
  });

  const db = createDatabase(DATABASE_URL);

  await registerCors(app);

  await app.register(fastifyTRPCPlugin, {
    prefix: "/trpc",
    trpcOptions: {
      router: appRouter,
      createContext: createContextFactory(db),
      onError: ({
        path,
        error,
      }: {
        path: string | undefined;
        error: { code: string; message: string; stack?: string };
      }) => {
        // Log all tRPC errors to the server console (visible in Cursor terminal)
        console.error(
          `[ExamForge tRPC Error] ${path ?? "unknown"} — ${error.code}: ${error.message}`,
        );
        if (error.stack && process.env.NODE_ENV !== "production") {
          console.error(error.stack);
        }
      },
    },
  });

  app.get("/health", async () => {
    return { status: "ok", timestamp: new Date().toISOString() };
  });

  // Static file serving for stored PDFs (syllabi, etc.)
  app.get("/api/files/*", async (request, reply) => {
    const { promises: fs } = await import("node:fs");
    const { join, resolve } = await import("node:path");

    const url = request.url.replace("/api/files/", "");
    const safePath = url.split("?")[0]!.replace(/\.\./g, "");
    const filePath = resolve(join(process.cwd(), "storage", safePath));

    // Ensure path doesn't escape storage directory
    const storageRoot = resolve(join(process.cwd(), "storage"));
    if (!filePath.startsWith(storageRoot)) {
      return reply.status(403).send({ error: "Forbidden" });
    }

    try {
      const stat = await fs.stat(filePath);
      const content = await fs.readFile(filePath);

      const ext = filePath.split(".").pop()?.toLowerCase();
      const mimeTypes: Record<string, string> = {
        pdf: "application/pdf",
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        html: "text/html",
      };

      return reply
        .header("Content-Type", mimeTypes[ext ?? ""] ?? "application/octet-stream")
        .header("Content-Length", stat.size)
        .header("Content-Disposition", `inline; filename="${safePath.split("/").pop()}"`)
        .send(content);
    } catch {
      return reply.status(404).send({ error: "File not found" });
    }
  });

  await app.listen({ port: PORT, host: HOST });
  app.log.info(`API server running on http://${HOST}:${PORT}`);
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
