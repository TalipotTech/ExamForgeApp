import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure } from "../trpc.js";
import {
  users,
  subscriptionPlans,
  userSubscriptions,
  userCredits,
} from "@examforge/shared/db/schema";
import {
  registerSchema,
  verifyOtpSchema,
  resendOtpSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "@examforge/shared/validators";
import { getFlag } from "../../services/feature-flags.js";
import {
  generateOtp,
  verifyOtp as verifyOtpService,
  resendOtp as resendOtpService,
} from "../../services/otp-service.js";

// Default org ID for now (single-tenant MVP)
const DEFAULT_ORG_ID = "a0000000-0000-0000-0000-000000000001";

export const authRouter = router({
  register: publicProcedure.input(registerSchema).mutation(async ({ ctx, input }) => {
    const { db } = ctx;

    // Check feature flags
    const signupEnabled = await getFlag(db, "auth.signup_enabled");
    if (!signupEnabled) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Registration is currently closed." });
    }

    if (input.method === "email" || input.method === "username_email") {
      const emailEnabled = await getFlag(db, "auth.email_password_enabled");
      if (!emailEnabled) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Email registration is disabled." });
      }
    }

    if (input.method === "phone") {
      const phoneEnabled = await getFlag(db, "auth.phone_password_enabled");
      if (!phoneEnabled) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Phone registration is disabled." });
      }
    }

    // Check uniqueness
    if (input.email) {
      const [existing] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, input.email))
        .limit(1);
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "Email already registered." });
      }
    }

    if (input.phone) {
      const [existing] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.phone, input.phone))
        .limit(1);
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "Phone number already registered." });
      }
    }

    if (input.username) {
      const [existing] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.username, input.username))
        .limit(1);
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "Username already taken." });
      }
    }

    // Hash password
    const passwordHash = await bcrypt.hash(input.password, 12);

    // Create user
    const [newUser] = await db
      .insert(users)
      .values({
        email: input.email,
        phone: input.phone,
        username: input.username,
        name: input.name,
        passwordHash,
        role: "student",
        authProvider: "credentials",
        orgId: DEFAULT_ORG_ID,
        signupSource: "web",
      })
      .returning({ id: users.id });

    if (!newUser) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create user" });
    }

    // Create free subscription
    const [freePlan] = await db
      .select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.name, "free"))
      .limit(1);

    if (freePlan) {
      const now = new Date();
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);

      await db.insert(userSubscriptions).values({
        userId: newUser.id,
        planId: freePlan.id,
        status: "active",
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
      });

      // Get free credits from feature flag
      const freeCredits = ((await getFlag(db, "feature.free_credits_on_signup")) as number) ?? 50;

      await db.insert(userCredits).values({
        userId: newUser.id,
        periodStart: periodStart.toISOString().split("T")[0]!,
        periodEnd: periodEnd.toISOString().split("T")[0]!,
        creditsTotal: freeCredits,
        creditsUsed: 0,
      });
    }

    // Check if OTP verification is needed
    const emailOtpEnabled = await getFlag(db, "auth.email_otp_verification");
    const smsOtpEnabled = await getFlag(db, "auth.sms_otp_verification");

    if (emailOtpEnabled && input.email) {
      await generateOtp(db, {
        identifier: input.email,
        identifierType: "email",
        purpose: "signup",
        userId: newUser.id,
        ip: ctx.req.ip,
      });

      return {
        success: true,
        requiresVerification: true,
        verificationType: "email" as const,
        identifier: input.email,
      };
    }

    if (smsOtpEnabled && input.phone) {
      await generateOtp(db, {
        identifier: input.phone,
        identifierType: "phone",
        purpose: "signup",
        userId: newUser.id,
        ip: ctx.req.ip,
      });

      return {
        success: true,
        requiresVerification: true,
        verificationType: "phone" as const,
        identifier: input.phone,
      };
    }

    // No verification required — mark as verified
    if (input.email) {
      await db.update(users).set({ emailVerified: new Date() }).where(eq(users.id, newUser.id));
    }

    return {
      success: true,
      requiresVerification: false,
      verificationType: null,
      identifier: input.email ?? input.phone ?? input.username ?? "",
    };
  }),

  verifyOtp: publicProcedure.input(verifyOtpSchema).mutation(async ({ ctx, input }) => {
    const { db } = ctx;

    const result = await verifyOtpService(db, {
      identifier: input.identifier,
      otp: input.otp,
      purpose: input.purpose,
    });

    if (!result.success) {
      throw new TRPCError({ code: "BAD_REQUEST", message: result.error ?? "Verification failed" });
    }

    // Update user verification status
    if (input.identifier.includes("@")) {
      await db
        .update(users)
        .set({ emailVerified: new Date() })
        .where(eq(users.email, input.identifier));
    } else {
      await db
        .update(users)
        .set({ phoneVerified: new Date() })
        .where(eq(users.phone, input.identifier));
    }

    return { success: true };
  }),

  resendOtp: publicProcedure.input(resendOtpSchema).mutation(async ({ ctx, input }) => {
    const result = await resendOtpService(ctx.db, {
      identifier: input.identifier,
      identifierType: input.identifierType,
      purpose: input.purpose,
      ip: ctx.req.ip,
    });

    if (!result.success) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `Please wait ${result.cooldownSeconds} seconds before requesting a new OTP.`,
      });
    }

    // Send OTP via appropriate channel
    if (input.identifierType === "email") {
      // OTP is already logged by otp-service, email will be sent via email-service when Resend is configured
    }

    return { success: true };
  }),

  forgotPassword: publicProcedure.input(forgotPasswordSchema).mutation(async ({ ctx, input }) => {
    const { db } = ctx;

    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1);

    // Don't reveal if email exists
    if (!user) {
      return { success: true };
    }

    await generateOtp(db, {
      identifier: input.email,
      identifierType: "email",
      purpose: "reset_password",
      userId: user.id,
      ip: ctx.req.ip,
    });

    return { success: true };
  }),

  resetPassword: publicProcedure.input(resetPasswordSchema).mutation(async ({ ctx, input }) => {
    const { db } = ctx;

    const result = await verifyOtpService(db, {
      identifier: input.email,
      otp: input.otp,
      purpose: "reset_password",
    });

    if (!result.success) {
      throw new TRPCError({ code: "BAD_REQUEST", message: result.error ?? "Invalid OTP" });
    }

    const passwordHash = await bcrypt.hash(input.newPassword, 12);
    await db
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.email, input.email));

    return { success: true };
  }),

  // Get current user profile (for authenticated users)
  me: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.userId) return null;

    const [user] = await ctx.db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        username: users.username,
        phone: users.phone,
        role: users.role,
        avatarUrl: users.avatarUrl,
        emailVerified: users.emailVerified,
        phoneVerified: users.phoneVerified,
        authProvider: users.authProvider,
        isActive: users.isActive,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, ctx.userId))
      .limit(1);

    return user ?? null;
  }),

  // Get feature flags relevant to auth (for frontend)
  getAuthFlags: publicProcedure.query(async ({ ctx }) => {
    const { db } = ctx;
    const flags = {
      signupEnabled: (await getFlag(db, "auth.signup_enabled")) as boolean,
      googleOAuthEnabled: (await getFlag(db, "auth.google_oauth_enabled")) as boolean,
      emailPasswordEnabled: (await getFlag(db, "auth.email_password_enabled")) as boolean,
      phonePasswordEnabled: (await getFlag(db, "auth.phone_password_enabled")) as boolean,
      usernameLoginEnabled: (await getFlag(db, "auth.username_login_enabled")) as boolean,
      emailOtpVerification: (await getFlag(db, "auth.email_otp_verification")) as boolean,
    };
    return flags;
  }),
});
