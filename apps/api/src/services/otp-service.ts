import bcrypt from "bcryptjs";
import { and, eq, gt, sql } from "drizzle-orm";
import type { Database } from "@examforge/shared/db";
import { otpVerifications } from "@examforge/shared/db/schema";

function generateOtpCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function generateOtp(
  db: Database,
  params: {
    identifier: string;
    identifierType: "email" | "phone";
    purpose: string;
    userId?: string;
    ip?: string;
    userAgent?: string;
  },
): Promise<{ otpId: string; expiresAt: Date }> {
  // Rate limit: max 3 OTPs per identifier per hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentOtps = await db
    .select({ id: otpVerifications.id })
    .from(otpVerifications)
    .where(
      and(
        eq(otpVerifications.identifier, params.identifier),
        eq(otpVerifications.purpose, params.purpose),
        gt(otpVerifications.createdAt, oneHourAgo),
      ),
    );

  if (recentOtps.length >= 3) {
    throw new Error("Too many OTP requests. Please try again later.");
  }

  // Invalidate old unused OTPs
  await db
    .update(otpVerifications)
    .set({ isUsed: true })
    .where(
      and(
        eq(otpVerifications.identifier, params.identifier),
        eq(otpVerifications.purpose, params.purpose),
        eq(otpVerifications.isUsed, false),
      ),
    );

  const otp = generateOtpCode();
  const otpHash = await bcrypt.hash(otp, 10);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  const [record] = await db
    .insert(otpVerifications)
    .values({
      userId: params.userId,
      identifier: params.identifier,
      identifierType: params.identifierType,
      otpCode: otpHash,
      purpose: params.purpose,
      expiresAt,
      ipAddress: params.ip,
      userAgent: params.userAgent,
    })
    .returning({ id: otpVerifications.id });

  // Log OTP to console in development
  console.log(`[OTP] ${params.identifier} (${params.purpose}): ${otp}`);

  if (!record) {
    throw new Error("Failed to create OTP record");
  }
  return { otpId: record.id, expiresAt };
}

export async function verifyOtp(
  db: Database,
  params: {
    identifier: string;
    otp: string;
    purpose: string;
  },
): Promise<{ success: boolean; userId?: string; error?: string }> {
  const now = new Date();

  const [record] = await db
    .select()
    .from(otpVerifications)
    .where(
      and(
        eq(otpVerifications.identifier, params.identifier),
        eq(otpVerifications.purpose, params.purpose),
        eq(otpVerifications.isUsed, false),
        gt(otpVerifications.expiresAt, now),
      ),
    )
    .orderBy(sql`created_at DESC`)
    .limit(1);

  if (!record) {
    return { success: false, error: "Invalid or expired OTP" };
  }

  if (record.attempts >= record.maxAttempts) {
    return { success: false, error: "Too many attempts. Request a new OTP." };
  }

  const isValid = await bcrypt.compare(params.otp, record.otpCode);

  if (!isValid) {
    await db
      .update(otpVerifications)
      .set({ attempts: record.attempts + 1 })
      .where(eq(otpVerifications.id, record.id));
    return { success: false, error: "Invalid OTP" };
  }

  await db
    .update(otpVerifications)
    .set({ isUsed: true, verifiedAt: now })
    .where(eq(otpVerifications.id, record.id));

  return { success: true, userId: record.userId ?? undefined };
}

export async function resendOtp(
  db: Database,
  params: {
    identifier: string;
    identifierType: "email" | "phone";
    purpose: string;
    ip?: string;
    userAgent?: string;
  },
): Promise<{ success: boolean; cooldownSeconds?: number }> {
  // Check rate limit
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const recentOtps = await db
    .select({ createdAt: otpVerifications.createdAt })
    .from(otpVerifications)
    .where(
      and(
        eq(otpVerifications.identifier, params.identifier),
        eq(otpVerifications.purpose, params.purpose),
        gt(otpVerifications.createdAt, oneHourAgo),
      ),
    );

  if (recentOtps.length >= 3) {
    return { success: false, cooldownSeconds: 3600 };
  }

  // Check cooldown (min 60s between OTPs)
  if (recentOtps.length > 0) {
    const lastOtp = recentOtps[recentOtps.length - 1]!;
    const elapsed = Date.now() - lastOtp.createdAt.getTime();
    if (elapsed < 60000) {
      return { success: false, cooldownSeconds: Math.ceil((60000 - elapsed) / 1000) };
    }
  }

  await generateOtp(db, params);
  return { success: true };
}
