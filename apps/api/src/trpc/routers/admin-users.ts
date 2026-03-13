import { z } from "zod";
import bcrypt from "bcryptjs";
import { eq, and, or, ilike, desc, asc, sql, count } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, adminProcedure } from "../trpc.js";
import {
  users,
  userSubscriptions,
  userCredits,
  subscriptionPlans,
  authSessions,
  adminAuditLog,
} from "@examforge/shared/db/schema";
import { updateUserAdminSchema } from "@examforge/shared/validators";
import { createAuditEntry } from "../../services/audit-log.js";

export const adminUsersRouter = router({
  list: adminProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(20),
        search: z.string().optional(),
        role: z.enum(["student", "teacher", "admin", "superadmin"]).optional(),
        status: z.enum(["active", "inactive", "banned", "unverified"]).optional(),
        sortBy: z.enum(["name", "createdAt", "lastLoginAt", "loginCount"]).default("createdAt"),
        sortOrder: z.enum(["asc", "desc"]).default("desc"),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { db } = ctx;
      const offset = (input.page - 1) * input.limit;

      const conditions = [];

      if (input.search) {
        const term = `%${input.search}%`;
        conditions.push(
          or(
            ilike(users.name, term),
            ilike(users.email, term),
            ilike(users.phone, term),
            ilike(users.username, term),
          ),
        );
      }

      if (input.role) {
        conditions.push(eq(users.role, input.role));
      }

      if (input.status === "active") {
        conditions.push(and(eq(users.isActive, true), eq(users.isBanned, false)));
      } else if (input.status === "inactive") {
        conditions.push(eq(users.isActive, false));
      } else if (input.status === "banned") {
        conditions.push(eq(users.isBanned, true));
      } else if (input.status === "unverified") {
        conditions.push(sql`email_verified IS NULL AND phone_verified IS NULL`);
      }

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const sortColumn = {
        name: users.name,
        createdAt: users.createdAt,
        lastLoginAt: users.lastLoginAt,
        loginCount: users.loginCount,
      }[input.sortBy];

      const orderFn = input.sortOrder === "asc" ? asc : desc;

      const [items, totalResult] = await Promise.all([
        db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            phone: users.phone,
            username: users.username,
            role: users.role,
            avatarUrl: users.avatarUrl,
            isActive: users.isActive,
            isBanned: users.isBanned,
            emailVerified: users.emailVerified,
            phoneVerified: users.phoneVerified,
            authProvider: users.authProvider,
            lastLoginAt: users.lastLoginAt,
            loginCount: users.loginCount,
            createdAt: users.createdAt,
          })
          .from(users)
          .where(where)
          .orderBy(orderFn(sortColumn))
          .limit(input.limit)
          .offset(offset),
        db.select({ count: count() }).from(users).where(where),
      ]);

      const total = totalResult[0]!;
      return {
        items,
        total: total.count,
        page: input.page,
        totalPages: Math.ceil(total.count / input.limit),
      };
    }),

  getById: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { db } = ctx;

      const [user] = await db.select().from(users).where(eq(users.id, input.id)).limit(1);
      if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });

      // Get subscription
      const [sub] = await db
        .select({
          planName: subscriptionPlans.name,
          planDisplayName: subscriptionPlans.displayName,
          status: userSubscriptions.status,
          billingCycle: userSubscriptions.billingCycle,
          currentPeriodEnd: userSubscriptions.currentPeriodEnd,
        })
        .from(userSubscriptions)
        .innerJoin(subscriptionPlans, eq(userSubscriptions.planId, subscriptionPlans.id))
        .where(and(eq(userSubscriptions.userId, input.id), eq(userSubscriptions.status, "active")))
        .limit(1);

      // Get credits
      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const [credits] = await db
        .select()
        .from(userCredits)
        .where(
          and(
            eq(userCredits.userId, input.id),
            eq(userCredits.periodStart, periodStart.toISOString().split("T")[0]!),
          ),
        )
        .limit(1);

      // Recent audit log
      const auditLog = await db
        .select()
        .from(adminAuditLog)
        .where(and(eq(adminAuditLog.targetType, "user"), eq(adminAuditLog.targetId, input.id)))
        .orderBy(desc(adminAuditLog.createdAt))
        .limit(20);

      // Recent sessions
      const sessions = await db
        .select()
        .from(authSessions)
        .where(eq(authSessions.userId, input.id))
        .orderBy(desc(authSessions.createdAt))
        .limit(10);

      return {
        user,
        subscription: sub ?? null,
        credits: credits
          ? {
              total: credits.creditsTotal,
              used: credits.creditsUsed,
              remaining: credits.creditsTotal - credits.creditsUsed,
            }
          : null,
        auditLog,
        sessions,
      };
    }),

  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        email: z.string().email(),
        password: z.string().min(8),
        role: z.enum(["student", "teacher", "admin", "superadmin"]).default("student"),
        username: z.string().min(3).max(30).optional(),
        phone: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const passwordHash = await bcrypt.hash(input.password, 12);

      const [newUser] = await ctx.db
        .insert(users)
        .values({
          name: input.name,
          email: input.email,
          username: input.username,
          phone: input.phone,
          passwordHash,
          role: input.role,
          emailVerified: new Date(),
          isActive: true,
          authProvider: "credentials",
          orgId: ctx.orgId,
          signupSource: "admin_created",
        })
        .returning({ id: users.id });

      if (!newUser)
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create user" });

      await createAuditEntry(ctx.db, {
        adminId: ctx.userId,
        action: "user.create",
        targetType: "user",
        targetId: newUser.id,
        details: { after: { email: input.email, role: input.role } },
      });

      return newUser;
    }),

  update: adminProcedure.input(updateUserAdminSchema).mutation(async ({ ctx, input }) => {
    const { id, ...updates } = input;

    const [existing] = await ctx.db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (updates.name) updateData.name = updates.name;
    if (updates.email) updateData.email = updates.email;
    if (updates.phone !== undefined) updateData.phone = updates.phone;
    if (updates.username !== undefined) updateData.username = updates.username;
    if (updates.role) updateData.role = updates.role;

    await ctx.db.update(users).set(updateData).where(eq(users.id, id));

    await createAuditEntry(ctx.db, {
      adminId: ctx.userId,
      action: "user.update",
      targetType: "user",
      targetId: id,
      details: { before: { name: existing.name, email: existing.email }, after: updates },
    });

    return { success: true };
  }),

  changeRole: adminProcedure
    .input(
      z.object({
        userId: z.string().uuid(),
        role: z.enum(["student", "teacher", "admin", "superadmin"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [user] = await ctx.db
        .select({ role: users.role })
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });

      await ctx.db
        .update(users)
        .set({ role: input.role, updatedAt: new Date() })
        .where(eq(users.id, input.userId));

      await createAuditEntry(ctx.db, {
        adminId: ctx.userId,
        action: "user.change_role",
        targetType: "user",
        targetId: input.userId,
        details: { before: { role: user.role }, after: { role: input.role } },
      });

      return { success: true };
    }),

  changePlan: adminProcedure
    .input(z.object({ userId: z.string().uuid(), planName: z.enum(["free", "pro", "premium"]) }))
    .mutation(async ({ ctx, input }) => {
      const { db } = ctx;

      const [plan] = await db
        .select()
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.name, input.planName))
        .limit(1);
      if (!plan) throw new TRPCError({ code: "NOT_FOUND", message: "Plan not found" });

      // Deactivate current subscription
      await db
        .update(userSubscriptions)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(
          and(eq(userSubscriptions.userId, input.userId), eq(userSubscriptions.status, "active")),
        );

      // Create new subscription
      const now = new Date();
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      await db.insert(userSubscriptions).values({
        userId: input.userId,
        planId: plan.id,
        status: "active",
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      });

      await createAuditEntry(ctx.db, {
        adminId: ctx.userId,
        action: "user.change_plan",
        targetType: "user",
        targetId: input.userId,
        details: { after: { plan: input.planName } },
      });

      return { success: true };
    }),

  addCredits: adminProcedure
    .input(z.object({ userId: z.string().uuid(), amount: z.number().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      await ctx.db
        .insert(userCredits)
        .values({
          userId: input.userId,
          periodStart: periodStart.toISOString().split("T")[0]!,
          periodEnd: periodEnd.toISOString().split("T")[0]!,
          creditsTotal: input.amount,
          creditsUsed: 0,
        })
        .onConflictDoUpdate({
          target: [userCredits.userId, userCredits.periodStart],
          set: { creditsTotal: sql`${userCredits.creditsTotal} + ${input.amount}` },
        });

      await createAuditEntry(ctx.db, {
        adminId: ctx.userId,
        action: "user.add_credits",
        targetType: "user",
        targetId: input.userId,
        details: { after: { creditsAdded: input.amount } },
      });

      return { success: true };
    }),

  setCredits: adminProcedure
    .input(z.object({ userId: z.string().uuid(), amount: z.number().min(0) }))
    .mutation(async ({ ctx, input }) => {
      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      await ctx.db
        .insert(userCredits)
        .values({
          userId: input.userId,
          periodStart: periodStart.toISOString().split("T")[0]!,
          periodEnd: periodEnd.toISOString().split("T")[0]!,
          creditsTotal: input.amount,
          creditsUsed: 0,
        })
        .onConflictDoUpdate({
          target: [userCredits.userId, userCredits.periodStart],
          set: { creditsTotal: input.amount },
        });

      await createAuditEntry(ctx.db, {
        adminId: ctx.userId,
        action: "user.set_credits",
        targetType: "user",
        targetId: input.userId,
        details: { after: { creditsSet: input.amount } },
      });

      return { success: true };
    }),

  ban: adminProcedure
    .input(z.object({ userId: z.string().uuid(), reason: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(users)
        .set({ isBanned: true, banReason: input.reason, updatedAt: new Date() })
        .where(eq(users.id, input.userId));

      await createAuditEntry(ctx.db, {
        adminId: ctx.userId,
        action: "user.ban",
        targetType: "user",
        targetId: input.userId,
        details: { reason: input.reason },
      });

      return { success: true };
    }),

  unban: adminProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(users)
        .set({ isBanned: false, banReason: null, updatedAt: new Date() })
        .where(eq(users.id, input.userId));

      await createAuditEntry(ctx.db, {
        adminId: ctx.userId,
        action: "user.unban",
        targetType: "user",
        targetId: input.userId,
      });

      return { success: true };
    }),

  deactivate: adminProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(users)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(users.id, input.userId));

      await createAuditEntry(ctx.db, {
        adminId: ctx.userId,
        action: "user.deactivate",
        targetType: "user",
        targetId: input.userId,
      });

      return { success: true };
    }),

  reactivate: adminProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(users)
        .set({ isActive: true, updatedAt: new Date() })
        .where(eq(users.id, input.userId));

      await createAuditEntry(ctx.db, {
        adminId: ctx.userId,
        action: "user.reactivate",
        targetType: "user",
        targetId: input.userId,
      });

      return { success: true };
    }),

  verifyManually: adminProcedure
    .input(z.object({ userId: z.string().uuid(), type: z.enum(["email", "phone"]) }))
    .mutation(async ({ ctx, input }) => {
      const updateData =
        input.type === "email" ? { emailVerified: new Date() } : { phoneVerified: new Date() };

      await ctx.db
        .update(users)
        .set({ ...updateData, updatedAt: new Date() })
        .where(eq(users.id, input.userId));

      await createAuditEntry(ctx.db, {
        adminId: ctx.userId,
        action: "user.verify_manually",
        targetType: "user",
        targetId: input.userId,
        details: { after: { verified: input.type } },
      });

      return { success: true };
    }),

  resetPassword: adminProcedure
    .input(z.object({ userId: z.string().uuid(), newPassword: z.string().min(8) }))
    .mutation(async ({ ctx, input }) => {
      const passwordHash = await bcrypt.hash(input.newPassword, 12);
      await ctx.db
        .update(users)
        .set({ passwordHash, updatedAt: new Date() })
        .where(eq(users.id, input.userId));

      await createAuditEntry(ctx.db, {
        adminId: ctx.userId,
        action: "user.reset_password",
        targetType: "user",
        targetId: input.userId,
      });

      return { success: true };
    }),

  deleteUser: adminProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Soft delete: deactivate + anonymize PII
      await ctx.db
        .update(users)
        .set({
          isActive: false,
          email: null,
          phone: null,
          username: null,
          name: "Deleted User",
          passwordHash: null,
          avatarUrl: null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, input.userId));

      await createAuditEntry(ctx.db, {
        adminId: ctx.userId,
        action: "user.delete",
        targetType: "user",
        targetId: input.userId,
      });

      return { success: true };
    }),
});
