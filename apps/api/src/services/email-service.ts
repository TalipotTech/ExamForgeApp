// Email service - console.log in development, Resend structure for production
// To enable Resend: set RESEND_API_KEY in .env and uncomment the Resend import

// import { Resend } from "resend";

export async function sendOtpEmail(email: string, otp: string, purpose: string): Promise<void> {
  const subject =
    purpose === "reset_password"
      ? "ExamForge - Password Reset OTP"
      : "ExamForge - Verify Your Email";

  const body = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #1a1a1a;">ExamForge</h2>
      <p>Your verification code is:</p>
      <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; text-align: center; margin: 16px 0;">
        <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #111;">${otp}</span>
      </div>
      <p style="color: #666;">This code expires in 10 minutes. Do not share it with anyone.</p>
      <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
      <p style="color: #999; font-size: 12px;">If you didn't request this, please ignore this email.</p>
    </div>
  `;

  if (process.env.RESEND_API_KEY) {
    // Production: send via Resend
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: process.env.EMAIL_FROM ?? "ExamForge <noreply@examforge.in>",
      to: email,
      subject,
      html: body,
    });
  } else {
    // Development: log to console
    console.log(`[EMAIL] To: ${email} | Subject: ${subject} | OTP: ${otp}`);
  }
}

export async function sendWelcomeEmail(email: string, name: string): Promise<void> {
  const subject = "Welcome to ExamForge!";

  if (process.env.RESEND_API_KEY) {
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from: process.env.EMAIL_FROM ?? "ExamForge <noreply@examforge.in>",
      to: email,
      subject,
      html: `<p>Hi ${name}, welcome to ExamForge! Start your exam preparation journey today.</p>`,
    });
  } else {
    console.log(`[EMAIL] Welcome email to: ${email} (${name})`);
  }
}

export async function sendPasswordResetEmail(email: string, otp: string): Promise<void> {
  await sendOtpEmail(email, otp, "reset_password");
}
