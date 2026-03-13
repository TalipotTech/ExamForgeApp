import { z } from "zod";

export const registerSchema = z
  .object({
    method: z.enum(["email", "phone", "username_email"]),
    email: z.string().email().optional(),
    phone: z
      .string()
      .regex(/^\+\d{10,15}$/, "Phone must include country code (e.g., +919876543210)")
      .optional(),
    username: z
      .string()
      .min(3)
      .max(30)
      .regex(/^[a-zA-Z0-9_]+$/, "Username must be alphanumeric with underscores only")
      .optional(),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
      .regex(/[a-z]/, "Password must contain at least one lowercase letter")
      .regex(/[0-9]/, "Password must contain at least one number"),
    name: z.string().min(1).max(255),
  })
  .refine(
    (data) => {
      if (data.method === "email") return !!data.email;
      if (data.method === "phone") return !!data.phone;
      if (data.method === "username_email") return !!data.username && !!data.email;
      return false;
    },
    { message: "Required fields missing for selected registration method" },
  );

export const loginSchema = z.object({
  identifier: z.string().min(1, "Email, phone, or username is required"),
  password: z.string().min(1, "Password is required"),
});

export const verifyOtpSchema = z.object({
  identifier: z.string().min(1),
  otp: z.string().length(6, "OTP must be 6 digits"),
  purpose: z.string().min(1),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  email: z.string().email(),
  otp: z.string().length(6),
  newPassword: z
    .string()
    .min(8)
    .regex(/[A-Z]/, "Must contain uppercase")
    .regex(/[a-z]/, "Must contain lowercase")
    .regex(/[0-9]/, "Must contain number"),
});

export const resendOtpSchema = z.object({
  identifier: z.string().min(1),
  identifierType: z.enum(["email", "phone"]),
  purpose: z.string().min(1),
});

export const updateUserAdminSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255).optional(),
  email: z.string().email().optional(),
  phone: z
    .string()
    .regex(/^\+\d{10,15}$/)
    .optional()
    .nullable(),
  username: z
    .string()
    .min(3)
    .max(30)
    .regex(/^[a-zA-Z0-9_]+$/)
    .optional()
    .nullable(),
  role: z.enum(["student", "teacher", "admin", "superadmin"]).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ResendOtpInput = z.infer<typeof resendOtpSchema>;
export type UpdateUserAdminInput = z.infer<typeof updateUserAdminSchema>;
