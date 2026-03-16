import { z } from "zod";

// Password strength rules shared across schemas
const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number");

const phoneSchema = z
  .string()
  .regex(/^\+\d{10,15}$/, "Phone must include country code (e.g., +919876543210)");

const usernameSchema = z
  .string()
  .min(3, "Username must be at least 3 characters")
  .max(30, "Username must be at most 30 characters")
  .regex(/^[a-zA-Z0-9_]+$/, "Username must be alphanumeric with underscores only");

// ─── Registration (unified single form) ───────────────────────────────
export const registerSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  email: z.string().email("Invalid email address"),
  phone: phoneSchema,
  username: usernameSchema,
  password: passwordSchema,
});

// ─── Login (password-based) ───────────────────────────────────────────
export const loginSchema = z.object({
  identifier: z.string().min(1, "Email, phone, or username is required"),
  password: z.string().min(1, "Password is required"),
});

// ─── OTP Login ────────────────────────────────────────────────────────
export const loginWithOtpRequestSchema = z.object({
  identifier: z.string().min(1, "Email or phone is required"),
});

export const loginWithOtpVerifySchema = z.object({
  identifier: z.string().min(1),
  otp: z.string().length(6, "OTP must be 6 digits"),
});

// ─── PIN Login ────────────────────────────────────────────────────────
export const loginWithPinSchema = z.object({
  identifier: z.string().min(1, "Email, phone, or username is required"),
  pin: z
    .string()
    .length(4, "PIN must be exactly 4 digits")
    .regex(/^\d{4}$/, "PIN must contain only digits"),
});

// ─── PIN Management ───────────────────────────────────────────────────
export const setPinSchema = z.object({
  pin: z
    .string()
    .length(4, "PIN must be exactly 4 digits")
    .regex(/^\d{4}$/, "PIN must contain only digits"),
  currentPassword: z.string().min(1, "Current password is required"),
});

export const removePinSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
});

// ─── OTP Verification ─────────────────────────────────────────────────
export const verifyOtpSchema = z.object({
  identifier: z.string().min(1),
  otp: z.string().length(6, "OTP must be 6 digits"),
  purpose: z.string().min(1),
});

export const resendOtpSchema = z.object({
  identifier: z.string().min(1),
  identifierType: z.enum(["email", "phone"]),
  purpose: z.string().min(1),
});

// ─── Forgot / Reset Password ──────────────────────────────────────────
export const forgotPasswordSchema = z.object({
  identifier: z.string().min(1, "Email or phone is required"),
  identifierType: z.enum(["email", "phone"]),
});

export const resetPasswordSchema = z.object({
  identifier: z.string().min(1),
  identifierType: z.enum(["email", "phone"]),
  otp: z.string().length(6, "OTP must be 6 digits"),
  newPassword: passwordSchema,
});

// ─── Admin User Management ────────────────────────────────────────────
export const updateUserAdminSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255).optional(),
  email: z.string().email().optional(),
  phone: phoneSchema.optional().nullable(),
  username: usernameSchema.optional().nullable(),
  role: z.enum(["student", "teacher", "admin", "superadmin"]).optional(),
});

// ─── Type Exports ─────────────────────────────────────────────────────
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type LoginWithOtpRequestInput = z.infer<typeof loginWithOtpRequestSchema>;
export type LoginWithOtpVerifyInput = z.infer<typeof loginWithOtpVerifySchema>;
export type LoginWithPinInput = z.infer<typeof loginWithPinSchema>;
export type SetPinInput = z.infer<typeof setPinSchema>;
export type RemovePinInput = z.infer<typeof removePinSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ResendOtpInput = z.infer<typeof resendOtpSchema>;
export type UpdateUserAdminInput = z.infer<typeof updateUserAdminSchema>;
