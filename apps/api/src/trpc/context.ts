import type { CreateFastifyContextOptions } from "@trpc/server/adapters/fastify";
import type { Database } from "@examforge/shared/db";
import { jwtDecrypt } from "jose";
import { hkdfSync } from "node:crypto";

export type Context = {
  req: CreateFastifyContextOptions["req"];
  res: CreateFastifyContextOptions["res"];
  db: Database;
  userId: string | null;
  userRole: string | null;
  orgId: string | null;
  isSubscriber: boolean;
  onboardingCompleted: boolean;
};

function getDerivedEncryptionKey(secret: string, salt: string, keyLength: number): Uint8Array {
  return new Uint8Array(
    hkdfSync("sha256", secret, salt, `Auth.js Generated Encryption Key (${salt})`, keyLength),
  );
}

type DecodedToken = {
  userId: string;
  role: string;
  orgId: string | null;
  isSubscriber: boolean;
  onboardingCompleted: boolean;
};

async function decryptSessionToken(
  token: string,
  secret: string,
  cookieName: string,
): Promise<DecodedToken | null> {
  try {
    const headerPart = token.split(".")[0];
    if (!headerPart) return null;
    const jweHeader = JSON.parse(Buffer.from(headerPart, "base64url").toString());
    const enc = jweHeader.enc ?? "A256CBC-HS512";
    const keyLength = enc === "A256CBC-HS512" ? 64 : 32;
    const key = getDerivedEncryptionKey(secret, cookieName, keyLength);
    const { payload } = await jwtDecrypt(token, key, {
      clockTolerance: 15,
      keyManagementAlgorithms: ["dir"],
      contentEncryptionAlgorithms: [enc],
    });

    return {
      userId: (payload.userId as string) ?? null,
      role: (payload.role as string) ?? null,
      orgId: (payload.orgId as string) ?? null,
      isSubscriber: (payload.isSubscriber as boolean) ?? false,
      onboardingCompleted: (payload.onboardingCompleted as boolean) ?? false,
    };
  } catch {
    return null;
  }
}

export function createContextFactory(db: Database) {
  const secret = process.env.NEXTAUTH_SECRET;

  return async function createContext({ req, res }: CreateFastifyContextOptions): Promise<Context> {
    let userId: string | null = null;
    let userRole: string | null = null;
    let orgId: string | null = null;
    let isSubscriber = false;
    let onboardingCompleted = false;

    if (secret) {
      // Try Authorization header first (cross-origin), then cookies (same-origin)
      const authHeader = req.headers.authorization;
      const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

      const cookieHeader = req.headers.cookie ?? "";
      const cookies = Object.fromEntries(
        cookieHeader.split(";").map((c) => {
          const [k, ...v] = c.trim().split("=");
          return [k, v.join("=")];
        }),
      );

      const cookieCandidates = [
        ["__Secure-authjs.session-token", "__Secure-authjs.session-token"],
        ["authjs.session-token", "authjs.session-token"],
      ] as const;

      // If we have a bearer token, try decrypting with all cookie salt candidates
      if (bearerToken) {
        for (const [, salt] of cookieCandidates) {
          const decoded = await decryptSessionToken(bearerToken, secret, salt);
          if (decoded) {
            userId = decoded.userId;
            userRole = decoded.role;
            orgId = decoded.orgId;
            isSubscriber = decoded.isSubscriber;
            onboardingCompleted = decoded.onboardingCompleted;
            break;
          }
        }
      }

      // Fall back to cookies if bearer didn't work
      if (!userId) {
        for (const [cookieName, salt] of cookieCandidates) {
          const token = cookies[cookieName];
          if (!token) continue;
          const decoded = await decryptSessionToken(token, secret, salt);
          if (decoded) {
            userId = decoded.userId;
            userRole = decoded.role;
            orgId = decoded.orgId;
            isSubscriber = decoded.isSubscriber;
            onboardingCompleted = decoded.onboardingCompleted;
            break;
          }
        }
      }
    }

    return { req, res, db, userId, userRole, orgId, isSubscriber, onboardingCompleted };
  };
}
