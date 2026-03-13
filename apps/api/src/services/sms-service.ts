import type { Database } from "@examforge/shared/db";
import { getFlag } from "./feature-flags.js";

export async function sendOtpSms(db: Database, phone: string, otp: string): Promise<void> {
  const provider = (await getFlag(db, "sms.provider")) as string;

  if (!provider || provider === "none") {
    console.log(`[SMS] To: ${phone} | OTP: ${otp} (no provider configured)`);
    return;
  }

  if (provider === "msg91") {
    const authKey = (await getFlag(db, "sms.msg91_auth_key")) as string;
    const senderId = (await getFlag(db, "sms.msg91_sender_id")) as string;
    const templateId = (await getFlag(db, "sms.msg91_template_id")) as string;

    if (!authKey || !templateId) {
      console.log(`[SMS] MSG91 not configured. OTP for ${phone}: ${otp}`);
      return;
    }

    await fetch("https://control.msg91.com/api/v5/otp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        authkey: authKey,
      },
      body: JSON.stringify({
        mobile: phone.replace("+", ""),
        otp,
        sender: senderId,
        template_id: templateId,
      }),
    });
  } else if (provider === "twilio") {
    const accountSid = (await getFlag(db, "sms.twilio_account_sid")) as string;
    const authToken = (await getFlag(db, "sms.twilio_auth_token")) as string;
    const twilioPhone = (await getFlag(db, "sms.twilio_phone_number")) as string;

    if (!accountSid || !authToken || !twilioPhone) {
      console.log(`[SMS] Twilio not configured. OTP for ${phone}: ${otp}`);
      return;
    }

    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
      },
      body: new URLSearchParams({
        Body: `Your ExamForge OTP is: ${otp}`,
        From: twilioPhone,
        To: phone,
      }),
    });
  }
}
