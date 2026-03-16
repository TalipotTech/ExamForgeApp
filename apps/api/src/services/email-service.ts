// Email service - Nodemailer + Gmail (primary), Resend (alternative), console.log (dev fallback)

import nodemailer from "nodemailer";

// ── Gmail transporter (lazy — env vars may not be available at import time) ──
let _transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (_transporter) return _transporter;
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    _transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });
  }
  return _transporter;
}

// ── HTML templates ───────────────────────────────────────────────────
function otpHtml(otp: string, purpose: string): { subject: string; html: string } {
  const subject =
    purpose === "reset_password"
      ? "ExamForge - Password Reset OTP"
      : purpose === "login"
        ? "ExamForge - Login OTP"
        : "ExamForge - Verify Your Email";

  const html = `
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

  return { subject, html };
}

// ── Send helper ──────────────────────────────────────────────────────
async function send(to: string, subject: string, html: string): Promise<void> {
  const emailFrom = process.env.EMAIL_FROM ?? "ExamForge <noreply@examforge.in>";
  const transport = getTransporter();
  if (transport) {
    await transport.sendMail({ from: emailFrom, to, subject, html });
  }
  // Uncomment below to use Resend instead of Gmail:
  // else if (process.env.RESEND_API_KEY) {
  //   const { Resend } = await import("resend");
  //   const resend = new Resend(process.env.RESEND_API_KEY);
  //   await resend.emails.send({ from: emailFrom, to, subject, html });
  // }
  else {
    console.log(`[EMAIL] To: ${to} | Subject: ${subject}`);
  }
}

// ── Public API (same signatures as before) ───────────────────────────
export async function sendOtpEmail(email: string, otp: string, purpose: string): Promise<void> {
  const { subject, html } = otpHtml(otp, purpose);

  if (!getTransporter()) {
    // Dev fallback: also log the OTP code for easy testing
    console.log(`[EMAIL] To: ${email} | Subject: ${subject} | OTP: ${otp}`);
    console.log(`[EMAIL] GMAIL_USER/GMAIL_APP_PASSWORD not set — using console fallback.`);
    return;
  }

  try {
    await send(email, subject, html);
    console.log(`[EMAIL] OTP sent to ${email} via Gmail`);
  } catch (err) {
    console.error(`[EMAIL] Failed to send to ${email}:`, err);
    throw err;
  }
}

export async function sendWelcomeEmail(email: string, name: string): Promise<void> {
  await send(
    email,
    "Welcome to ExamForge!",
    `<p>Hi ${name}, welcome to ExamForge! Start your exam preparation journey today.</p>`,
  );
}

export async function sendPasswordResetEmail(email: string, otp: string): Promise<void> {
  await sendOtpEmail(email, otp, "reset_password");
}
