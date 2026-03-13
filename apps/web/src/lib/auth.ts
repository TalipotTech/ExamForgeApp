import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { createDatabase } from "@examforge/shared/db";
import { users } from "@examforge/shared/db/schema";

const db = createDatabase(process.env.DATABASE_URL!);

const DEFAULT_ORG_ID = "a0000000-0000-0000-0000-000000000001";

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
  providers: [
    Credentials({
      credentials: {
        identifier: { label: "Email, phone, or username", type: "text" },
        password: { label: "Password", type: "password" },
        email: { label: "Email", type: "email" },
      },
      async authorize(credentials) {
        const identifier = (credentials?.identifier ?? credentials?.email) as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!identifier || !password) return null;

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
            loginCount: users.loginCount,
          })
          .from(users)
          .where(whereClause)
          .limit(1);

        if (!user?.passwordHash) return null;
        if (user.isBanned || !user.isActive) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

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
    async jwt({ token, user, account }) {
      if (user) {
        if (account?.provider === "google" && user.email) {
          const [dbUser] = await db
            .select({ id: users.id, role: users.role, orgId: users.orgId })
            .from(users)
            .where(eq(users.email, user.email))
            .limit(1);
          if (dbUser) {
            token.userId = dbUser.id;
            token.role = dbUser.role;
            token.orgId = dbUser.orgId;
          }
        } else {
          token.userId = user.id!;
          token.role = (user as { role: string }).role;
          token.orgId = (user as { orgId: string | null }).orgId;
        }
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.userId as string;
      (session.user as { role: string }).role = token.role as string;
      (session.user as { orgId: string | null }).orgId = token.orgId as string | null;
      return session;
    },
  },
});
