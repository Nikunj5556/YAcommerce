import { Router, type IRouter } from "express";
import crypto from "crypto";
import Razorpay from "razorpay";
import {
  CreatePaymentOrderBody,
  VerifyPaymentBody,
} from "@workspace/api-zod";
import { supabaseAdmin } from "../lib/supabase";

const router: IRouter = Router();

const RAZORPAY_KEY_ID = process.env["RAZORPAY_KEY_ID"] || "";
const RAZORPAY_KEY_SECRET = process.env["RAZORPAY_KEY_SECRET"] || "";

const razorpay = new Razorpay({
  key_id: RAZORPAY_KEY_ID,
  key_secret: RAZORPAY_KEY_SECRET,
});

router.post("/payment/create-order", async (req, res): Promise<void> => {
  const parsed = CreatePaymentOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.message });
    return;
  }

  const { orderId, amount, currency } = parsed.data;

  try {
    const razorpayOrder = await razorpay.orders.create({
      amount: Math.round(amount * 100),
      currency: currency || "INR",
      receipt: orderId,
      notes: { order_id: orderId },
    });

    res.json({
      success: true,
      razorpayOrderId: razorpayOrder.id,
      amount: amount,
      currency: currency || "INR",
      keyId: RAZORPAY_KEY_ID,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to create Razorpay order");
    res.status(500).json({ success: false, error: "Payment order creation failed" });
  }
});

router.post("/payment/verify", async (req, res): Promise<void> => {
  const parsed = VerifyPaymentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: parsed.error.message });
    return;
  }

  const { razorpayOrderId, razorpayPaymentId, razorpaySignature, orderId } = parsed.data;

  const expectedSignature = crypto
    .createHmac("sha256", RAZORPAY_KEY_SECRET)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest("hex");

  if (expectedSignature !== razorpaySignature) {
    req.log.warn({ orderId }, "Payment signature verification failed");
    res.status(400).json({ success: false, message: "Payment verification failed" });
    return;
  }

  try {
    await supabaseAdmin
      .from("orders")
      .update({
        payment_status: "captured",
        order_status: "confirmed",
      })
      .eq("id", orderId);

    await supabaseAdmin.from("payments").insert({
      order_id: orderId,
      payment_provider: "razorpay",
      provider_payment_id: razorpayPaymentId,
      provider_order_id: razorpayOrderId,
      payment_method: "online",
      payment_status: "captured",
      paid_amount: 0,
      currency: "INR",
      payment_timestamp: new Date().toISOString(),
      verification_status: "verified",
    });

    await supabaseAdmin.from("order_events").insert({
      order_id: orderId,
      event_type: "payment_confirmed",
      actor: "system",
      notes: `Payment confirmed via Razorpay (${razorpayPaymentId})`,
    });

    res.json({ success: true, message: "Payment verified successfully" });
  } catch (err) {
    req.log.error({ err }, "Failed to update order after payment verification");
    res.status(500).json({ success: false, message: "Payment verified but order update failed" });
  }
});

export default router;
