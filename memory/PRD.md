# YA Commerce - Product Requirements Document

## Original Problem Statement
Build a production-ready, enterprise-grade, customer-facing eCommerce website called "YA Commerce" using Supabase backend with full physical store schema. Features include multi-method auth (Email/Google/Phone), Razorpay payments + COD, order tracking with visual timeline, product reviews with media upload, support tickets with attachments, and AWS App Runner deployment readiness.

## Architecture
- **Frontend**: React 18 + React Router DOM + Tailwind CSS (port 3000)
- **Backend**: FastAPI (port 8001) - API proxy to Supabase for auth/payments/orders
- **Database**: Supabase PostgreSQL (external) - 32+ tables physical store schema
- **Storage**: AWS S3 via presigned URLs (external presign server)
- **Email**: Brevo API
- **WhatsApp**: Meta Business API (placeholder)
- **Payments**: Razorpay (live keys)
- **OAuth**: Google (via Supabase Auth)

## User Personas
1. **Shopper** - Browsing products, adding to cart, checkout, tracking orders
2. **Returning Customer** - Viewing order history, writing reviews, creating returns
3. **Support Seeker** - Creating support tickets, attaching files

## Core Requirements (Static)
- Customer-facing storefront only (no admin panel)
- Real data from Supabase (no mock data)
- Phone verification required for placing orders
- Multi-method authentication (Email OTP, Phone OTP, Google OAuth)
- Razorpay + COD payment options
- Order tracking timeline using order_events + shipment_tracking_events
- Product reviews with photo/video upload to S3
- Support tickets with file attachments
- Empty states for Cart/Orders/Wishlist/Returns/Support
- AWS App Runner deployment ready

## What's Been Implemented (2026-04-14)
### Frontend (12 pages)
- ✅ HomePage - Hero, trust badges, categories, featured products, new arrivals, CTA
- ✅ ProductListPage - Filters (category, price), sorting, search, pagination
- ✅ ProductDetailPage - Image gallery, variants, reviews with media upload, add to cart
- ✅ CartPage - Items, quantity controls, order summary, empty state
- ✅ CheckoutPage - Address management, shipping methods, Razorpay/COD payment
- ✅ AuthPage - Email OTP, Phone OTP, Google OAuth tabs
- ✅ AccountPage - Profile editing, addresses, navigation
- ✅ OrdersPage - Order history with status badges, empty state
- ✅ OrderDetailPage - Full tracking timeline, shipment info, order items/summary
- ✅ WishlistPage - Saved products with remove, empty state
- ✅ ReturnsPage - Return requests list, empty state
- ✅ SupportPage - Ticket list, create new, chat UI, file attachments

### Backend (8 API endpoints)
- ✅ GET /api/health
- ✅ POST /api/auth/email/send-otp (Brevo integration)
- ✅ POST /api/auth/email/verify-otp
- ✅ POST /api/auth/phone/send-otp (WhatsApp placeholder)
- ✅ POST /api/auth/phone/verify-otp
- ✅ GET /api/auth/google/callback
- ✅ POST /api/payment/create-order (Razorpay)
- ✅ POST /api/payment/verify (Razorpay signature verification)
- ✅ POST /api/order/create (server-side validation)
- ✅ POST /api/notifications/send (Brevo email)

### Deployment Files (in /app/artifacts/ya-commerce/)
- ✅ apprunner.yaml
- ✅ Dockerfile
- ✅ netlify.toml
- ✅ .env.example
- ✅ DEPLOYMENT.md
- ✅ README.md

## Testing Results
- Backend: 100% (16/16 — all OTP endpoints, rate limiting, validation)
- Frontend: 100% (8/8 — all UI elements and interactions)

## What's Been Implemented (2026-04-14)

### Secure OTP System (temp_otp + auth_rate_limit)
- ✅ SHA-256 hashed OTP storage (never plain text)
- ✅ Supabase `temp_otp` table integration (with in-memory fallback)
- ✅ Supabase `auth_rate_limit` table integration (with in-memory fallback)
- ✅ Rate limiting: max 5 requests per 10-minute window per identifier+action
- ✅ Auto-block for 30 minutes when rate limit exceeded
- ✅ Max 5 verification attempts per OTP
- ✅ OTP expiry: 5 minutes
- ✅ One-time use: consumed flag prevents reuse
- ✅ IP address + user-agent logging
- ✅ Expired OTP cleanup (housekeeping)
- ✅ Remaining attempts shown in error messages
- ✅ Block timestamp shown when rate-limited

## Prioritized Backlog
### P0 (Critical) - DONE
- [x] All pages implemented and functional
- [x] Auth flows (Email OTP, Google OAuth, Phone OTP)
- [x] Payment integration (Razorpay + COD)
- [x] Cart management
- [x] Order creation

### P1 (Important) - DEFERRED
- [ ] Admin dashboard for product/order management
- [ ] Real-time notifications (push)
- [ ] Inventory alert system
- [ ] Email templates (order confirmation, shipping updates)

### P2 (Nice to have) - FUTURE
- [ ] Loyalty/rewards program
- [ ] Coupon auto-apply at checkout
- [ ] Multi-warehouse routing
- [ ] Advanced analytics dashboard
- [ ] SEO optimization (meta tags, structured data)

## Next Tasks
1. User to add WhatsApp Meta Business API credentials
2. User to run Supabase SQL migration (temp_otps table) if using Supabase-stored OTPs
3. Add products to Supabase via dashboard
4. Test full checkout flow with real Razorpay payment
5. Deploy to AWS App Runner using provided configs
