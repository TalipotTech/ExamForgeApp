import { z } from "zod";
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure } from "../trpc.js";
import {
  users,
  subscriptionPlans,
  userSubscriptions,
  userCredits,
  otpVerifications,
} from "@examforge/shared/db/schema";
import {
  registerSchema,
  verifyOtpSchema,
  resendOtpSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  loginWithOtpRequestSchema,
  loginWithOtpVerifySchema,
  setPinSchema,
  removePinSchema,
} from "@examforge/shared/validators";
import type { Database } from "@examforge/shared/db";
import { getFlag } from "../../services/feature-flags.js";
import {
  generateOtp,
  verifyOtp as verifyOtpService,
  resendOtp as resendOtpService,
} from "../../services/otp-service.js";
import { sendOtpEmail } from "../../services/email-service.js";

// Default org ID for now (single-tenant MVP)
const DEFAULT_ORG_ID = "a0000000-0000-0000-0000-000000000001";

/**
 * Generate a short-lived auth token stored in otp_verifications table.
 * Used for auto-login after OTP verification (signup or OTP login).
 */
async function generateAuthToken(
  db: Database,
  userId: string,
  identifier: string,
): Promise<string> {
  const token = randomUUID();
  const tokenHash = await bcrypt.hash(token, 10);
  const expiresAt = new Date(Date.now() + 60 * 1000); // 60 seconds

  await db.insert(otpVerifications).values({
    userId,
    identifier,
    identifierType: "email",
    otpCode: tokenHash,
    purpose: "auto_login",
    expiresAt,
  });

  return token;
}

export const authRouter = router({
  // ─── Registration (unified single form) ──────────────────────────────
  register: publicProcedure.input(registerSchema).mutation(async ({ ctx, input }) => {
    const { db } = ctx;

    // Check feature flags
    const signupEnabled = await getFlag(db, "auth.signup_enabled");
    if (!signupEnabled) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Registration is currently closed." });
    }

    // Check uniqueness for all three identifiers
    const [existingEmail] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1);
    if (existingEmail) {
      throw new TRPCError({ code: "CONFLICT", message: "Email already registered." });
    }

    const [existingPhone] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.phone, input.phone))
      .limit(1);
    if (existingPhone) {
      throw new TRPCError({ code: "CONFLICT", message: "Phone number already registered." });
    }

    const [existingUsername] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, input.username))
      .limit(1);
    if (existingUsername) {
      throw new TRPCError({ code: "CONFLICT", message: "Username already taken." });
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

      const freeCredits = ((await getFlag(db, "feature.free_credits_on_signup")) as number) ?? 50;

      await db.insert(userCredits).values({
        userId: newUser.id,
        periodStart: periodStart.toISOString().split("T")[0]!,
        periodEnd: periodEnd.toISOString().split("T")[0]!,
        creditsTotal: freeCredits,
        creditsUsed: 0,
      });
    }

    // Check if email OTP verification is needed
    const emailOtpEnabled = await getFlag(db, "auth.email_otp_verification");

    // MVP: Phone is always auto-verified (SMS integration later)
    await db.update(users).set({ phoneVerified: new Date() }).where(eq(users.id, newUser.id));

    if (emailOtpEnabled) {
      // Generate email OTP and send it
      const { otpCode } = await generateOtp(db, {
        identifier: input.email,
        identifierType: "email",
        purpose: "signup",
        userId: newUser.id,
        ip: ctx.req.ip,
      });

      // Send OTP via email (Resend in prod, console.log in dev)
      await sendOtpEmail(input.email, otpCode, "signup");

      return {
        success: true as const,
        requiresVerification: true as const,
        email: input.email,
        phone: input.phone,
        emailOtpRequired: true,
        smsOtpRequired: false,
      };
    }

    // No email verification required — mark email as verified too
    await db.update(users).set({ emailVerified: new Date() }).where(eq(users.id, newUser.id));

    return {
      success: true as const,
      requiresVerification: false as const,
      email: input.email,
      phone: input.phone,
      emailOtpRequired: false,
      smsOtpRequired: false,
    };
  }),

  // ─── OTP Verification (supports dual-step for signup) ────────────────
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

    // Determine identifier type and update verification status
    const isEmail = input.identifier.includes("@");

    if (isEmail) {
      await db
        .update(users)
        .set({
          emailVerified: new Date(),
          unverifiedLoginCount: 0,
          isActive: true,
          updatedAt: new Date(),
        })
        .where(eq(users.email, input.identifier));
    } else {
      await db
        .update(users)
        .set({
          phoneVerified: new Date(),
          unverifiedLoginCount: 0,
          isActive: true,
          updatedAt: new Date(),
        })
        .where(eq(users.phone, input.identifier));
    }

    // For signup/verify_email purpose, check if both email and phone are now verified
    if (input.purpose === "signup" || input.purpose === "verify_email") {
      // Find the user by this identifier
      const [user] = isEmail
        ? await db
            .select({
              id: users.id,
              email: users.email,
              phone: users.phone,
              emailVerified: users.emailVerified,
              phoneVerified: users.phoneVerified,
            })
            .from(users)
            .where(eq(users.email, input.identifier))
            .limit(1)
        : await db
            .select({
              id: users.id,
              email: users.email,
              phone: users.phone,
              emailVerified: users.emailVerified,
              phoneVerified: users.phoneVerified,
            })
            .from(users)
            .where(eq(users.phone, input.identifier))
            .limit(1);

      if (user) {
        // After our update, re-check: is the OTHER identifier also verified?
        const emailDone = isEmail ? true : !!user.emailVerified;
        const phoneDone = isEmail ? !!user.phoneVerified : true;

        if (emailDone && phoneDone) {
          // Both verified — generate auth token for auto sign-in
          const authToken = await generateAuthToken(
            db,
            user.id,
            user.email ?? user.phone ?? input.identifier,
          );
          return {
            success: true as const,
            fullyVerified: true as const,
            authToken,
          };
        }

        // Only one done — tell frontend to verify the other
        const nextIdentifier = isEmail ? user.phone : user.email;
        const nextType = isEmail ? "phone" : "email";
        return {
          success: true as const,
          fullyVerified: false as const,
          authToken: null,
          nextIdentifier: nextIdentifier ?? null,
          nextType: nextType as "email" | "phone",
        };
      }
    }

    // Non-signup flows (login OTP, etc.) — single-step verification
    return {
      success: true as const,
      fullyVerified: true as const,
      authToken: null,
      nextIdentifier: null,
      nextType: null,
    };
  }),

  // ─── Resend OTP ──────────────────────────────────────────────────────
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

    // Send the new OTP via email if it's an email identifier
    if (input.identifierType === "email" && result.otpCode) {
      await sendOtpEmail(input.identifier, result.otpCode, input.purpose);
    }
    // MVP: SMS OTP not sent (phone auto-verified, SMS integration later)

    return { success: true };
  }),

  // ─── OTP Login: Request OTP ──────────────────────────────────────────
  loginWithOtpRequest: publicProcedure
    .input(loginWithOtpRequestSchema)
    .mutation(async ({ ctx, input }) => {
      const { db } = ctx;
      const { identifier } = input;

      // Detect identifier type
      const isEmail = identifier.includes("@");
      const isPhone = identifier.startsWith("+") || /^\d{10,}$/.test(identifier);

      if (!isEmail && !isPhone) {
        // Username — can't send OTP to a username
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "OTP login requires an email address or phone number.",
        });
      }

      const identifierType = isEmail ? "email" : "phone";

      // Look up user (don't reveal existence)
      const [user] = isEmail
        ? await db
            .select({
              id: users.id,
              isBanned: users.isBanned,
              isActive: users.isActive,
              emailVerified: users.emailVerified,
              phoneVerified: users.phoneVerified,
            })
            .from(users)
            .where(eq(users.email, identifier))
            .limit(1)
        : await db
            .select({
              id: users.id,
              isBanned: users.isBanned,
              isActive: users.isActive,
              emailVerified: users.emailVerified,
              phoneVerified: users.phoneVerified,
            })
            .from(users)
            .where(eq(users.phone, identifier))
            .limit(1);

      if (!user) {
        // Don't reveal user existence — silently succeed
        return { success: true };
      }

      if (user.isBanned || !user.isActive) {
        return { success: true };
      }

      // Locked accounts (unverified login limit reached) — silent success
      if (!user.isActive) {
        return { success: true };
      }

      const { otpCode } = await generateOtp(db, {
        identifier,
        identifierType,
        purpose: "login",
        userId: user.id,
        ip: ctx.req.ip,
      });

      // Send OTP via email for email-based login
      if (identifierType === "email") {
        await sendOtpEmail(identifier, otpCode, "login");
      }
      // MVP: SMS OTP not sent (phone-based OTP login not supported yet)

      return { success: true };
    }),

  // ─── OTP Login: Verify OTP ───────────────────────────────────────────
  loginWithOtpVerify: publicProcedure
    .input(loginWithOtpVerifySchema)
    .mutation(async ({ ctx, input }) => {
      const { db } = ctx;

      const result = await verifyOtpService(db, {
        identifier: input.identifier,
        otp: input.otp,
        purpose: "login",
      });

      if (!result.success) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: result.error ?? "Invalid OTP",
        });
      }

      if (!result.userId) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "OTP verified but no user linked.",
        });
      }

      // Generate auth token for NextAuth sign-in
      const authToken = await generateAuthToken(db, result.userId, input.identifier);

      return { success: true, authToken };
    }),

  // ─── PIN Management ──────────────────────────────────────────────────
  setPin: protectedProcedure.input(setPinSchema).mutation(async ({ ctx, input }) => {
    const { db } = ctx;

    // Get current user's password hash
    const [user] = await db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, ctx.userId))
      .limit(1);

    if (!user?.passwordHash) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Cannot set PIN for accounts without a password (e.g., Google OAuth).",
      });
    }

    const passwordValid = await bcrypt.compare(input.currentPassword, user.passwordHash);
    if (!passwordValid) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Incorrect password." });
    }

    const pinHash = await bcrypt.hash(input.pin, 10);
    await db.update(users).set({ pinHash, updatedAt: new Date() }).where(eq(users.id, ctx.userId));

    return { success: true };
  }),

  removePin: protectedProcedure.input(removePinSchema).mutation(async ({ ctx, input }) => {
    const { db } = ctx;

    const [user] = await db
      .select({ passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.id, ctx.userId))
      .limit(1);

    if (!user?.passwordHash) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "No password set on this account." });
    }

    const passwordValid = await bcrypt.compare(input.currentPassword, user.passwordHash);
    if (!passwordValid) {
      throw new TRPCError({ code: "FORBIDDEN", message: "Incorrect password." });
    }

    await db
      .update(users)
      .set({ pinHash: null, updatedAt: new Date() })
      .where(eq(users.id, ctx.userId));

    return { success: true };
  }),

  hasPin: protectedProcedure.query(async ({ ctx }) => {
    const [user] = await ctx.db
      .select({ pinHash: users.pinHash })
      .from(users)
      .where(eq(users.id, ctx.userId))
      .limit(1);

    return { hasPin: !!user?.pinHash };
  }),

  // ─── Forgot Password (email or phone) ───────────────────────────────
  forgotPassword: publicProcedure.input(forgotPasswordSchema).mutation(async ({ ctx, input }) => {
    const { db } = ctx;
    const { identifier, identifierType } = input;

    const whereClause =
      identifierType === "email" ? eq(users.email, identifier) : eq(users.phone, identifier);

    const [user] = await db.select({ id: users.id }).from(users).where(whereClause).limit(1);

    // Don't reveal if user exists
    if (!user) {
      return { success: true };
    }

    const { otpCode } = await generateOtp(db, {
      identifier,
      identifierType,
      purpose: "reset_password",
      userId: user.id,
      ip: ctx.req.ip,
    });

    // Send OTP via email for email-based password reset
    if (identifierType === "email") {
      await sendOtpEmail(identifier, otpCode, "reset_password");
    }
    // MVP: SMS OTP not sent (phone-based reset not supported yet)

    return { success: true };
  }),

  // ─── Reset Password ─────────────────────────────────────────────────
  resetPassword: publicProcedure.input(resetPasswordSchema).mutation(async ({ ctx, input }) => {
    const { db } = ctx;

    const result = await verifyOtpService(db, {
      identifier: input.identifier,
      otp: input.otp,
      purpose: "reset_password",
    });

    if (!result.success) {
      throw new TRPCError({ code: "BAD_REQUEST", message: result.error ?? "Invalid OTP" });
    }

    const whereClause =
      input.identifierType === "email"
        ? eq(users.email, input.identifier)
        : eq(users.phone, input.identifier);

    const passwordHash = await bcrypt.hash(input.newPassword, 12);
    await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(whereClause);

    return { success: true };
  }),

  // ─── Get current user profile ────────────────────────────────────────
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
        unverifiedLoginCount: users.unverifiedLoginCount,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, ctx.userId))
      .limit(1);

    return user ?? null;
  }),

  // ─── Request verification OTP (for logged-in unverified users) ──────
  requestVerificationOtp: protectedProcedure.mutation(async ({ ctx }) => {
    const { db } = ctx;

    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        emailVerified: users.emailVerified,
      })
      .from(users)
      .where(eq(users.id, ctx.userId))
      .limit(1);

    if (!user?.email || user.emailVerified) {
      return { success: true }; // Already verified or no email
    }

    const { otpCode } = await generateOtp(db, {
      identifier: user.email,
      identifierType: "email",
      purpose: "verify_email",
      userId: user.id,
      ip: ctx.req.ip,
    });

    await sendOtpEmail(user.email, otpCode, "verify_email");
    return { success: true, email: user.email };
  }),

  // ─── Pre-validate login (returns specific error codes for UI) ──────
  preValidateLogin: publicProcedure
    .input(
      z.object({
        identifier: z.string().min(1),
        password: z.string().optional(),
        pin: z.string().optional(),
        loginMethod: z.enum(["password", "pin"]).default("password"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db } = ctx;
      const { identifier, loginMethod } = input;

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
          phone: users.phone,
          passwordHash: users.passwordHash,
          pinHash: users.pinHash,
          isBanned: users.isBanned,
          isActive: users.isActive,
          emailVerified: users.emailVerified,
          phoneVerified: users.phoneVerified,
          unverifiedLoginCount: users.unverifiedLoginCount,
          role: users.role,
        })
        .from(users)
        .where(whereClause)
        .limit(1);

      if (!user) {
        return { valid: false as const, code: "USER_NOT_FOUND" as const };
      }

      if (user.isBanned) {
        return { valid: false as const, code: "ACCOUNT_BANNED" as const };
      }

      // Grace period check
      const isVerified = !!user.emailVerified && !!user.phoneVerified;
      const isAdmin = user.role === "admin" || user.role === "superadmin";
      if (!isVerified && !isAdmin) {
        if (user.unverifiedLoginCount >= 5) {
          return {
            valid: false as const,
            code: "ACCOUNT_LOCKED_UNVERIFIED" as const,
            email: user.email,
          };
        }
        if (!user.isActive) {
          return { valid: false as const, code: "ACCOUNT_LOCKED" as const };
        }
      }

      if (loginMethod === "pin") {
        if (!user.pinHash) {
          return { valid: false as const, code: "PIN_NOT_SET" as const };
        }
        if (input.pin) {
          const pinValid = await bcrypt.compare(input.pin, user.pinHash);
          if (!pinValid) {
            return { valid: false as const, code: "INVALID_PIN" as const };
          }
        }
      } else {
        if (!user.passwordHash) {
          return { valid: false as const, code: "USER_NOT_FOUND" as const };
        }
        if (input.password) {
          const passValid = await bcrypt.compare(input.password, user.passwordHash);
          if (!passValid) {
            return { valid: false as const, code: "INVALID_PASSWORD" as const };
          }
        }
      }

      return {
        valid: true as const,
        code: "OK" as const,
        isVerified,
        unverifiedLoginCount: isVerified ? 0 : user.unverifiedLoginCount,
        email: user.email,
      };
    }),

  // ─── Feature flags for frontend ─────────────────────────────────────
  checkUserExists: publicProcedure
    .input(z.object({ identifier: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const { db } = ctx;
      const { identifier } = input;

      let whereClause;
      if (identifier.includes("@")) {
        whereClause = eq(users.email, identifier);
      } else if (identifier.startsWith("+") || /^\d{10,}$/.test(identifier)) {
        whereClause = eq(users.phone, identifier);
      } else {
        whereClause = eq(users.email, identifier);
      }

      const [user] = await db.select({ id: users.id }).from(users).where(whereClause).limit(1);

      return { exists: !!user };
    }),

  getAuthFlags: publicProcedure.query(async ({ ctx }) => {
    const { db } = ctx;
    const flags = {
      signupEnabled: (await getFlag(db, "auth.signup_enabled")) as boolean,
      googleOAuthEnabled: (await getFlag(db, "auth.google_oauth_enabled")) as boolean,
      emailPasswordEnabled: (await getFlag(db, "auth.email_password_enabled")) as boolean,
      phonePasswordEnabled: (await getFlag(db, "auth.phone_password_enabled")) as boolean,
      usernameLoginEnabled: (await getFlag(db, "auth.username_login_enabled")) as boolean,
      emailOtpVerification: (await getFlag(db, "auth.email_otp_verification")) as boolean,
      smsOtpVerification: (await getFlag(db, "auth.sms_otp_verification")) as boolean,
      otpLoginEnabled: ((await getFlag(db, "auth.otp_login_enabled")) as boolean) ?? true,
      pinLoginEnabled: ((await getFlag(db, "auth.pin_login_enabled")) as boolean) ?? true,
    };
    return flags;
  }),
});
