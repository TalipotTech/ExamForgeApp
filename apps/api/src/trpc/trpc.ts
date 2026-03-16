import { initTRPC, TRPCError } from "@trpc/server";
import { ZodError } from "zod";
import type { Context } from "./context.js";
import { isUserSubscriber } from "../services/subscription-guard.js";

const t = initTRPC.context<Context>().create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      message:
        error.cause instanceof ZodError
          ? error.cause.errors.map((e) => e.message).join(". ")
          : shape.message,
      data: {
        ...shape.data,
        zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

const isAuthed = t.middleware(({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
  }
  return next({
    ctx: {
      ...ctx,
      userId: ctx.userId,
      userRole: ctx.userRole!,
      orgId: ctx.orgId,
    },
  });
});

const isAdmin = t.middleware(({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
  }
  if (ctx.userRole !== "admin" && ctx.userRole !== "superadmin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({
    ctx: {
      ...ctx,
      userId: ctx.userId,
      userRole: ctx.userRole!,
      orgId: ctx.orgId,
    },
  });
});

const isSuperAdmin = t.middleware(({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
  }
  if (ctx.userRole !== "superadmin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Superadmin access required" });
  }
  return next({
    ctx: {
      ...ctx,
      userId: ctx.userId,
      userRole: ctx.userRole!,
      orgId: ctx.orgId,
    },
  });
});

const isSubscribed = t.middleware(async ({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
  }
  // Admins always have subscriber access
  if (ctx.userRole === "admin" || ctx.userRole === "superadmin") {
    return next({
      ctx: {
        ...ctx,
        userId: ctx.userId,
        userRole: ctx.userRole!,
        orgId: ctx.orgId,
      },
    });
  }
  const subscribed = await isUserSubscriber(ctx.db, ctx.userId);
  if (!subscribed) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This feature requires an active subscription. Please upgrade your plan.",
    });
  }
  return next({
    ctx: {
      ...ctx,
      userId: ctx.userId,
      userRole: ctx.userRole!,
      orgId: ctx.orgId,
    },
  });
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const protectedProcedure = t.procedure.use(isAuthed);
export const subscriberProcedure = t.procedure.use(isSubscribed);
export const adminProcedure = t.procedure.use(isAdmin);
export const superAdminProcedure = t.procedure.use(isSuperAdmin);
export const middleware = t.middleware;
