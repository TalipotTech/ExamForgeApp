import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { eq, and, gt } from "drizzle-orm";
import { createDatabase } from "@examforge/shared/db";
import { users, userSubscriptions, otpVerifications } from "@examforge/shared/db/schema";

const db = createDatabase(process.env.DATABASE_URL!);

const DEFAULT_ORG_ID = "a0000000-0000-0000-0000-000000000001";

async function checkSubscription(userId: string): Promise<boolean> {
  const [sub] = await db
    .select({ id: userSubscriptions.id })
    .from(userSubscriptions)
    .where(and(eq(userSubscriptions.userId, userId), eq(userSubscriptions.status, "active")))
    .limit(1);
  return !!sub;
}

async function checkOnboarding(userId: string): Promise<boolean> {
  const [user] = await db
    .select({ onboardingCompleted: users.onboardingCompleted })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return user?.onboardingCompleted ?? false;
}

/**
 * Validate an auth token from the otp_verifications table.
 * Used for OTP-based login and auto-login after signup verification.
 * Returns the user ID if valid, null otherwise.
 */
async function validateAuthToken(authToken: string): Promise<string | null> {
  const now = new Date();

  // Find the most recent unused auto_login token
  const records = await db
    .select({
      id: otpVerifications.id,
      userId: otpVerifications.userId,
      otpCode: otpVerifications.otpCode,
    })
    .from(otpVerifications)
    .where(
      and(
        eq(otpVerifications.purpose, "auto_login"),
        eq(otpVerifications.isUsed, false),
        gt(otpVerifications.expiresAt, now),
      ),
    );

  // Check each token (we need to bcrypt compare)
  for (const record of records) {
    if (!record.userId) continue;
    const matches = await bcrypt.compare(authToken, record.otpCode);
    if (matches) {
      // Mark as used
      await db
        .update(otpVerifications)
        .set({ isUsed: true, verifiedAt: now })
        .where(eq(otpVerifications.id, record.id));
      return record.userId;
    }
  }

  return null;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  providers: [
    Credentials({
      credentials: {
        identifier: { label: "Email, phone, or username", type: "text" },
        password: { label: "Password", type: "password" },
        loginMethod: { label: "Login method", type: "text" },
        authToken: { label: "Auth token", type: "text" },
        pin: { label: "PIN", type: "text" },
        email: { label: "Email", type: "email" },
      },
      async authorize(credentials) {
        const identifier = (credentials?.identifier ?? credentials?.email) as string | undefined;
        const loginMethod = (credentials?.loginMethod as string) || "password";

        // ─── OTP Login (auth token) ───────────────────────────────
        if (loginMethod === "otp") {
          const authToken = credentials?.authToken as string | undefined;
          if (!authToken) return null;

          const userId = await validateAuthToken(authToken);
          if (!userId) return null;

          const [user] = await db
            .select({
              id: users.id,
              email: users.email,
              name: users.name,
              role: users.role,
              orgId: users.orgId,
              isBanned: users.isBanned,
              isActive: users.isActive,
              emailVerified: users.emailVerified,
              loginCount: users.loginCount,
            })
            .from(users)
            .where(eq(users.id, userId))
            .limit(1);

          if (!user) return null;
          if (user.isBanned || !user.isActive) return null;

          // Update login tracking
          await db
            .update(users)
            .set({
              lastLoginAt: new Date(),
              loginCount: user.loginCount + 1,
              updatedAt: new Date(),
            })
            .where(eq(users.id, user.id));

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            orgId: user.orgId,
            emailVerified: !!user.emailVerified,
          };
        }

        // ─── PIN Login ────────────────────────────────────────────
        if (loginMethod === "pin") {
          const pin = credentials?.pin as string | undefined;
          if (!identifier || !pin) throw new Error("MISSING_CREDENTIALS");

          // Detect identifier type
          let whereClause;
          if (identifier.includes("@")) {
            whereClause = eq(users.email, identifier);
          } else if (identifier.startsWith("+") || /^\d{10,}$/.test(identifier)) {
            whereClause = eq(users.phone, identifier);
          } else {
            whereClause = eq(users.username, identifier);
          }

          const [user] = await db
            .select({
              id: users.id,
              email: users.email,
              name: users.name,
              role: users.role,
              pinHash: users.pinHash,
              orgId: users.orgId,
              isBanned: users.isBanned,
              isActive: users.isActive,
              emailVerified: users.emailVerified,
              phoneVerified: users.phoneVerified,
              loginCount: users.loginCount,
              unverifiedLoginCount: users.unverifiedLoginCount,
            })
            .from(users)
            .where(whereClause)
            .limit(1);

          if (!user) throw new Error("USER_NOT_FOUND");
          if (!user.pinHash) throw new Error("PIN_NOT_SET");
          if (user.isBanned) throw new Error("ACCOUNT_BANNED");

          // Grace period: allow 5 unverified logins, then lock
          const isVerified = !!user.emailVerified && !!user.phoneVerified;
          const isAdmin = user.role === "admin" || user.role === "superadmin";
          if (!isVerified && !isAdmin) {
            if (user.unverifiedLoginCount >= 5) throw new Error("ACCOUNT_LOCKED_UNVERIFIED");
            if (!user.isActive) throw new Error("ACCOUNT_LOCKED");
          }

          const valid = await bcrypt.compare(pin, user.pinHash);
          if (!valid) throw new Error("INVALID_PIN");

          // Update login tracking + increment unverified count if needed
          const updateData: Record<string, unknown> = {
            lastLoginAt: new Date(),
            loginCount: user.loginCount + 1,
            updatedAt: new Date(),
          };
          if (!isVerified && !isAdmin) {
            updateData.unverifiedLoginCount = user.unverifiedLoginCount + 1;
            // Lock account after 5th unverified login
            if (user.unverifiedLoginCount + 1 >= 5) {
              updateData.isActive = false;
            }
          }
          await db.update(users).set(updateData).where(eq(users.id, user.id));

          return {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            orgId: user.orgId,
            emailVerified: !!user.emailVerified,
          };
        }

        // ─── Password Login (default) ────────────────────────────
        const password = credentials?.password as string | undefined;
        if (!identifier || !password) throw new Error("MISSING_CREDENTIALS");

        // Detect identifier type
        let whereClause;
        if (identifier.includes("@")) {
          whereClause = eq(users.email, identifier);
        } else if (identifier.startsWith("+") || /^\d{10,}$/.test(identifier)) {
          whereClause = eq(users.phone, identifier);
        } else {
          whereClause = eq(users.username, identifier);
        }

        const [user] = await db
          .select({
            id: users.id,
            email: users.email,
            name: users.name,
            role: users.role,
            passwordHash: users.passwordHash,
            orgId: users.orgId,
            isBanned: users.isBanned,
            isActive: users.isActive,
            emailVerified: users.emailVerified,
            phoneVerified: users.phoneVerified,
            phone: users.phone,
            loginCount: users.loginCount,
            unverifiedLoginCount: users.unverifiedLoginCount,
          })
          .from(users)
          .where(whereClause)
          .limit(1);

        if (!user) throw new Error("USER_NOT_FOUND");
        if (!user.passwordHash) throw new Error("USER_NOT_FOUND");
        if (user.isBanned) throw new Error("ACCOUNT_BANNED");

        // Grace period: allow 5 unverified logins, then lock
        const isVerified = !!user.emailVerified && (!user.phone || !!user.phoneVerified);
        const isAdmin = user.role === "admin" || user.role === "superadmin";
        if (!isVerified && !isAdmin) {
          if (user.unverifiedLoginCount >= 5) throw new Error("ACCOUNT_LOCKED_UNVERIFIED");
          if (!user.isActive) throw new Error("ACCOUNT_LOCKED");
        }

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) throw new Error("INVALID_PASSWORD");

        // Update login tracking + increment unverified count if needed
        const updateData: Record<string, unknown> = {
          lastLoginAt: new Date(),
          loginCount: user.loginCount + 1,
          updatedAt: new Date(),
        };
        if (!isVerified && !isAdmin) {
          updateData.unverifiedLoginCount = user.unverifiedLoginCount + 1;
          // Lock account after 5th unverified login
          if (user.unverifiedLoginCount + 1 >= 5) {
            updateData.isActive = false;
          }
        }
        await db.update(users).set(updateData).where(eq(users.id, user.id));

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          orgId: user.orgId,
          emailVerified: !!user.emailVerified,
        };
      },
    }),
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }),
        ]
      : []),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "google") {
        const email = user.email;
        if (!email) return false;

        const [existing] = await db
          .select({ id: users.id, isBanned: users.isBanned, isActive: users.isActive })
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        if (existing) {
          if (existing.isBanned || !existing.isActive) return false;
          await db
            .update(users)
            .set({
              googleId: account.providerAccountId,
              avatarUrl: user.image,
              lastLoginAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(users.id, existing.id));
          return true;
        }

        // Create new user from Google OAuth
        await db.insert(users).values({
          email,
          name: user.name ?? "User",
          googleId: account.providerAccountId,
          avatarUrl: user.image,
          authProvider: "google",
          emailVerified: new Date(),
          role: "student",
          orgId: DEFAULT_ORG_ID,
          signupSource: "google",
        });
        return true;
      }
      return true;
    },
    async jwt({ token, user, account, trigger }) {
      if (user) {
        let userId: string;
        let role: string;
        let orgId: string | null;

        if (account?.provider === "google" && user.email) {
          const [dbUser] = await db
            .select({ id: users.id, role: users.role, orgId: users.orgId })
            .from(users)
            .where(eq(users.email, user.email))
            .limit(1);
          if (dbUser) {
            userId = dbUser.id;
            role = dbUser.role;
            orgId = dbUser.orgId;
          } else {
            return token;
          }
        } else {
          userId = user.id!;
          role = (user as { role: string }).role;
          orgId = (user as { orgId: string | null }).orgId;
        }

        token.userId = userId;
        token.role = role;
        token.orgId = orgId;
        token.emailVerified =
          account?.provider === "google"
            ? true
            : ((user as { emailVerified?: boolean }).emailVerified ?? true);

        // Check subscription and onboarding status
        const isAdmin = role === "admin" || role === "superadmin";
        token.isSubscriber = isAdmin || (await checkSubscription(userId));
        token.onboardingCompleted = isAdmin || (await checkOnboarding(userId));
      } else if (trigger === "update" && token.userId) {
        // Session refresh (e.g. after onboarding completion) — re-check from DB
        const userId = token.userId as string;
        const isAdmin = token.role === "admin" || token.role === "superadmin";
        token.onboardingCompleted = isAdmin || (await checkOnboarding(userId));
        token.isSubscriber = isAdmin || (await checkSubscription(userId));
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.userId as string;
      const user = session.user as unknown as Record<string, unknown>;
      user.role = token.role as string;
      user.orgId = (token.orgId as string) ?? null;
      user.isSubscriber = (token.isSubscriber as boolean) ?? false;
      user.onboardingCompleted = (token.onboardingCompleted as boolean) ?? false;
      user.emailVerified = (token.emailVerified as boolean) ?? true;
      return session;
    },
  },
});
