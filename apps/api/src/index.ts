import { config } from "dotenv";
config({ path: "../../.env.local" });

import crypto from "node:crypto";
import Fastify from "fastify";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import { createDatabase } from "@examforge/shared/db";
import { appRouter } from "./trpc/index.js";
import { createContextFactory } from "./trpc/context.js";
import { registerCors } from "./plugins/cors.js";
import { handleWebhook as handleSubscriptionWebhook } from "./services/payment-service.js";
import { handleMarketplaceWebhook } from "./services/marketplace-purchase.js";

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

  // Replace the default JSON parser so we also retain the raw body string on
  // the request. Razorpay webhook signatures are HMAC-SHA256 over the exact
  // request bytes — re-stringifying a parsed object would change ordering /
  // whitespace and invalidate the signature.
  app.addContentTypeParser("application/json", { parseAs: "string" }, (req, body, done) => {
    (req as { rawBody?: string }).rawBody = body as string;
    try {
      const parsed = body === "" ? {} : JSON.parse(body as string);
      done(null, parsed);
    } catch (err) {
      const parseError = err as Error & { statusCode?: number };
      parseError.statusCode = 400;
      done(parseError, undefined);
    }
  });

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

  // Razorpay webhook — single endpoint for subscription + marketplace events.
  // The HMAC-SHA256 signature is verified against the raw request body using
  // RAZORPAY_WEBHOOK_SECRET. Any signature mismatch returns 401 before we
  // touch the database. Response is 200 even for ignored/unknown events so
  // Razorpay doesn't retry indefinitely.
  app.post("/webhooks/razorpay", async (request, reply) => {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) {
      request.log.error("RAZORPAY_WEBHOOK_SECRET not configured; rejecting webhook");
      return reply.status(503).send({ error: "Webhook not configured" });
    }

    const rawBody = (request as { rawBody?: string }).rawBody;
    const headerSignature = request.headers["x-razorpay-signature"];
    const signature = Array.isArray(headerSignature) ? headerSignature[0] : headerSignature;

    if (!rawBody || !signature) {
      return reply.status(400).send({ error: "Missing body or signature" });
    }

    const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    const signatureBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expected);
    if (
      signatureBuf.length !== expectedBuf.length ||
      !crypto.timingSafeEqual(signatureBuf, expectedBuf)
    ) {
      return reply.status(401).send({ error: "Invalid signature" });
    }

    const body = request.body as { event?: string; payload?: Record<string, unknown> } | undefined;
    const event = body?.event;
    const payload = body?.payload;
    if (!event || !payload) {
      return reply.status(400).send({ error: "Malformed webhook payload" });
    }

    try {
      if (event.startsWith("subscription.")) {
        const entity = (payload.subscription ?? payload) as
          | { entity?: Record<string, unknown> }
          | Record<string, unknown>;
        const subscriptionEntity =
          (entity as { entity?: Record<string, unknown> }).entity ??
          (entity as Record<string, unknown>);
        await handleSubscriptionWebhook(db, event, subscriptionEntity);
        return reply.status(200).send({ received: true, routed: "subscription" });
      }

      const outcome = await handleMarketplaceWebhook(db, event, payload);
      return reply.status(200).send({ received: true, routed: "marketplace", ...outcome });
    } catch (err) {
      request.log.error({ err }, "Razorpay webhook handler failed");
      // Respond 200 anyway — we'll pick up missed state via a reconciliation
      // cron. Returning 5xx would have Razorpay retry and potentially double
      // our side effects.
      return reply.status(200).send({ received: true, error: true });
    }
  });

  await app.listen({ port: PORT, host: HOST });
  app.log.info(`API server running on http://${HOST}:${PORT}`);
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
