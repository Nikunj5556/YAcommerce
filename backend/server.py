import os
import hashlib
import secrets
import hmac
import time
import base64
import logging
from datetime import datetime, timezone, timedelta

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
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


# ══════════════════════════════════════════════════════════════
# OTP MODULE — Supabase-backed (temp_otp + auth_rate_limit)
#   Falls back to in-memory if tables don't exist yet.
# ══════════════════════════════════════════════════════════════

OTP_EXPIRY_MINUTES = 5
OTP_MAX_ATTEMPTS = 5
RATE_LIMIT_MAX_REQUESTS = 5
RATE_LIMIT_WINDOW_MINUTES = 10
RATE_LIMIT_BLOCK_MINUTES = 30

# ── Detect whether Supabase tables exist ──────────────────────
_USE_SUPABASE_OTP = None  # None = not checked, True/False after check

def _tables_available() -> bool:
    global _USE_SUPABASE_OTP
    if _USE_SUPABASE_OTP is not None:
        return _USE_SUPABASE_OTP
    try:
        res = supabase.table("temp_otp").select("id").limit(0).execute()  # noqa: F841
        _USE_SUPABASE_OTP = True
        logger.info("temp_otp table detected — using Supabase OTP storage")
    except Exception:
        _USE_SUPABASE_OTP = False
        logger.info("temp_otp table NOT found — using in-memory OTP storage")
    return _USE_SUPABASE_OTP

# ── In-memory fallback stores ─────────────────────────────────
_mem_otps: dict = {}      # key: "purpose:identifier" -> {otp_hash, expires_at, attempts, consumed}
_mem_rate: dict = {}      # key: "action:identifier" -> {count, window_end, blocked_until}


def _generate_otp() -> str:
    """Cryptographically secure 6-digit OTP."""
    return str(secrets.randbelow(900000) + 100000)


def _hash_otp(otp: str) -> str:
    """SHA-256 hash — never store plain text."""
    return hashlib.sha256(otp.encode("utf-8")).hexdigest()


def _extract_client_info(request: Request) -> tuple[str | None, str | None]:
    """Pull IP and User-Agent from the incoming request."""
    ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip() or request.client.host if request.client else None
    ua = request.headers.get("user-agent")
    return ip, ua


# ── Rate Limiter (Supabase auth_rate_limit table) ────────────

def _check_rate_limit(
    identifier: str,
    identifier_type: str,
    action: str,
    ip_address: str | None,
    max_requests: int = RATE_LIMIT_MAX_REQUESTS,
    window_minutes: int = RATE_LIMIT_WINDOW_MINUTES,
) -> dict:
    """
    Returns {"allowed": bool, "remaining": int, "blocked_until": str|None}.
    Uses Supabase auth_rate_limit table, or in-memory fallback.
    """
    if not _tables_available():
        return _check_rate_limit_mem(identifier, action, max_requests, window_minutes)

    now = datetime.now(timezone.utc)

    # 1) Check if currently blocked
    try:
        blocked_res = (
            supabase.table("auth_rate_limit")
            .select("blocked_until")
            .eq("identifier", identifier)
            .eq("action", action)
            .not_.is_("blocked_until", "null")
            .gte("blocked_until", now.isoformat())
            .order("blocked_until", desc=True)
            .limit(1)
            .execute()
        )
        if blocked_res.data and blocked_res.data[0].get("blocked_until"):
            return {
                "allowed": False,
                "remaining": 0,
                "blocked_until": blocked_res.data[0]["blocked_until"],
            }
    except Exception as e:
        logger.warning(f"Rate limit blocked check: {e}")

    # 2) Find or create the current window
    window_start = now - timedelta(minutes=window_minutes)

    try:
        window_res = (
            supabase.table("auth_rate_limit")
            .select("*")
            .eq("identifier", identifier)
            .eq("action", action)
            .gte("window_start", window_start.isoformat())
            .order("window_start", desc=True)
            .limit(1)
            .execute()
        )
    except Exception as e:
        logger.warning(f"Rate limit window check: {e}")
        # Fail open — allow the request if we can't check
        return {"allowed": True, "remaining": max_requests, "blocked_until": None}

    if window_res.data:
        record = window_res.data[0]
        count = record.get("request_count", 0)

        if count >= max_requests:
            # Block the user
            blocked_until = (now + timedelta(minutes=RATE_LIMIT_BLOCK_MINUTES)).isoformat()
            try:
                supabase.table("auth_rate_limit").update({
                    "blocked_until": blocked_until,
                    "updated_at": now.isoformat(),
                }).eq("id", record["id"]).execute()
            except Exception as e:
                logger.warning(f"Rate limit block update: {e}")

            return {"allowed": False, "remaining": 0, "blocked_until": blocked_until}

        # Increment
        try:
            supabase.table("auth_rate_limit").update({
                "request_count": count + 1,
                "updated_at": now.isoformat(),
            }).eq("id", record["id"]).execute()
        except Exception as e:
            logger.warning(f"Rate limit increment: {e}")

        return {"allowed": True, "remaining": max_requests - count - 1, "blocked_until": None}

    else:
        # First request in this window — insert
        window_end = (now + timedelta(minutes=window_minutes)).isoformat()
        try:
            supabase.table("auth_rate_limit").insert({
                "identifier": identifier,
                "identifier_type": identifier_type,
                "ip_address": ip_address,
                "action": action,
                "request_count": 1,
                "window_start": now.isoformat(),
                "window_end": window_end,
            }).execute()
        except Exception as e:
            logger.warning(f"Rate limit insert: {e}")

        return {"allowed": True, "remaining": max_requests - 1, "blocked_until": None}


# ── In-memory fallback: rate limit ────────────────────────────

def _check_rate_limit_mem(identifier: str, action: str, max_req: int, window_min: int) -> dict:
    now = datetime.now(timezone.utc)
    key = f"{action}:{identifier}"
    rec = _mem_rate.get(key)
    if rec and rec.get("blocked_until") and rec["blocked_until"] > now:
        return {"allowed": False, "remaining": 0, "blocked_until": rec["blocked_until"].isoformat()}
    if not rec or rec["window_end"] < now:
        _mem_rate[key] = {"count": 1, "window_end": now + timedelta(minutes=window_min), "blocked_until": None}
        return {"allowed": True, "remaining": max_req - 1, "blocked_until": None}
    if rec["count"] >= max_req:
        rec["blocked_until"] = now + timedelta(minutes=RATE_LIMIT_BLOCK_MINUTES)
        return {"allowed": False, "remaining": 0, "blocked_until": rec["blocked_until"].isoformat()}
    rec["count"] += 1
    return {"allowed": True, "remaining": max_req - rec["count"], "blocked_until": None}


# ── OTP Store (Supabase temp_otp table) ──────────────────────

def _store_otp(
    identifier: str,
    identifier_type: str,
    otp_hash: str,
    purpose: str,
    ip_address: str | None,
    user_agent: str | None,
):
    """Upsert OTP into temp_otp (Supabase) or in-memory fallback."""
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=OTP_EXPIRY_MINUTES)

    if not _tables_available():
        _mem_otps[f"{purpose}:{identifier}"] = {
            "otp_hash": otp_hash,
            "expires_at": expires_at,
            "attempts": 0,
            "max_attempts": OTP_MAX_ATTEMPTS,
            "consumed": False,
        }
        return

    # Delete any existing OTP for this identifier+purpose first
    try:
        supabase.table("temp_otp").delete().eq("identifier", identifier).eq("purpose", purpose).execute()
    except Exception:
        pass

    try:
        supabase.table("temp_otp").insert({
            "identifier": identifier,
            "identifier_type": identifier_type,
            "otp_hash": otp_hash,
            "purpose": purpose,
            "attempts": 0,
            "max_attempts": OTP_MAX_ATTEMPTS,
            "expires_at": expires_at.isoformat(),
            "consumed": False,
            "ip_address": ip_address,
            "user_agent": user_agent,
        }).execute()
    except Exception as e:
        logger.error(f"OTP store insert: {e}")
        raise HTTPException(500, "Failed to generate verification code")


def _get_otp(identifier: str, purpose: str) -> dict | None:
    """Fetch the latest, unconsumed, non-expired OTP."""
    now = datetime.now(timezone.utc)

    if not _tables_available():
        rec = _mem_otps.get(f"{purpose}:{identifier}")
        if not rec or rec["consumed"] or rec["expires_at"] < now:
            return None
        return {**rec, "id": f"{purpose}:{identifier}"}

    try:
        res = (
            supabase.table("temp_otp")
            .select("*")
            .eq("identifier", identifier)
            .eq("purpose", purpose)
            .eq("consumed", False)
            .gte("expires_at", now.isoformat())
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        return res.data[0] if res.data else None
    except Exception as e:
        logger.error(f"OTP fetch: {e}")
        return None


def _consume_otp(otp_id: str):
    """Mark OTP as consumed (one-time use)."""
    if not _tables_available():
        if otp_id in _mem_otps:
            _mem_otps[otp_id]["consumed"] = True
        return
    try:
        supabase.table("temp_otp").update({"consumed": True}).eq("id", otp_id).execute()
    except Exception as e:
        logger.warning(f"OTP consume: {e}")


def _increment_otp_attempts(otp_id: str, current_attempts: int):
    """Increment failed-attempt counter."""
    if not _tables_available():
        if otp_id in _mem_otps:
            _mem_otps[otp_id]["attempts"] = current_attempts + 1
        return
    try:
        supabase.table("temp_otp").update({"attempts": current_attempts + 1}).eq("id", otp_id).execute()
    except Exception as e:
        logger.warning(f"OTP attempt increment: {e}")


def _cleanup_expired_otps():
    """Best-effort housekeeping."""
    if not _tables_available():
        now = datetime.now(timezone.utc)
        expired = [k for k, v in _mem_otps.items() if v["expires_at"] < now]
        for k in expired:
            del _mem_otps[k]
        return
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    try:
        supabase.table("temp_otp").delete().lt("expires_at", cutoff).execute()
    except Exception:
        pass


# ── Public API: sendOtp / verifyOtp ───────────────────────────

async def send_otp(
    identifier: str,
    identifier_type: str,   # 'email' | 'phone'
    purpose: str,            # 'login' | 'signup' | 'verify_phone' | ...
    request: Request,
) -> dict:
    """
    Full send-OTP flow:
      1. Rate-limit check
      2. Generate + hash OTP
      3. Store in temp_otp
      4. Dispatch via Brevo (email) or WhatsApp (phone)
      5. Return success/failure
    """
    ip, ua = _extract_client_info(request)

    # ── Rate limit ─────────────────────────────────────────
    rl = _check_rate_limit(identifier, identifier_type, "send_otp", ip)
    if not rl["allowed"]:
        blocked_msg = ""
        if rl.get("blocked_until"):
            blocked_msg = f" Try again after {rl['blocked_until'][:16].replace('T', ' ')} UTC."
        raise HTTPException(429, f"Too many requests.{blocked_msg}")

    # ── Generate & store ───────────────────────────────────
    plain_otp = _generate_otp()
    otp_hash = _hash_otp(plain_otp)
    _store_otp(identifier, identifier_type, otp_hash, purpose, ip, ua)

    # ── Dispatch ───────────────────────────────────────────
    if identifier_type == "email":
        await _send_otp_email(identifier, plain_otp)
    elif identifier_type == "phone":
        await _send_otp_whatsapp(identifier, plain_otp)
        # Also try email fallback if customer has email
        await _send_otp_phone_email_fallback(identifier, plain_otp)

    # Cleanup old entries (fire-and-forget)
    _cleanup_expired_otps()

    channel = "email" if identifier_type == "email" else "WhatsApp"
    return {"success": True, "message": f"Verification code sent via {channel}", "remaining_requests": rl["remaining"]}


def verify_otp(
    identifier: str,
    identifier_type: str,
    purpose: str,
    plain_otp: str,
    request: Request,
) -> dict:
    """
    Full verify-OTP flow:
      1. Rate-limit check on verify action
      2. Fetch latest OTP
      3. Check expiry, consumed, attempts
      4. Compare hash
      5. Mark consumed or increment attempts
    """
    ip, ua = _extract_client_info(request)

    # ── Rate limit on verification attempts ────────────────
    rl = _check_rate_limit(identifier, identifier_type, "verify_otp", ip)
    if not rl["allowed"]:
        raise HTTPException(429, "Too many verification attempts. Please try again later.")

    # ── Fetch OTP record ───────────────────────────────────
    record = _get_otp(identifier, purpose)
    if not record:
        raise HTTPException(400, "No valid verification code found. Please request a new one.")

    # ── Expiry check (defense in depth — query already filters) ──
    expires_at_str = record["expires_at"]
    if isinstance(expires_at_str, str):
        expires_at = datetime.fromisoformat(expires_at_str.replace("Z", "+00:00"))
    else:
        expires_at = expires_at_str
    if expires_at < datetime.now(timezone.utc):
        _consume_otp(record["id"])
        raise HTTPException(400, "Verification code has expired. Please request a new one.")

    # ── Already consumed ───────────────────────────────────
    if record.get("consumed"):
        raise HTTPException(400, "This code has already been used. Please request a new one.")

    # ── Max attempts ───────────────────────────────────────
    attempts = record.get("attempts", 0)
    max_att = record.get("max_attempts", OTP_MAX_ATTEMPTS)
    if attempts >= max_att:
        _consume_otp(record["id"])
        # Also temporarily block
        _check_rate_limit(identifier, identifier_type, "verify_otp", ip, max_requests=0, window_minutes=1)
        raise HTTPException(400, "Too many failed attempts. Please request a new code.")

    # ── Hash comparison ────────────────────────────────────
    incoming_hash = _hash_otp(plain_otp)
    if incoming_hash != record["otp_hash"]:
        _increment_otp_attempts(record["id"], attempts)
        remaining = max_att - attempts - 1
        raise HTTPException(400, f"Invalid code. {remaining} attempt{'s' if remaining != 1 else ''} remaining.")

    # ── Success — mark consumed ────────────────────────────
    _consume_otp(record["id"])

    return {"success": True, "verified": True}


# ── Email dispatch via Brevo ──────────────────────────────────

async def _send_otp_email(email: str, otp: str):
    html = f"""<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;color:#333">
    <div style="max-width:600px;margin:0 auto;padding:20px">
    <h2 style="margin:0 0 8px">Your Verification Code</h2>
    <p style="margin:0 0 20px;color:#555">Use this code to sign in to YA Commerce:</p>
    <div style="background:#000;color:#fff;padding:24px;text-align:center;border-radius:4px;margin:0 0 20px">
    <div style="font-size:36px;font-weight:bold;letter-spacing:10px;font-family:monospace">{otp}</div></div>
    <p style="margin:0 0 4px;font-size:14px;color:#555">This code expires in {OTP_EXPIRY_MINUTES} minutes.</p>
    <p style="font-size:13px;color:#999">If you didn't request this, ignore this email.</p>
    <hr style="border:0;border-top:1px solid #eee;margin:24px 0 12px">
    <p style="font-size:11px;color:#aaa;margin:0">YA Commerce &mdash; Premium E-Commerce</p>
    </div></body></html>"""

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            "https://api.brevo.com/v3/smtp/email",
            headers={"api-key": BREVO_API_KEY, "Content-Type": "application/json"},
            json={
                "sender": {"name": "YA Commerce", "email": BREVO_SENDER_EMAIL},
                "to": [{"email": email}],
                "subject": "Your Verification Code - YA Commerce",
                "htmlContent": html,
            },
        )
        if resp.status_code >= 400:
            logger.error(f"Brevo error [{resp.status_code}]: {resp.text}")
            raise HTTPException(500, "Failed to send verification email")


# ── WhatsApp dispatch via Meta Business API ───────────────────

async def _send_otp_whatsapp(phone: str, otp: str):
    if (
        not META_WHATSAPP_PHONE_NUMBER_ID
        or not META_WHATSAPP_ACCESS_TOKEN
        or META_WHATSAPP_PHONE_NUMBER_ID == "PLACEHOLDER_PHONE_NUMBER_ID"
    ):
        logger.info(f"WhatsApp not configured — OTP for {phone}: {otp}")
        return

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            f"https://graph.facebook.com/v18.0/{META_WHATSAPP_PHONE_NUMBER_ID}/messages",
            headers={
                "Authorization": f"Bearer {META_WHATSAPP_ACCESS_TOKEN}",
                "Content-Type": "application/json",
            },
            json={
                "messaging_product": "whatsapp",
                "to": f"91{phone}",
                "type": "text",
                "text": {
                    "body": (
                        f"Your YA Commerce verification code is: {otp}\n\n"
                        f"This code expires in {OTP_EXPIRY_MINUTES} minutes.\n"
                        "Do not share this code with anyone."
                    )
                },
            },
        )
        if resp.status_code >= 400:
            logger.warning(f"WhatsApp API error [{resp.status_code}]: {resp.text}")


async def _send_otp_phone_email_fallback(phone: str, otp: str):
    """If the phone user already has a real email, also send OTP there."""
    try:
        res = supabase.table("customers").select("email").eq("phone", phone).maybe_single().execute()
        if (
            res.data
            and res.data.get("email")
            and "@" in res.data["email"]
            and "@yacommerce" not in res.data["email"]
        ):
            await _send_otp_email(res.data["email"], otp)
    except Exception as e:
        logger.warning(f"Phone email fallback: {e}")


# ══════════════════════════════════════════════════════════════
# HELPER: normalize phone
# ══════════════════════════════════════════════════════════════

def normalize_phone(phone: str) -> str:
    p = phone.replace(" ", "").replace("-", "")
    if p.startswith("+91"):
        p = p[3:]
    elif p.startswith("91") and len(p) == 12:
        p = p[2:]
    return p


# ══════════════════════════════════════════════════════════════
# ROUTES
# ══════════════════════════════════════════════════════════════


# ── Health ────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "service": "YA Commerce API",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# ══════════════════════════════════════════════════════════════
# AUTH — Email OTP (Brevo)
# ══════════════════════════════════════════════════════════════

class EmailOTPRequest(BaseModel):
    email: str
    purpose: str = "login"

class EmailVerifyRequest(BaseModel):
    email: str
    otp: str
    purpose: str = "login"


@app.post("/api/auth/email/send-otp")
async def route_send_email_otp(req: EmailOTPRequest, request: Request):
    email = req.email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(400, "Invalid email address")

    result = await send_otp(
        identifier=email,
        identifier_type="email",
        purpose=req.purpose,
        request=request,
    )
    return result


@app.post("/api/auth/email/verify-otp")
async def route_verify_email_otp(req: EmailVerifyRequest, request: Request):
    email = req.email.strip().lower()
    otp = req.otp.strip()
    if not email or not otp or len(otp) != 6:
        raise HTTPException(400, "Invalid email or verification code")

    verify_otp(
        identifier=email,
        identifier_type="email",
        purpose=req.purpose,
        plain_otp=otp,
        request=request,
    )

    # ── OTP verified — create / link Supabase Auth user ───
    cust_res = supabase.table("customers").select("*").eq("email", email).maybe_single().execute()
    customer = cust_res.data

    if not customer:
        try:
            auth_resp = supabase.auth.admin.create_user({
                "email": email,
                "email_confirm": True,
                "user_metadata": {"email_verified": True},
            })
            user_id = auth_resp.user.id
            supabase.table("customers").insert({
                "user_id": str(user_id),
                "email": email,
                "email_verified": True,
                "phone_verified": False,
            }).execute()
        except Exception as e:
            logger.error(f"User creation error: {e}")
            try:
                users = supabase.auth.admin.list_users()
                existing = next((u for u in users if u.email == email), None)
                if existing:
                    user_id = existing.id
                    supabase.table("customers").insert({
                        "user_id": str(user_id),
                        "email": email,
                        "email_verified": True,
                        "phone_verified": False,
                    }).execute()
                else:
                    raise HTTPException(500, "Failed to create user")
            except HTTPException:
                raise
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
                supabase.table("customers").update({
                    "user_id": str(user_id),
                    "email_verified": True,
                }).eq("email", email).execute()
            except Exception:
                raise HTTPException(500, "Failed to link user")

    # Generate magic link for session
    try:
        link_resp = supabase.auth.admin.generate_link({"type": "magiclink", "email": email})
        hashed_token = link_resp.properties.hashed_token if hasattr(link_resp, "properties") else None
        return {
            "success": True,
            "session": {"properties": {"hashed_token": hashed_token}, "email": email},
        }
    except Exception as e:
        logger.error(f"Link generation error: {e}")
        return {"success": True, "message": "Verified. Please sign in."}


# ══════════════════════════════════════════════════════════════
# AUTH — Phone OTP (WhatsApp via Meta)
# ══════════════════════════════════════════════════════════════

class PhoneOTPRequest(BaseModel):
    phone: str
    purpose: str = "login"

class PhoneVerifyRequest(BaseModel):
    phone: str
    otp: str
    purpose: str = "login"


@app.post("/api/auth/phone/send-otp")
async def route_send_phone_otp(req: PhoneOTPRequest, request: Request):
    phone = normalize_phone(req.phone)
    if len(phone) != 10 or not phone.isdigit():
        raise HTTPException(400, "Invalid phone number")

    result = await send_otp(
        identifier=phone,
        identifier_type="phone",
        purpose=req.purpose,
        request=request,
    )
    return result


@app.post("/api/auth/phone/verify-otp")
async def route_verify_phone_otp(req: PhoneVerifyRequest, request: Request):
    phone = normalize_phone(req.phone)
    otp = req.otp.strip()
    if len(phone) != 10 or not otp or len(otp) != 6:
        raise HTTPException(400, "Invalid phone or verification code")

    verify_otp(
        identifier=phone,
        identifier_type="phone",
        purpose=req.purpose,
        plain_otp=otp,
        request=request,
    )

    # ── OTP verified — create / link Supabase Auth user ───
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
                    "email": email,
                    "email_confirm": bool("@yacommerce" not in email),
                    "phone": f"+91{phone}",
                    "phone_confirm": True,
                })
                user_id = auth_resp.user.id
                supabase.table("customers").update({"user_id": str(user_id)}).eq("phone", phone).execute()
            except Exception:
                raise HTTPException(500, "Failed to link user")

    try:
        link_resp = supabase.auth.admin.generate_link({"type": "magiclink", "email": email})
        hashed_token = link_resp.properties.hashed_token if hasattr(link_resp, "properties") else None
        return {
            "success": True,
            "phone_verified": True,
            "session": {"properties": {"hashed_token": hashed_token}, "email": email},
        }
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

    auth = base64.b64encode(f"{RAZORPAY_KEY_ID}:{RAZORPAY_KEY_SECRET}".encode()).decode()

    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            "https://api.razorpay.com/v1/orders",
            headers={"Authorization": f"Basic {auth}", "Content-Type": "application/json"},
            json={
                "amount": int(round(req.amount * 100)),
                "currency": req.currency,
                "receipt": f"rcpt_{req.order_id or int(time.time())}",
                "notes": {"customer_id": req.customer_id, "order_id": req.order_id or ""},
            },
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
async def verify_razorpay(req: VerifyPaymentRequest):
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
                "gateway_response": {
                    "razorpay_payment_id": req.razorpay_payment_id,
                    "razorpay_order_id": req.razorpay_order_id,
                },
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
    cust = supabase.table("customers").select("*").eq("id", req.customer_id).maybe_single().execute()
    if not cust.data:
        raise HTTPException(404, "Customer not found")

    addr = supabase.table("customer_addresses").select("*").eq("id", req.shipping_address_id).maybe_single().execute()
    if not addr.data:
        raise HTTPException(400, "Invalid shipping address")

    shipping_method = None
    if req.shipping_method_id:
        sm = supabase.table("shipping_methods").select("*").eq("id", req.shipping_method_id).maybe_single().execute()
        shipping_method = sm.data

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
    async with httpx.AsyncClient(timeout=15) as client:
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
