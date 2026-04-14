import os
import hashlib
import secrets
import hmac
import time
import json
import logging
from datetime import datetime, timezone, timedelta

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from supabase import create_client

load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
RAZORPAY_KEY_ID = os.environ.get("RAZORPAY_KEY_ID")
RAZORPAY_KEY_SECRET = os.environ.get("RAZORPAY_KEY_SECRET")
BREVO_API_KEY = os.environ.get("BREVO_API_KEY")
BREVO_SENDER_EMAIL = os.environ.get("BREVO_SENDER_EMAIL", "hello@mailpilot.cloud")
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET")
META_WHATSAPP_PHONE_NUMBER_ID = os.environ.get("META_WHATSAPP_PHONE_NUMBER_ID")
META_WHATSAPP_ACCESS_TOKEN = os.environ.get("META_WHATSAPP_ACCESS_TOKEN")

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

app = FastAPI(title="YA Commerce API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Rate limiting (in-memory) ─────────────────────────────────
rate_limits: dict = {}

def check_rate_limit(identifier: str, max_requests: int = 5, window_seconds: int = 300) -> bool:
    now = time.time()
    key = f"rl:{identifier}"
    record = rate_limits.get(key)
    if not record or now > record["reset"]:
        rate_limits[key] = {"count": 1, "reset": now + window_seconds}
        return True
    if record["count"] >= max_requests:
        return False
    record["count"] += 1
    return True

# ── OTP helpers ───────────────────────────────────────────────
def generate_otp() -> str:
    return str(secrets.randbelow(900000) + 100000)

def hash_otp(otp: str) -> str:
    return hashlib.sha256(otp.encode()).hexdigest()

# In-memory OTP store (fallback when temp_otps table doesn't exist)
otp_store: dict = {}

def store_otp(identifier: str, otp_type: str, otp_hash: str):
    otp_store[f"{otp_type}:{identifier}"] = {
        "otp_hash": otp_hash,
        "expires_at": datetime.now(timezone.utc) + timedelta(minutes=5),
        "attempts": 0,
    }

def get_otp(identifier: str, otp_type: str):
    return otp_store.get(f"{otp_type}:{identifier}")

def delete_otp(identifier: str, otp_type: str):
    otp_store.pop(f"{otp_type}:{identifier}", None)

def increment_otp_attempts(identifier: str, otp_type: str):
    key = f"{otp_type}:{identifier}"
    if key in otp_store:
        otp_store[key]["attempts"] += 1

# ── Health ────────────────────────────────────────────────────
@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "YA Commerce API", "timestamp": datetime.now(timezone.utc).isoformat()}


# ══════════════════════════════════════════════════════════════
# AUTH — Email OTP (Brevo)
# ══════════════════════════════════════════════════════════════

class EmailOTPRequest(BaseModel):
    email: str

class EmailVerifyRequest(BaseModel):
    email: str
    otp: str

@app.post("/api/auth/email/send-otp")
async def send_email_otp(req: EmailOTPRequest):
    email = req.email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(400, "Invalid email address")
    if not check_rate_limit(f"email:{email}", 3, 300):
        raise HTTPException(429, "Too many requests. Please try again later.")

    otp = generate_otp()
    hashed = hash_otp(otp)

    store_otp(email, "email", hashed)

    html = f"""<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#333">
    <div style="max-width:600px;margin:0 auto;padding:20px">
    <h2>Your Login Code</h2><p>Use this code to sign in to YA Commerce:</p>
    <div style="background:#000;color:#fff;padding:20px;text-align:center;border-radius:4px;margin:20px 0">
    <div style="font-size:32px;font-weight:bold;letter-spacing:8px">{otp}</div></div>
    <p>This code expires in 5 minutes.</p>
    <p style="color:#666;font-size:12px;margin-top:30px;border-top:1px solid #ddd;padding-top:20px">YA Commerce</p>
    </div></body></html>"""

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://api.brevo.com/v3/smtp/email",
            headers={"api-key": BREVO_API_KEY, "Content-Type": "application/json"},
            json={
                "sender": {"name": "YA Commerce", "email": BREVO_SENDER_EMAIL},
                "to": [{"email": email}],
                "subject": "Your Login Code - YA Commerce",
                "htmlContent": html,
            },
        )
        if resp.status_code >= 400:
            logger.error(f"Brevo error: {resp.text}")
            raise HTTPException(500, "Failed to send email")

    return {"success": True, "message": "OTP sent to your email"}


@app.post("/api/auth/email/verify-otp")
async def verify_email_otp(req: EmailVerifyRequest):
    email = req.email.strip().lower()
    otp = req.otp.strip()
    if not email or not otp or len(otp) != 6:
        raise HTTPException(400, "Invalid email or OTP")

    hashed = hash_otp(otp)
    record = get_otp(email, "email")
    if not record:
        raise HTTPException(400, "Invalid or expired OTP")
    if record["expires_at"] < datetime.now(timezone.utc):
        delete_otp(email, "email")
        raise HTTPException(400, "OTP has expired")
    if record["attempts"] >= 3:
        delete_otp(email, "email")
        raise HTTPException(400, "Too many failed attempts")
    if record["otp_hash"] != hashed:
        increment_otp_attempts(email, "email")
        raise HTTPException(400, "Invalid OTP")

    delete_otp(email, "email")

    # Check/create customer
    cust_res = supabase.table("customers").select("*").eq("email", email).maybe_single().execute()
    customer = cust_res.data

    if not customer:
        # Use Supabase Auth admin API to create user
        try:
            auth_resp = supabase.auth.admin.create_user({
                "email": email,
                "email_confirm": True,
                "user_metadata": {"email_verified": True}
            })
            user_id = auth_resp.user.id
            supabase.table("customers").insert({
                "user_id": str(user_id),
                "email": email,
                "email_verified": True,
                "phone_verified": False
            }).execute()
        except Exception as e:
            logger.error(f"User creation error: {e}")
            # Try to get existing auth user
            try:
                users = supabase.auth.admin.list_users()
                existing = next((u for u in users if u.email == email), None)
                if existing:
                    user_id = existing.id
                    supabase.table("customers").insert({
                        "user_id": str(user_id),
                        "email": email,
                        "email_verified": True,
                        "phone_verified": False
                    }).execute()
                else:
                    raise HTTPException(500, "Failed to create user")
            except Exception:
                raise HTTPException(500, "Failed to create user")
    else:
        user_id = customer.get("user_id")
        if user_id:
            supabase.table("customers").update({"email_verified": True}).eq("email", email).execute()
        else:
            try:
                auth_resp = supabase.auth.admin.create_user({
                    "email": email,
                    "email_confirm": True,
                })
                user_id = auth_resp.user.id
                supabase.table("customers").update({"user_id": str(user_id), "email_verified": True}).eq("email", email).execute()
            except Exception:
                raise HTTPException(500, "Failed to link user")

    # Generate magic link for session
    try:
        link_resp = supabase.auth.admin.generate_link({"type": "magiclink", "email": email})
        return {"success": True, "session": {"properties": {"hashed_token": link_resp.properties.hashed_token if hasattr(link_resp, 'properties') else None}, "email": email}}
    except Exception as e:
        logger.error(f"Link generation error: {e}")
        return {"success": True, "message": "Verified. Please sign in."}


# ══════════════════════════════════════════════════════════════
# AUTH — Phone OTP (WhatsApp via Meta)
# ══════════════════════════════════════════════════════════════

class PhoneOTPRequest(BaseModel):
    phone: str

class PhoneVerifyRequest(BaseModel):
    phone: str
    otp: str

def normalize_phone(phone: str) -> str:
    p = phone.replace(" ", "").replace("-", "")
    if p.startswith("+91"):
        p = p[3:]
    elif p.startswith("91") and len(p) == 12:
        p = p[2:]
    return p

@app.post("/api/auth/phone/send-otp")
async def send_phone_otp(req: PhoneOTPRequest):
    phone = normalize_phone(req.phone)
    if len(phone) != 10 or not phone.isdigit():
        raise HTTPException(400, "Invalid phone number")
    if not check_rate_limit(f"phone:{phone}", 3, 300):
        raise HTTPException(429, "Too many requests. Please try again later.")

    otp = generate_otp()
    hashed = hash_otp(otp)

    store_otp(phone, "phone", hashed)

    # Send via Meta WhatsApp Business API
    if META_WHATSAPP_PHONE_NUMBER_ID and META_WHATSAPP_ACCESS_TOKEN and META_WHATSAPP_PHONE_NUMBER_ID != "PLACEHOLDER_PHONE_NUMBER_ID":
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"https://graph.facebook.com/v18.0/{META_WHATSAPP_PHONE_NUMBER_ID}/messages",
                headers={"Authorization": f"Bearer {META_WHATSAPP_ACCESS_TOKEN}", "Content-Type": "application/json"},
                json={
                    "messaging_product": "whatsapp",
                    "to": f"91{phone}",
                    "type": "text",
                    "text": {"body": f"Your YA Commerce login code is: {otp}\n\nThis code expires in 5 minutes.\nDo not share this code."}
                }
            )
            if resp.status_code >= 400:
                logger.warning(f"WhatsApp API error: {resp.text}")

    # Also send via Brevo email if customer has email
    try:
        cust_res = supabase.table("customers").select("email").eq("phone", phone).maybe_single().execute()
        if cust_res.data and cust_res.data.get("email") and "@" in cust_res.data["email"] and "@yacommerce" not in cust_res.data["email"]:
            async with httpx.AsyncClient() as client:
                await client.post(
                    "https://api.brevo.com/v3/smtp/email",
                    headers={"api-key": BREVO_API_KEY, "Content-Type": "application/json"},
                    json={
                        "sender": {"name": "YA Commerce", "email": BREVO_SENDER_EMAIL},
                        "to": [{"email": cust_res.data["email"]}],
                        "subject": "Your Phone Verification Code - YA Commerce",
                        "htmlContent": f"<h2>Your code: <strong>{otp}</strong></h2><p>Expires in 5 minutes.</p>",
                    }
                )
    except Exception as e:
        logger.warning(f"Email fallback error: {e}")

    return {"success": True, "message": "OTP sent via WhatsApp"}


@app.post("/api/auth/phone/verify-otp")
async def verify_phone_otp(req: PhoneVerifyRequest):
    phone = normalize_phone(req.phone)
    otp = req.otp.strip()
    if len(phone) != 10 or not otp or len(otp) != 6:
        raise HTTPException(400, "Invalid phone or OTP")

    hashed = hash_otp(otp)
    record = get_otp(phone, "phone")
    if not record:
        raise HTTPException(400, "Invalid or expired OTP")
    if record["expires_at"] < datetime.now(timezone.utc):
        delete_otp(phone, "phone")
        raise HTTPException(400, "OTP has expired")
    if record["attempts"] >= 3:
        delete_otp(phone, "phone")
        raise HTTPException(400, "Too many failed attempts")
    if record["otp_hash"] != hashed:
        increment_otp_attempts(phone, "phone")
        raise HTTPException(400, "Invalid OTP")

    delete_otp(phone, "phone")

    cust_res = supabase.table("customers").select("*").eq("phone", phone).maybe_single().execute()
    customer = cust_res.data

    if not customer:
        email = f"{phone}@yacommerce.phone"
        try:
            auth_resp = supabase.auth.admin.create_user({
                "email": email,
                "email_confirm": False,
                "phone": f"+91{phone}",
                "phone_confirm": True,
            })
            user_id = auth_resp.user.id
            supabase.table("customers").insert({
                "user_id": str(user_id),
                "email": email,
                "phone": phone,
                "email_verified": False,
                "phone_verified": True,
            }).execute()
        except Exception as e:
            logger.error(f"Phone user creation: {e}")
            raise HTTPException(500, "Failed to create user")
    else:
        user_id = customer.get("user_id")
        email = customer.get("email", f"{phone}@yacommerce.phone")
        supabase.table("customers").update({"phone_verified": True}).eq("phone", phone).execute()
        if not user_id:
            try:
                auth_resp = supabase.auth.admin.create_user({
                    "email": email, "email_confirm": bool("@yacommerce" not in email),
                    "phone": f"+91{phone}", "phone_confirm": True,
                })
                user_id = auth_resp.user.id
                supabase.table("customers").update({"user_id": str(user_id)}).eq("phone", phone).execute()
            except Exception:
                raise HTTPException(500, "Failed to link user")

    try:
        link_resp = supabase.auth.admin.generate_link({"type": "magiclink", "email": email})
        return {"success": True, "phone_verified": True, "session": {"properties": {"hashed_token": link_resp.properties.hashed_token if hasattr(link_resp, 'properties') else None}, "email": email}}
    except Exception as e:
        logger.error(f"Link gen: {e}")
        return {"success": True, "phone_verified": True}


# ══════════════════════════════════════════════════════════════
# AUTH — Google OAuth
# ══════════════════════════════════════════════════════════════

@app.get("/api/auth/google/callback")
async def google_callback(code: str = ""):
    if not code:
        raise HTTPException(400, "Missing authorization code")
    return {"success": True, "message": "Google OAuth handled by Supabase client-side"}


# ══════════════════════════════════════════════════════════════
# PAYMENTS — Razorpay
# ══════════════════════════════════════════════════════════════

class CreatePaymentRequest(BaseModel):
    amount: float
    currency: str = "INR"
    customer_id: str
    order_id: str | None = None

class VerifyPaymentRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str
    order_id: str | None = None

@app.post("/api/payment/create-order")
async def create_payment_order(req: CreatePaymentRequest):
    if req.amount <= 0:
        raise HTTPException(400, "Invalid amount")

    import base64
    auth = base64.b64encode(f"{RAZORPAY_KEY_ID}:{RAZORPAY_KEY_SECRET}".encode()).decode()

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://api.razorpay.com/v1/orders",
            headers={"Authorization": f"Basic {auth}", "Content-Type": "application/json"},
            json={
                "amount": int(round(req.amount * 100)),
                "currency": req.currency,
                "receipt": f"rcpt_{req.order_id or int(time.time())}",
                "notes": {"customer_id": req.customer_id, "order_id": req.order_id or ""},
            }
        )
        if resp.status_code >= 400:
            logger.error(f"Razorpay error: {resp.text}")
            raise HTTPException(500, "Failed to create payment order")
        rz_order = resp.json()

    return {
        "success": True,
        "orderId": rz_order["id"],
        "amount": rz_order["amount"],
        "currency": rz_order["currency"],
        "key": RAZORPAY_KEY_ID,
    }


@app.post("/api/payment/verify")
async def verify_payment(req: VerifyPaymentRequest):
    generated = hmac.new(
        RAZORPAY_KEY_SECRET.encode(),
        f"{req.razorpay_order_id}|{req.razorpay_payment_id}".encode(),
        hashlib.sha256,
    ).hexdigest()

    if generated != req.razorpay_signature:
        raise HTTPException(400, "Invalid payment signature")

    if req.order_id:
        try:
            supabase.table("orders").update({
                "payment_status": "captured",
                "order_status": "confirmed",
            }).eq("id", req.order_id).execute()

            supabase.table("payments").insert({
                "order_id": req.order_id,
                "payment_provider": "razorpay",
                "provider_payment_id": req.razorpay_payment_id,
                "provider_order_id": req.razorpay_order_id,
                "payment_method": "online",
                "payment_status": "captured",
                "paid_amount": 0,
                "payment_timestamp": datetime.now(timezone.utc).isoformat(),
                "is_cod": False,
                "gateway_response": {"razorpay_payment_id": req.razorpay_payment_id, "razorpay_order_id": req.razorpay_order_id},
            }).execute()

            supabase.table("order_events").insert({
                "order_id": req.order_id,
                "event_type": "payment_confirmed",
                "actor": "system",
                "notes": f"Payment confirmed via Razorpay ({req.razorpay_payment_id})",
            }).execute()
        except Exception as e:
            logger.error(f"Payment record error: {e}")

    return {"success": True, "verified": True, "payment_id": req.razorpay_payment_id}


# ══════════════════════════════════════════════════════════════
# ORDER — Create
# ══════════════════════════════════════════════════════════════

class OrderItemInput(BaseModel):
    variant_id: str | None = None
    product_id: str
    quantity: int

class CreateOrderRequest(BaseModel):
    customer_id: str
    items: list[OrderItemInput]
    shipping_address_id: str
    shipping_method_id: str | None = None
    payment_mode: str = "online"
    coupon_code: str | None = None

@app.post("/api/order/create")
async def create_order(req: CreateOrderRequest):
    # Verify customer
    cust = supabase.table("customers").select("*").eq("id", req.customer_id).maybe_single().execute()
    if not cust.data:
        raise HTTPException(404, "Customer not found")

    # Get address
    addr = supabase.table("customer_addresses").select("*").eq("id", req.shipping_address_id).maybe_single().execute()
    if not addr.data:
        raise HTTPException(400, "Invalid shipping address")

    # Get shipping method
    shipping_method = None
    if req.shipping_method_id:
        sm = supabase.table("shipping_methods").select("*").eq("id", req.shipping_method_id).maybe_single().execute()
        shipping_method = sm.data

    # Calculate totals server-side
    calculated_subtotal = 0
    order_items = []
    for item in req.items:
        if item.variant_id:
            vr = supabase.table("product_variants").select("*, products(*)").eq("id", item.variant_id).maybe_single().execute()
            if not vr.data:
                continue
            variant = vr.data
            product = variant.get("products", {})
        else:
            pr = supabase.table("products").select("*").eq("id", item.product_id).maybe_single().execute()
            if not pr.data:
                continue
            product = pr.data
            variant = {}

        unit_price = float(variant.get("price") or product.get("base_price", 0))
        line_total = unit_price * item.quantity
        calculated_subtotal += line_total

        order_items.append({
            "product_id_snapshot": product.get("id"),
            "product_name_snapshot": product.get("name", ""),
            "variant_id_snapshot": variant.get("id"),
            "variant_name_snapshot": variant.get("variant_name"),
            "sku_snapshot": variant.get("sku") or product.get("sku"),
            "quantity": item.quantity,
            "unit_price": unit_price,
            "compare_price": float(variant.get("compare_at_price") or product.get("compare_at_price") or 0) or None,
            "line_total": line_total,
            "tax_rate_snapshot": float(product.get("gst_rate") or 0),
            "hsn_code_snapshot": product.get("hsn_code"),
            "weight_kg_snapshot": float(variant.get("weight_kg") or product.get("weight_kg") or 0) or None,
            "is_returnable": True,
            "is_refundable": True,
        })

    tax = calculated_subtotal * 0.18
    shipping_cost = float(shipping_method.get("base_rate", 0)) if shipping_method else 0
    cod_fee = float(shipping_method.get("cod_fee", 0)) if req.payment_mode == "cod" and shipping_method else 0
    total = calculated_subtotal + tax + shipping_cost + cod_fee

    order_data = {
        "customer_id": req.customer_id,
        "order_status": "pending",
        "payment_status": "cod_pending" if req.payment_mode == "cod" else "pending",
        "fulfillment_status": "unfulfilled",
        "source_channel": "website",
        "is_cod": req.payment_mode == "cod",
        "cod_amount": total if req.payment_mode == "cod" else None,
        "shipping_method_id": req.shipping_method_id,
        "currency": "INR",
        "subtotal": calculated_subtotal,
        "tax_total": tax,
        "shipping_total": shipping_cost,
        "cod_fee": cod_fee,
        "grand_total": total,
        "name_snapshot": addr.data.get("full_name"),
        "email_snapshot": cust.data.get("email"),
        "phone_snapshot": addr.data.get("phone_number") or cust.data.get("phone"),
        "billing_address_snapshot": addr.data,
        "shipping_address_snapshot": addr.data,
        "delivery_instructions": addr.data.get("delivery_instructions"),
        "purchase_date": datetime.now(timezone.utc).isoformat(),
    }

    order_res = supabase.table("orders").insert(order_data).execute()
    if not order_res.data:
        raise HTTPException(500, "Failed to create order")
    order = order_res.data[0]

    for oi in order_items:
        oi["order_id"] = order["id"]
    supabase.table("order_items").insert(order_items).execute()

    supabase.table("order_events").insert({
        "order_id": order["id"],
        "event_type": "order_placed",
        "actor": "customer",
        "actor_id": req.customer_id,
        "notes": f"Order placed via website ({req.payment_mode})",
    }).execute()

    return {
        "success": True,
        "orderId": order["id"],
        "orderNumber": order.get("order_number"),
        "total": total,
        "paymentMode": req.payment_mode,
    }


# ══════════════════════════════════════════════════════════════
# NOTIFICATIONS — Send (Brevo email)
# ══════════════════════════════════════════════════════════════

class NotificationRequest(BaseModel):
    to_email: str
    subject: str
    html_content: str

@app.post("/api/notifications/send")
async def send_notification(req: NotificationRequest):
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://api.brevo.com/v3/smtp/email",
            headers={"api-key": BREVO_API_KEY, "Content-Type": "application/json"},
            json={
                "sender": {"name": "YA Commerce", "email": BREVO_SENDER_EMAIL},
                "to": [{"email": req.to_email}],
                "subject": req.subject,
                "htmlContent": req.html_content,
            },
        )
    return {"success": resp.status_code < 400}
