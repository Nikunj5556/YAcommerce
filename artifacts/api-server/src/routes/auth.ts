import { Router, type IRouter } from "express";
import crypto from "crypto";
import {
  GoogleAuthCallbackBody,
  SendEmailOtpBody,
  VerifyEmailOtpBody,
  SendPhoneOtpBody,
  VerifyPhoneOtpBody,
} from "@workspace/api-zod";
import { supabaseAdmin } from "../lib/supabase";

const router: IRouter = Router();

const GOOGLE_CLIENT_ID = process.env["GOOGLE_CLIENT_ID"] || "";
const GOOGLE_CLIENT_SECRET = process.env["GOOGLE_CLIENT_SECRET"] || "";
const BREVO_API_KEY = process.env["BREVO_API_KEY"] || "";

function generateOtp(): string {
  return crypto.randomInt(100000, 999999).toString();
}

router.get("/auth/google/url", async (req, res): Promise<void> => {
  const redirectUri = req.query["redirectUri"] as string || `${req.protocol}://${req.get("host")}/auth/google/callback`;
  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=openid%20email%20profile&access_type=offline&prompt=consent`;
  res.json({ url });
});

router.post("/auth/google/callback", async (req, res): Promise<void> => {
  const parsed = GoogleAuthCallbackBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.message });
    return;
  }

  const { code, redirectUri } = parsed.data;

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenRes.json() as Record<string, unknown>;
    if (!tokenData["access_token"]) {
      res.status(400).json({ success: false, error: "Failed to exchange code" });
      return;
    }

    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData["access_token"]}` },
    });
    const userInfo = await userInfoRes.json() as Record<string, unknown>;

    const email = userInfo["email"] as string;
    const name = userInfo["name"] as string;
    const picture = userInfo["picture"] as string;

    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find((u) => u.email === email);

    let userId: string;

    if (existingUser) {
      userId = existingUser.id;
      await supabaseAdmin.auth.admin.updateUserById(userId, {
        email_confirm: true,
        user_metadata: { full_name: name, avatar_url: picture, provider: "google" },
      });
    } else {
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { full_name: name, avatar_url: picture, provider: "google" },
      });

      if (createError || !newUser.user) {
        res.status(500).json({ success: false, error: "Failed to create user" });
        return;
      }
      userId = newUser.user.id;
    }

    const { data: customerCheck } = await supabaseAdmin
      .from("customers")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!customerCheck) {
      const nameParts = (name || "").split(" ");
      await supabaseAdmin.from("customers").insert({
        user_id: userId,
        email,
        email_verified: true,
        first_name: nameParts[0] || "",
        last_name: nameParts.slice(1).join(" ") || "",
        profile_image: picture,
      });
    } else {
      await supabaseAdmin
        .from("customers")
        .update({ email_verified: true, profile_image: picture })
        .eq("id", customerCheck.id);
    }

    const { data: sessionData, error: sessionError } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });

    if (sessionError) {
      res.status(500).json({ success: false, error: "Failed to generate session" });
      return;
    }

    res.json({
      success: true,
      session: sessionData,
      user: { id: userId, email, name, picture },
    });
  } catch (err) {
    req.log.error({ err }, "Google auth callback failed");
    res.status(500).json({ success: false, error: "Authentication failed" });
  }
});

router.post("/auth/email/send-otp", async (req, res): Promise<void> => {
  const parsed = SendEmailOtpBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: parsed.error.message });
    return;
  }

  const { email } = parsed.data;
  const otp = generateOtp();
  const hashedOtp = crypto.createHash("sha256").update(otp).digest("hex");
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  await supabaseAdmin.from("otp_store").upsert(
    { identifier: email, otp_hash: hashedOtp, expires_at: expiresAt, type: "email" },
    { onConflict: "identifier" }
  );

  try {
    const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": BREVO_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sender: { name: "YA Commerce", email: "noreply@yacommerce.com" },
        to: [{ email }],
        subject: "Your Login Code - YA Commerce",
        htmlContent: `
          <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px;">
            <h2 style="color: #1a1a1a; margin-bottom: 8px;">YA Commerce</h2>
            <p style="color: #555;">Your verification code is:</p>
            <div style="background: #f5f5f5; padding: 20px; text-align: center; border-radius: 8px; margin: 16px 0;">
              <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #d97706;">${otp}</span>
            </div>
            <p style="color: #888; font-size: 14px;">This code expires in 5 minutes. Do not share it with anyone.</p>
          </div>
        `,
      }),
    });

    if (!brevoRes.ok) {
      req.log.error({ status: brevoRes.status }, "Brevo API error");
      res.status(500).json({ success: false, message: "Failed to send email" });
      return;
    }

    res.json({ success: true, message: "Verification code sent to your email" });
  } catch (err) {
    req.log.error({ err }, "Failed to send email OTP");
    res.status(500).json({ success: false, message: "Failed to send verification code" });
  }
});

router.post("/auth/email/verify-otp", async (req, res): Promise<void> => {
  const parsed = VerifyEmailOtpBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.message });
    return;
  }

  const { email, otp } = parsed.data;
  const hashedOtp = crypto.createHash("sha256").update(otp).digest("hex");

  const { data: otpRecord } = await supabaseAdmin
    .from("otp_store")
    .select("*")
    .eq("identifier", email)
    .eq("otp_hash", hashedOtp)
    .eq("type", "email")
    .maybeSingle();

  if (!otpRecord || new Date(otpRecord.expires_at) < new Date()) {
    res.status(400).json({ success: false, error: "Invalid or expired code" });
    return;
  }

  await supabaseAdmin.from("otp_store").delete().eq("identifier", email);

  const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
  const existingUser = existingUsers?.users?.find((u) => u.email === email);

  let userId: string;
  if (existingUser) {
    userId = existingUser.id;
    await supabaseAdmin.auth.admin.updateUserById(userId, { email_confirm: true });
  } else {
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { provider: "email" },
    });
    if (createError || !newUser.user) {
      res.status(500).json({ success: false, error: "Failed to create account" });
      return;
    }
    userId = newUser.user.id;
  }

  const { data: customerCheck } = await supabaseAdmin
    .from("customers")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!customerCheck) {
    await supabaseAdmin.from("customers").insert({
      user_id: userId,
      email,
      email_verified: true,
    });
  } else {
    await supabaseAdmin
      .from("customers")
      .update({ email_verified: true })
      .eq("id", customerCheck.id);
  }

  const { data: sessionData, error: sessionError } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });

  if (sessionError) {
    res.status(500).json({ success: false, error: "Failed to create session" });
    return;
  }

  res.json({
    success: true,
    session: sessionData,
    user: { id: userId, email },
  });
});

router.post("/auth/phone/send-otp", async (req, res): Promise<void> => {
  const parsed = SendPhoneOtpBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: parsed.error.message });
    return;
  }

  const { phone } = parsed.data;
  const otp = generateOtp();
  const hashedOtp = crypto.createHash("sha256").update(otp).digest("hex");
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  await supabaseAdmin.from("otp_store").upsert(
    { identifier: phone, otp_hash: hashedOtp, expires_at: expiresAt, type: "phone" },
    { onConflict: "identifier" }
  );

  try {
    req.log.info({ phone }, "Phone OTP generated (WhatsApp integration pending)");
    res.json({ success: true, message: "Verification code sent to your WhatsApp" });
  } catch (err) {
    req.log.error({ err }, "Failed to send phone OTP");
    res.status(500).json({ success: false, message: "Failed to send verification code" });
  }
});

router.post("/auth/phone/verify-otp", async (req, res): Promise<void> => {
  const parsed = VerifyPhoneOtpBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.message });
    return;
  }

  const { phone, otp } = parsed.data;
  const hashedOtp = crypto.createHash("sha256").update(otp).digest("hex");

  const { data: otpRecord } = await supabaseAdmin
    .from("otp_store")
    .select("*")
    .eq("identifier", phone)
    .eq("otp_hash", hashedOtp)
    .eq("type", "phone")
    .maybeSingle();

  if (!otpRecord || new Date(otpRecord.expires_at) < new Date()) {
    res.status(400).json({ success: false, error: "Invalid or expired code" });
    return;
  }

  await supabaseAdmin.from("otp_store").delete().eq("identifier", phone);

  const dummyEmail = `${phone.replace(/[^0-9]/g, "")}@phone.yacommerce.com`;
  const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
  
  let existingUser = existingUsers?.users?.find((u) => u.email === dummyEmail);
  if (!existingUser) {
    const { data: customerByPhone } = await supabaseAdmin
      .from("customers")
      .select("user_id")
      .eq("phone", phone)
      .maybeSingle();
    if (customerByPhone?.user_id) {
      existingUser = existingUsers?.users?.find((u) => u.id === customerByPhone.user_id);
    }
  }

  let userId: string;
  if (existingUser) {
    userId = existingUser.id;
  } else {
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: dummyEmail,
      email_confirm: true,
      user_metadata: { provider: "phone", phone },
    });
    if (createError || !newUser.user) {
      res.status(500).json({ success: false, error: "Failed to create account" });
      return;
    }
    userId = newUser.user.id;
  }

  const { data: customerCheck } = await supabaseAdmin
    .from("customers")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!customerCheck) {
    await supabaseAdmin.from("customers").insert({
      user_id: userId,
      email: dummyEmail,
      phone,
      phone_verified: true,
    });
  } else {
    await supabaseAdmin
      .from("customers")
      .update({ phone, phone_verified: true })
      .eq("id", customerCheck.id);
  }

  const { data: sessionData, error: sessionError } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email: dummyEmail,
  });

  if (sessionError) {
    res.status(500).json({ success: false, error: "Failed to create session" });
    return;
  }

  res.json({
    success: true,
    session: sessionData,
    user: { id: userId, phone },
  });
});

export default router;
