-- ============================================================
-- PHYSICAL ECOMMERCE STORE — SUPABASE SQL SCHEMA
-- Transformed from Digital Store Schema
-- Features: Order Tracking, Warehouses, Inventory, Shipping,
--           Returns/RMA, COD, Carriers, Manifests, Reviews
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUMS
-- ============================================================

-- Physical product types only
CREATE TYPE product_type_enum AS ENUM (
  'simple',         -- standard single product
  'variable',       -- product with variants (size/color)
  'bundle',         -- curated kit of physical items
  'gift_set',       -- gift box / combo
  'subscription_box',-- recurring physical box
  'pre_order',      -- not yet available
  'perishable',     -- food/consumable with expiry
  'fragile',        -- requires special handling
  'oversized',      -- large/heavy freight item
  'digital_addon'   -- physical product with a digital component (e.g. book+PDF)
);

CREATE TYPE product_status_enum AS ENUM (
  'draft','active','archived','hidden','sold_out','discontinued','disabled'
);

-- Physical order statuses — includes dispatch stage
CREATE TYPE order_status_enum AS ENUM (
  'pending',          -- order placed, awaiting payment
  'confirmed',        -- payment confirmed
  'processing',       -- being prepared/picked
  'packed',           -- items packed in box
  'dispatched',       -- handed to carrier
  'in_transit',       -- carrier has it
  'out_for_delivery', -- last-mile delivery
  'delivered',        -- successfully delivered
  'attempted_delivery',-- delivery failed, will retry
  'completed',        -- order closed
  'cancelled',        -- cancelled before dispatch
  'return_requested', -- customer wants to return
  'return_in_transit',-- return shipment on its way
  'returned',         -- goods back at warehouse
  'refunded',         -- money returned
  'partially_refunded',
  'failed'
);

CREATE TYPE payment_status_enum AS ENUM (
  'pending','authorized','captured','failed','refunded',
  'partially_refunded','disputed','cod_pending','cod_collected'
);

CREATE TYPE fulfillment_status_enum AS ENUM (
  'unfulfilled','picking','picked','packing','packed',
  'ready_to_ship','dispatched','fulfilled','failed','cancelled'
);

-- Physical shipment tracking statuses
CREATE TYPE shipment_status_enum AS ENUM (
  'label_created',
  'pickup_scheduled',
  'picked_up',
  'in_transit',
  'out_for_delivery',
  'delivery_attempted',
  'delivered',
  'exception',       -- lost, damaged, delay
  'returned_to_origin',
  'cancelled'
);

-- Physical delivery methods
CREATE TYPE delivery_method_enum AS ENUM (
  'standard',
  'express',
  'overnight',
  'same_day',
  'scheduled_slot',
  'click_and_collect', -- pickup from store
  'international',
  'freight',           -- large/heavy items
  'cod'                -- cash on delivery
);

CREATE TYPE shipping_rate_type_enum AS ENUM (
  'flat_rate',
  'per_kg',
  'per_item',
  'weight_tiered',
  'price_tiered',
  'free',
  'calculated'         -- real-time carrier quote
);

-- Physical return types and statuses
CREATE TYPE return_status_enum AS ENUM (
  'requested',
  'approved',
  'label_issued',
  'shipped_back',
  'received_at_warehouse',
  'inspected',
  'completed',
  'rejected'
);

CREATE TYPE return_type_enum AS ENUM (
  'refund','exchange','store_credit','repair'
);

CREATE TYPE return_item_action_enum AS ENUM (
  'refund','exchange','discard','restock','repair'
);

CREATE TYPE inventory_adjustment_type_enum AS ENUM (
  'purchase_received',  -- new stock arrived
  'sale',               -- sold through order
  'return_received',    -- customer return restocked
  'damaged',            -- written off as damaged
  'lost',               -- shrinkage/theft
  'transfer_out',       -- moved to another warehouse
  'transfer_in',        -- received from another warehouse
  'manual_correction',  -- stock count correction
  'expired'             -- perishable expired
);

CREATE TYPE transfer_status_enum AS ENUM (
  'draft','requested','in_transit','completed','cancelled'
);

CREATE TYPE refund_type_enum AS ENUM (
  'full','partial','goodwill','fraud','duplicate','chargeback_recovery','return'
);

CREATE TYPE refund_status_enum AS ENUM (
  'requested','approved','processing','completed','rejected'
);

CREATE TYPE coupon_type_enum AS ENUM (
  'percentage','fixed','free_shipping','bogo','wallet_credit','gift'
);

CREATE TYPE ticket_status_enum AS ENUM (
  'open','pending','in_progress','waiting_customer','resolved','closed'
);

CREATE TYPE ticket_priority_enum AS ENUM ('low','medium','high','urgent');

-- Physical store ticket categories
CREATE TYPE ticket_category_enum AS ENUM (
  'billing','delivery','refund','return','damaged_item','missing_item',
  'wrong_item','account','cancellation','complaint','exchange','abuse','other'
);

CREATE TYPE ticket_channel_enum AS ENUM (
  'email','live_chat','whatsapp','form','instagram','admin','phone'
);

CREATE TYPE staff_role_enum AS ENUM (
  'owner','admin','support','sales','finance','operations',
  'warehouse','fulfillment','driver','marketer','developer'
);

CREATE TYPE wallet_tx_type_enum AS ENUM (
  'credit','debit','refund','bonus','cashback','adjustment','purchase'
);

CREATE TYPE lead_stage_enum AS ENUM (
  'new','contacted','qualified','proposal','won','lost','nurture'
);

CREATE TYPE source_channel_enum AS ENUM (
  'website','admin','whatsapp','manual','affiliate','api','mobile_app',
  'marketplace','pos'  -- point of sale for physical retail
);

CREATE TYPE invoice_status_enum AS ENUM (
  'draft','sent','paid','overdue','cancelled'
);

CREATE TYPE cart_status_enum AS ENUM (
  'active','converted','abandoned','expired'
);

CREATE TYPE checkout_status_enum AS ENUM (
  'started','payment_pending','paid','failed','abandoned','completed'
);

CREATE TYPE actor_enum AS ENUM ('customer','staff','system','bot','carrier');

CREATE TYPE gift_card_status_enum AS ENUM (
  'active','redeemed','expired','cancelled'
);

CREATE TYPE review_status_enum AS ENUM (
  'pending','approved','rejected','flagged'
);

CREATE TYPE pickup_status_enum AS ENUM (
  'scheduled','confirmed','completed','missed','cancelled'
);

-- ============================================================
-- 1. STORE SETTINGS
-- ============================================================

CREATE TABLE store_settings (
  id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_name                  TEXT NOT NULL,
  logo_url                    TEXT,
  support_email               TEXT,
  support_phone               TEXT,
  whatsapp_number             TEXT,
  guest_checkout_enabled      BOOLEAN DEFAULT TRUE,
  account_creation_required   BOOLEAN DEFAULT FALSE,
  tax_inclusive_pricing        BOOLEAN DEFAULT FALSE,
  auto_invoice_generation      BOOLEAN DEFAULT TRUE,
  default_currency             TEXT NOT NULL DEFAULT 'INR',
  timezone                     TEXT DEFAULT 'Asia/Kolkata',
  -- Physical store specific
  gstin                        TEXT,                    -- GST registration number
  pan_number                   TEXT,
  business_type                TEXT DEFAULT 'retailer', -- retailer/distributor/manufacturer
  cod_enabled                  BOOLEAN DEFAULT TRUE,
  cod_max_order_value          NUMERIC(12,2),           -- COD not allowed above this
  free_shipping_above          NUMERIC(12,2),           -- free shipping threshold
  default_weight_unit          TEXT DEFAULT 'kg' CHECK (default_weight_unit IN ('kg','g','lb','oz')),
  default_dimension_unit       TEXT DEFAULT 'cm' CHECK (default_dimension_unit IN ('cm','mm','in')),
  max_order_weight_kg          NUMERIC(8,2),
  return_window_days           INT DEFAULT 7,           -- days customer can raise a return
  exchange_window_days         INT DEFAULT 15,
  created_at                   TIMESTAMPTZ DEFAULT NOW(),
  updated_at                   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE store_policies (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id             UUID REFERENCES store_settings(id) ON DELETE CASCADE,
  privacy_policy       TEXT,
  refund_policy        TEXT,
  return_policy        TEXT,           -- PHYSICAL: full return/exchange policy
  terms_and_conditions TEXT,
  shipping_policy      TEXT,
  cancellation_policy  TEXT,
  cod_policy           TEXT,           -- PHYSICAL: COD specific terms
  warranty_policy      TEXT,           -- PHYSICAL: product warranty terms
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 2. STAFF / TEAM
-- ============================================================

CREATE TABLE staff_users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name     TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  phone         TEXT,
  password_hash TEXT,
  role          staff_role_enum NOT NULL DEFAULT 'support',
  department    TEXT,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','suspended')),
  profile_image TEXT,
  warehouse_id  UUID,   -- FK added after warehouses table; null = not warehouse-assigned
  last_login    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE staff_permissions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  role            staff_role_enum NOT NULL,
  permission_name TEXT NOT NULL,
  allowed_actions TEXT[] DEFAULT '{}',
  resource_scope  TEXT[] DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE staff_activity_logs (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  staff_id     UUID REFERENCES staff_users(id) ON DELETE SET NULL,
  action       TEXT NOT NULL,
  resource     TEXT,
  resource_id  UUID,
  ip_address   INET,
  device_info  TEXT,
  notes        TEXT,
  metadata     JSONB DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 3. WAREHOUSES / FULFILLMENT CENTERS
-- (New — not present in digital schema)
-- ============================================================

CREATE TABLE warehouses (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            TEXT NOT NULL,
  code            TEXT UNIQUE NOT NULL,  -- short code e.g. 'WH-DEL-01'
  address_line1   TEXT NOT NULL,
  address_line2   TEXT,
  city            TEXT NOT NULL,
  district        TEXT,
  state           TEXT NOT NULL,
  postal_code     TEXT NOT NULL,
  country         TEXT NOT NULL DEFAULT 'India',
  contact_name    TEXT,
  contact_email   TEXT,
  contact_phone   TEXT,
  gstin           TEXT,
  is_active       BOOLEAN DEFAULT TRUE,
  is_default      BOOLEAN DEFAULT FALSE,  -- primary fulfillment center
  is_return_center BOOLEAN DEFAULT FALSE, -- dedicated return processing
  operating_hours JSONB DEFAULT '{}',     -- { "mon": "09:00-18:00", ... }
  capabilities    TEXT[] DEFAULT '{}',    -- ['picking','packing','returns','cold_chain']
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Add FK for staff warehouse assignment
ALTER TABLE staff_users ADD CONSTRAINT fk_staff_warehouse
  FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE SET NULL;

-- ============================================================
-- 4. CUSTOMERS
-- ============================================================

CREATE TABLE customers (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id              UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  first_name           TEXT,
  last_name            TEXT,
  full_name            TEXT GENERATED ALWAYS AS (first_name || ' ' || last_name) STORED,
  email                TEXT UNIQUE NOT NULL,
  email_verified       BOOLEAN DEFAULT FALSE,
  phone                TEXT,
  phone_verified       BOOLEAN DEFAULT FALSE,
  password_hash        TEXT,
  profile_image        TEXT,
  gender               TEXT,
  date_of_birth        DATE,
  -- CRM / Lifecycle
  customer_segment     TEXT,
  total_orders         INT DEFAULT 0,
  total_spend          NUMERIC(12,2) DEFAULT 0,
  average_order_value  NUMERIC(12,2) DEFAULT 0,
  lifetime_value       NUMERIC(12,2) DEFAULT 0,
  refund_count         INT DEFAULT 0,
  return_count         INT DEFAULT 0,    -- PHYSICAL: track return behavior
  chargeback_count     INT DEFAULT 0,
  risk_score           NUMERIC(5,2) DEFAULT 0,
  loyalty_tier         TEXT,
  reward_points        INT DEFAULT 0,
  referral_code        TEXT UNIQUE,
  referred_by          UUID REFERENCES customers(id) ON DELETE SET NULL,
  -- Physical preferences
  preferred_delivery_slot TEXT,         -- 'morning','afternoon','evening'
  cod_eligible         BOOLEAN DEFAULT TRUE,  -- can be set false for abusive COD customers
  -- Preferences
  favorite_categories  UUID[] DEFAULT '{}',
  saved_interests      TEXT[] DEFAULT '{}',
  notification_prefs   JSONB DEFAULT '{}',
  review_reminder_pref BOOLEAN DEFAULT TRUE,
  cart_reminder_pref   BOOLEAN DEFAULT TRUE,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE customer_addresses (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id     UUID REFERENCES customers(id) ON DELETE CASCADE,
  address_type    TEXT DEFAULT 'home' CHECK (address_type IN ('home','work','other')),
  full_name       TEXT,
  company_name    TEXT,
  phone_number    TEXT,
  email           TEXT,
  address_line1   TEXT NOT NULL,
  address_line2   TEXT,
  landmark        TEXT,
  city            TEXT NOT NULL,
  district        TEXT,
  state           TEXT NOT NULL,
  postal_code     TEXT NOT NULL,
  country         TEXT NOT NULL DEFAULT 'India',
  latitude        NUMERIC(10,7),   -- PHYSICAL: for last-mile optimization
  longitude       NUMERIC(10,7),
  is_default      BOOLEAN DEFAULT FALSE,
  verified        BOOLEAN DEFAULT FALSE,
  delivery_instructions TEXT,      -- PHYSICAL: gate code, leave at door, etc.
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 5. CATEGORIES / COLLECTIONS
-- ============================================================

CREATE TABLE categories (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name             TEXT NOT NULL,
  slug             TEXT UNIQUE NOT NULL,
  parent_id        UUID REFERENCES categories(id) ON DELETE SET NULL,
  description      TEXT,
  image_url        TEXT,
  sort_order       INT DEFAULT 0,
  seo_title        TEXT,
  seo_description  TEXT,
  is_featured      BOOLEAN DEFAULT FALSE,
  is_visible       BOOLEAN DEFAULT TRUE,
  visibility_rules JSONB DEFAULT '{}',
  -- Physical: HSN code can be set at category level as default
  default_hsn_code TEXT,
  default_tax_rate NUMERIC(5,2),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 6. PACKAGING TYPES
-- (New — physical stores need box/envelope size management)
-- ============================================================

CREATE TABLE packaging_types (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            TEXT NOT NULL,   -- 'Small Box', 'Bubble Mailer', 'Poly Bag'
  code            TEXT UNIQUE,
  length_cm       NUMERIC(8,2),
  width_cm        NUMERIC(8,2),
  height_cm       NUMERIC(8,2),
  weight_kg       NUMERIC(8,3),   -- tare weight of packaging itself
  max_weight_kg   NUMERIC(8,2),   -- max content weight it can hold
  cost            NUMERIC(8,2) DEFAULT 0,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 7. PRODUCTS
-- ============================================================

CREATE TABLE products (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                 TEXT NOT NULL,
  slug                 TEXT UNIQUE NOT NULL,
  product_type         product_type_enum NOT NULL DEFAULT 'simple',
  status               product_status_enum NOT NULL DEFAULT 'draft',
  short_description    TEXT,
  full_description     TEXT,
  brand                TEXT,
  manufacturer         TEXT,                -- PHYSICAL: who made it
  country_of_origin    TEXT,               -- PHYSICAL: for customs/labelling
  category_id          UUID REFERENCES categories(id) ON DELETE SET NULL,
  tags                 TEXT[] DEFAULT '{}',
  -- Pricing
  base_price           NUMERIC(12,2) NOT NULL DEFAULT 0,
  compare_at_price     NUMERIC(12,2),       -- MRP / strikethrough
  cost_price           NUMERIC(12,2),       -- PHYSICAL: COGS for margin tracking
  tax_class            TEXT,
  hsn_code             TEXT,               -- PHYSICAL: HSN/SAC for GST
  gst_rate             NUMERIC(5,2),       -- PHYSICAL: GST % (0/5/12/18/28)
  discount_eligible    BOOLEAN DEFAULT TRUE,
  -- Inventory / Identification
  sku                  TEXT UNIQUE,
  barcode              TEXT,               -- PHYSICAL: EAN-13 / UPC / ISBN
  barcode_type         TEXT DEFAULT 'EAN13' CHECK (barcode_type IN ('EAN13','UPC','ISBN','QR','Custom')),
  -- Physical dimensions & weight (for shipping rate calculation)
  weight_kg            NUMERIC(8,3),
  length_cm            NUMERIC(8,2),
  width_cm             NUMERIC(8,2),
  height_cm            NUMERIC(8,2),
  -- Physical flags
  is_fragile           BOOLEAN DEFAULT FALSE,
  requires_signature   BOOLEAN DEFAULT FALSE,
  is_hazardous         BOOLEAN DEFAULT FALSE,
  cold_chain_required  BOOLEAN DEFAULT FALSE,  -- refrigerated shipping
  cod_eligible         BOOLEAN DEFAULT TRUE,
  -- Inventory policy (NO unlimited stock for physical)
  track_inventory      BOOLEAN DEFAULT TRUE,
  purchase_limit       INT,                    -- max qty per customer
  -- Shipping
  default_packaging_id UUID REFERENCES packaging_types(id) ON DELETE SET NULL,
  -- SEO
  seo_title            TEXT,
  seo_description      TEXT,
  -- Warranty
  warranty_months      INT,
  warranty_description TEXT,
  -- Custom
  custom_fields        JSONB DEFAULT '{}',
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE product_media (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id  UUID REFERENCES products(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  media_type  TEXT NOT NULL DEFAULT 'image' CHECK (media_type IN ('image','video','360_view','size_chart')),
  alt_text    TEXT,
  sort_order  INT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Physical variants carry their own physical attributes
CREATE TABLE product_variants (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id       UUID REFERENCES products(id) ON DELETE CASCADE,
  variant_name     TEXT NOT NULL,    -- e.g. 'Red / XL'
  sku              TEXT UNIQUE,
  barcode          TEXT,
  price            NUMERIC(12,2),
  compare_at_price NUMERIC(12,2),
  cost_price       NUMERIC(12,2),
  -- Physical attributes per variant
  weight_kg        NUMERIC(8,3),
  length_cm        NUMERIC(8,2),
  width_cm         NUMERIC(8,2),
  height_cm        NUMERIC(8,2),
  -- Attributes (color, size, material, etc.)
  attributes       JSONB DEFAULT '{}',  -- { "color": "Red", "size": "XL" }
  is_active        BOOLEAN DEFAULT TRUE,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 8. INVENTORY MANAGEMENT
-- (Replaces digital access_grants — physical stores track stock)
-- ============================================================

-- Stock levels per product variant per warehouse
CREATE TABLE inventory_locations (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id           UUID REFERENCES products(id) ON DELETE CASCADE,
  variant_id           UUID REFERENCES product_variants(id) ON DELETE CASCADE,
  warehouse_id         UUID REFERENCES warehouses(id) ON DELETE CASCADE,
  quantity_on_hand     INT NOT NULL DEFAULT 0,
  quantity_reserved    INT NOT NULL DEFAULT 0,   -- in open orders, not yet shipped
  quantity_incoming    INT NOT NULL DEFAULT 0,   -- purchase orders in transit
  quantity_damaged     INT NOT NULL DEFAULT 0,   -- damaged / not sellable
  available_quantity   INT GENERATED ALWAYS AS (quantity_on_hand - quantity_reserved) STORED,
  reorder_point        INT DEFAULT 0,            -- trigger restock alert below this
  reorder_quantity     INT DEFAULT 0,            -- suggested restock qty
  bin_location         TEXT,                     -- shelf/aisle/bin e.g. 'A3-B2'
  last_counted_at      TIMESTAMPTZ,              -- last physical stock count
  last_received_at     TIMESTAMPTZ,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (variant_id, warehouse_id)
);

-- Every stock movement is recorded here (audit trail)
CREATE TABLE inventory_adjustments (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id       UUID REFERENCES products(id) ON DELETE SET NULL,
  variant_id       UUID REFERENCES product_variants(id) ON DELETE SET NULL,
  warehouse_id     UUID REFERENCES warehouses(id) ON DELETE SET NULL,
  adjustment_type  inventory_adjustment_type_enum NOT NULL,
  quantity_change  INT NOT NULL,   -- positive = stock in, negative = stock out
  quantity_before  INT NOT NULL,
  quantity_after   INT NOT NULL,
  reference_type   TEXT,           -- 'order','return','purchase_order','transfer','count'
  reference_id     UUID,
  notes            TEXT,
  performed_by     UUID REFERENCES staff_users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Stock transfers between warehouses
CREATE TABLE inventory_transfers (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transfer_number  TEXT UNIQUE NOT NULL,
  from_warehouse_id UUID REFERENCES warehouses(id) ON DELETE SET NULL,
  to_warehouse_id   UUID REFERENCES warehouses(id) ON DELETE SET NULL,
  status           transfer_status_enum DEFAULT 'draft',
  notes            TEXT,
  requested_by     UUID REFERENCES staff_users(id),
  approved_by      UUID REFERENCES staff_users(id),
  dispatched_at    TIMESTAMPTZ,
  received_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE inventory_transfer_items (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transfer_id  UUID REFERENCES inventory_transfers(id) ON DELETE CASCADE,
  product_id   UUID REFERENCES products(id) ON DELETE SET NULL,
  variant_id   UUID REFERENCES product_variants(id) ON DELETE SET NULL,
  quantity_requested INT NOT NULL,
  quantity_sent      INT DEFAULT 0,
  quantity_received  INT DEFAULT 0,
  notes        TEXT
);

CREATE SEQUENCE transfer_number_seq START 1001;
ALTER TABLE inventory_transfers ALTER COLUMN transfer_number
  SET DEFAULT 'TRF-' || LPAD(NEXTVAL('transfer_number_seq')::TEXT, 6, '0');

-- ============================================================
-- 9. SHIPPING ZONES & RATES
-- (New — physical delivery cost structure)
-- ============================================================

CREATE TABLE shipping_zones (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         TEXT NOT NULL,  -- 'Metro Cities', 'Tier-2', 'Northeast', 'International'
  countries    TEXT[] DEFAULT '{"India"}',
  states       TEXT[] DEFAULT '{}',   -- empty = all states in countries
  postal_codes TEXT[] DEFAULT '{}',   -- empty = all postcodes in states
  is_active    BOOLEAN DEFAULT TRUE,
  sort_order   INT DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE shipping_methods (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  zone_id              UUID REFERENCES shipping_zones(id) ON DELETE CASCADE,
  name                 TEXT NOT NULL,     -- 'Standard Delivery', 'Express', 'Same Day'
  carrier              TEXT,              -- 'Delhivery','Bluedart','DTDC','Shiprocket','Self'
  delivery_method      delivery_method_enum NOT NULL DEFAULT 'standard',
  rate_type            shipping_rate_type_enum NOT NULL DEFAULT 'flat_rate',
  -- Flat / base rate
  base_rate            NUMERIC(8,2) DEFAULT 0,
  -- Weight-based additions
  per_kg_rate          NUMERIC(8,2) DEFAULT 0,
  free_above_amount    NUMERIC(12,2),     -- free shipping if cart value ≥ this
  free_above_weight_kg NUMERIC(8,2),      -- OR free if weight ≤ this
  min_order_amount     NUMERIC(12,2),     -- method only available above this
  max_order_amount     NUMERIC(12,2),
  max_weight_kg        NUMERIC(8,2),
  -- COD
  cod_eligible         BOOLEAN DEFAULT TRUE,
  cod_fee              NUMERIC(8,2) DEFAULT 0,
  -- Timing
  estimated_days_min   INT,
  estimated_days_max   INT,
  -- Display
  is_active            BOOLEAN DEFAULT TRUE,
  sort_order           INT DEFAULT 0,
  description          TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 10. CATEGORY MERCHANDISING & HOMEPAGE CMS
-- ============================================================

CREATE TABLE category_featured_products (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
  product_id  UUID REFERENCES products(id) ON DELETE CASCADE,
  list_type   TEXT NOT NULL CHECK (list_type IN ('featured','best_seller','new_arrival','trending','clearance')),
  sort_order  INT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (category_id, product_id, list_type)
);

CREATE TABLE homepage_sections (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  section_key TEXT UNIQUE NOT NULL,
  product_ids UUID[] DEFAULT '{}',
  is_active   BOOLEAN DEFAULT TRUE,
  sort_order  INT DEFAULT 0,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 11. BUNDLES / KITS
-- ============================================================

CREATE TABLE bundles (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name             TEXT NOT NULL,
  included_products UUID[] NOT NULL DEFAULT '{}',
  bundle_price     NUMERIC(12,2) NOT NULL,
  savings_amount   NUMERIC(12,2),
  bundle_rules     JSONB DEFAULT '{}',
  is_visible       BOOLEAN DEFAULT TRUE,
  -- PHYSICAL: combined weight/dimensions for shipping
  total_weight_kg  NUMERIC(8,3),
  ships_together   BOOLEAN DEFAULT TRUE,  -- false = items ship from different warehouses
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 12. WISHLISTS
-- ============================================================

CREATE TABLE wishlists (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id             UUID REFERENCES customers(id) ON DELETE CASCADE,
  product_id              UUID REFERENCES products(id) ON DELETE CASCADE,
  variant_id              UUID REFERENCES product_variants(id) ON DELETE SET NULL,
  added_at                TIMESTAMPTZ DEFAULT NOW(),
  priority                INT DEFAULT 0,
  notes                   TEXT,
  notify_on_discount      BOOLEAN DEFAULT FALSE,
  notify_on_back_in_stock BOOLEAN DEFAULT FALSE,  -- PHYSICAL: restock alert
  UNIQUE (customer_id, product_id, variant_id)
);

-- ============================================================
-- 13. COUPONS / DISCOUNTS
-- ============================================================

CREATE TABLE coupons (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code                      TEXT UNIQUE NOT NULL,
  coupon_type               coupon_type_enum NOT NULL,
  discount_value            NUMERIC(12,2) NOT NULL,
  max_discount_amount       NUMERIC(12,2),
  min_cart_value            NUMERIC(12,2) DEFAULT 0,
  valid_from                TIMESTAMPTZ,
  valid_until               TIMESTAMPTZ,
  usage_limit_total         INT,
  usage_limit_per_customer  INT DEFAULT 1,
  current_usage_count       INT DEFAULT 0,
  applicable_products       UUID[] DEFAULT '{}',
  applicable_categories     UUID[] DEFAULT '{}',
  applicable_segments       TEXT[] DEFAULT '{}',
  excluded_products         UUID[] DEFAULT '{}',
  excluded_customers        UUID[] DEFAULT '{}',
  stackable                 BOOLEAN DEFAULT FALSE,
  first_order_only          BOOLEAN DEFAULT FALSE,
  new_user_only             BOOLEAN DEFAULT FALSE,
  cod_allowed               BOOLEAN DEFAULT TRUE,  -- PHYSICAL: coupon usable with COD?
  is_active                 BOOLEAN DEFAULT TRUE,
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_at                TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE promotion_rules (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  coupon_id         UUID REFERENCES coupons(id) ON DELETE CASCADE,
  trigger_condition JSONB DEFAULT '{}',
  auto_apply        BOOLEAN DEFAULT FALSE,
  campaign_name     TEXT,
  priority          INT DEFAULT 0,
  schedule          JSONB DEFAULT '{}',
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 14. CARTS
-- ============================================================

CREATE TABLE carts (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id           UUID REFERENCES customers(id) ON DELETE SET NULL,
  status                cart_status_enum DEFAULT 'active',
  currency              TEXT DEFAULT 'INR',
  subtotal              NUMERIC(12,2) DEFAULT 0,
  shipping_estimate     NUMERIC(12,2) DEFAULT 0,  -- PHYSICAL: estimated shipping
  total                 NUMERIC(12,2) DEFAULT 0,
  checkout_started      BOOLEAN DEFAULT FALSE,
  checkout_started_at   TIMESTAMPTZ,
  abandonment_timestamp TIMESTAMPTZ,
  -- Recovery
  recovery_token        TEXT UNIQUE,
  recovery_url          TEXT,
  reminder_count        INT DEFAULT 0,
  reminder_timestamps   TIMESTAMPTZ[] DEFAULT '{}',
  last_reminder_channel TEXT,
  recovered             BOOLEAN DEFAULT FALSE,
  recovered_order_id    UUID,
  incentive_offered     TEXT,
  incentive_used        BOOLEAN DEFAULT FALSE,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE cart_items (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cart_id          UUID REFERENCES carts(id) ON DELETE CASCADE,
  product_id       UUID REFERENCES products(id) ON DELETE CASCADE,
  variant_id       UUID REFERENCES product_variants(id) ON DELETE SET NULL,
  quantity         INT NOT NULL DEFAULT 1,
  unit_price       NUMERIC(12,2) NOT NULL,
  compare_price    NUMERIC(12,2),
  discounted_price NUMERIC(12,2),
  line_total       NUMERIC(12,2) NOT NULL,
  bundle_id        UUID REFERENCES bundles(id) ON DELETE SET NULL,
  added_at         TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 15. CHECKOUT SESSIONS
-- ============================================================

CREATE TABLE checkout_sessions (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cart_id                   UUID REFERENCES carts(id) ON DELETE SET NULL,
  customer_id               UUID REFERENCES customers(id) ON DELETE SET NULL,
  guest_email               TEXT,
  guest_phone               TEXT,
  billing_address_snapshot  JSONB DEFAULT '{}',
  shipping_address_snapshot JSONB DEFAULT '{}',
  tax_snapshot              JSONB DEFAULT '{}',
  coupon_snapshot           JSONB DEFAULT '{}',
  shipping_method_id        UUID REFERENCES shipping_methods(id) ON DELETE SET NULL,
  shipping_method_snapshot  JSONB DEFAULT '{}',  -- snapshot of method at checkout time
  order_summary_snapshot    JSONB DEFAULT '{}',
  payment_method_selected   TEXT,
  is_cod                    BOOLEAN DEFAULT FALSE,   -- PHYSICAL
  status                    checkout_status_enum DEFAULT 'started',
  device_info               TEXT,
  browser_info              TEXT,
  recovery_email_sent       BOOLEAN DEFAULT FALSE,
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_at                TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 16. ORDERS
-- ============================================================

CREATE TABLE orders (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number          TEXT UNIQUE NOT NULL,
  customer_id           UUID REFERENCES customers(id) ON DELETE SET NULL,
  guest_customer_data   JSONB DEFAULT '{}',
  -- Status
  order_status          order_status_enum NOT NULL DEFAULT 'pending',
  payment_status        payment_status_enum NOT NULL DEFAULT 'pending',
  fulfillment_status    fulfillment_status_enum NOT NULL DEFAULT 'unfulfilled',
  source_channel        source_channel_enum NOT NULL DEFAULT 'website',
  -- PHYSICAL: COD
  is_cod                BOOLEAN DEFAULT FALSE,
  cod_amount            NUMERIC(12,2),
  cod_collected         BOOLEAN DEFAULT FALSE,
  cod_collected_at      TIMESTAMPTZ,
  -- Shipping
  shipping_method_id    UUID REFERENCES shipping_methods(id) ON DELETE SET NULL,
  shipping_method_snapshot JSONB DEFAULT '{}',
  warehouse_id          UUID REFERENCES warehouses(id) ON DELETE SET NULL,  -- fulfilling warehouse
  -- Financials
  currency              TEXT NOT NULL DEFAULT 'INR',
  exchange_rate         NUMERIC(12,6) DEFAULT 1,
  subtotal              NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_total        NUMERIC(12,2) DEFAULT 0,
  tax_total             NUMERIC(12,2) DEFAULT 0,
  shipping_total        NUMERIC(12,2) DEFAULT 0,
  cod_fee               NUMERIC(12,2) DEFAULT 0,
  packaging_fee         NUMERIC(12,2) DEFAULT 0,   -- PHYSICAL: gift wrap, special packaging
  fees_total            NUMERIC(12,2) DEFAULT 0,
  grand_total           NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- Customer Snapshot
  name_snapshot         TEXT,
  email_snapshot        TEXT,
  phone_snapshot        TEXT,
  billing_address_snapshot  JSONB DEFAULT '{}',
  shipping_address_snapshot JSONB DEFAULT '{}',
  delivery_instructions TEXT,                      -- PHYSICAL: gate code etc.
  tax_id_snapshot       TEXT,
  company_snapshot      TEXT,
  -- Meta
  order_notes           TEXT,
  order_tags            TEXT[] DEFAULT '{}',
  gift_message          TEXT,                      -- PHYSICAL: for gift orders
  is_gift               BOOLEAN DEFAULT FALSE,
  custom_fields         JSONB DEFAULT '{}',
  purchase_date         TIMESTAMPTZ DEFAULT NOW(),
  completion_date       TIMESTAMPTZ,
  expected_delivery_date DATE,                    -- PHYSICAL: promised delivery date
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE SEQUENCE order_number_seq START 1001;
ALTER TABLE orders ALTER COLUMN order_number
  SET DEFAULT 'ORD-' || LPAD(NEXTVAL('order_number_seq')::TEXT, 6, '0');

CREATE TABLE order_items (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id                  UUID REFERENCES orders(id) ON DELETE CASCADE,
  product_id_snapshot       UUID,
  product_name_snapshot     TEXT NOT NULL,
  variant_id_snapshot       UUID,
  variant_name_snapshot     TEXT,
  sku_snapshot              TEXT,
  barcode_snapshot          TEXT,         -- PHYSICAL
  quantity                  INT NOT NULL DEFAULT 1,
  unit_price                NUMERIC(12,2) NOT NULL,
  compare_price             NUMERIC(12,2),
  cost_price_snapshot       NUMERIC(12,2),  -- PHYSICAL: COGS at time of order
  discount_amount           NUMERIC(12,2) DEFAULT 0,
  tax_amount                NUMERIC(12,2) DEFAULT 0,
  tax_rate_snapshot         NUMERIC(5,2),   -- PHYSICAL: GST rate at time of order
  hsn_code_snapshot         TEXT,           -- PHYSICAL
  line_total                NUMERIC(12,2) NOT NULL,
  -- PHYSICAL: weight/dims for shipping calc
  weight_kg_snapshot        NUMERIC(8,3),
  -- PHYSICAL: fulfillment per item
  warehouse_id              UUID REFERENCES warehouses(id) ON DELETE SET NULL,
  fulfillment_status        fulfillment_status_enum DEFAULT 'unfulfilled',
  is_returnable             BOOLEAN DEFAULT TRUE,
  return_window_days        INT DEFAULT 7,
  is_refundable             BOOLEAN DEFAULT TRUE,
  created_at                TIMESTAMPTZ DEFAULT NOW()
);

-- Back-references
ALTER TABLE carts ADD CONSTRAINT fk_carts_recovered_order
  FOREIGN KEY (recovered_order_id) REFERENCES orders(id) ON DELETE SET NULL;

-- Order timeline events
CREATE TABLE order_events (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id     UUID REFERENCES orders(id) ON DELETE CASCADE,
  event_type   TEXT NOT NULL,
  -- e.g. 'order_placed','payment_confirmed','picking_started','packed',
  --      'dispatched','in_transit','out_for_delivery','delivered',
  --      'delivery_attempted','return_requested','return_received','refunded'
  actor        actor_enum NOT NULL DEFAULT 'system',
  actor_id     UUID,
  location     TEXT,     -- PHYSICAL: city/hub where event happened
  notes        TEXT,
  metadata     JSONB DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 17. SHIPMENTS & TRACKING
-- (New — Core physical commerce feature)
-- ============================================================

CREATE TABLE shipments (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shipment_number      TEXT UNIQUE NOT NULL,
  order_id             UUID REFERENCES orders(id) ON DELETE CASCADE,
  warehouse_id         UUID REFERENCES warehouses(id) ON DELETE SET NULL,
  -- Carrier & tracking
  carrier              TEXT NOT NULL,          -- 'Delhivery','Bluedart','DTDC','FedEx','India Post'
  carrier_account      TEXT,                   -- carrier account/API key reference
  tracking_number      TEXT,
  tracking_url         TEXT,                   -- deep link to carrier tracking page
  awb_number           TEXT,                   -- Air Waybill number
  -- Method & status
  delivery_method      delivery_method_enum NOT NULL DEFAULT 'standard',
  shipment_status      shipment_status_enum NOT NULL DEFAULT 'label_created',
  -- Physical details
  total_weight_kg      NUMERIC(8,3),
  packaging_id         UUID REFERENCES packaging_types(id) ON DELETE SET NULL,
  num_packages         INT DEFAULT 1,
  -- Financials
  shipping_cost        NUMERIC(8,2),           -- actual cost paid to carrier
  cod_amount           NUMERIC(12,2),
  insurance_amount     NUMERIC(12,2),
  -- Labels & documents
  label_url            TEXT,                   -- S3 URL of shipping label PDF
  invoice_url          TEXT,                   -- S3 URL of commercial invoice
  manifest_id          UUID,                   -- FK to manifests, added later
  -- Important dates
  estimated_delivery   DATE,
  shipped_at           TIMESTAMPTZ,
  delivered_at         TIMESTAMPTZ,
  delivery_attempted_at TIMESTAMPTZ,
  -- Recipient
  recipient_name       TEXT,
  recipient_phone      TEXT,
  delivery_address_snapshot JSONB DEFAULT '{}',
  -- Return shipment
  is_return_shipment   BOOLEAN DEFAULT FALSE,
  return_id            UUID,                   -- FK to returns, added later
  -- Flags
  requires_signature   BOOLEAN DEFAULT FALSE,
  is_fragile           BOOLEAN DEFAULT FALSE,
  notes                TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE SEQUENCE shipment_number_seq START 1001;
ALTER TABLE shipments ALTER COLUMN shipment_number
  SET DEFAULT 'SHP-' || LPAD(NEXTVAL('shipment_number_seq')::TEXT, 6, '0');

-- Individual packages within a shipment (multi-box orders)
CREATE TABLE shipment_packages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shipment_id     UUID REFERENCES shipments(id) ON DELETE CASCADE,
  package_number  INT NOT NULL DEFAULT 1,
  packaging_id    UUID REFERENCES packaging_types(id) ON DELETE SET NULL,
  weight_kg       NUMERIC(8,3),
  length_cm       NUMERIC(8,2),
  width_cm        NUMERIC(8,2),
  height_cm       NUMERIC(8,2),
  tracking_number TEXT,  -- some carriers issue per-package tracking
  contents        JSONB DEFAULT '{}',  -- list of items in this box
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Items inside each shipment (link order_items to shipment)
CREATE TABLE shipment_items (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shipment_id    UUID REFERENCES shipments(id) ON DELETE CASCADE,
  order_item_id  UUID REFERENCES order_items(id) ON DELETE SET NULL,
  quantity       INT NOT NULL DEFAULT 1,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Full carrier tracking event log (webhook / poll updates stored here)
CREATE TABLE shipment_tracking_events (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shipment_id   UUID REFERENCES shipments(id) ON DELETE CASCADE,
  status        shipment_status_enum NOT NULL,
  event_code    TEXT,        -- carrier-specific status code
  description   TEXT,        -- human-readable status message
  location      TEXT,        -- hub/city where scanned
  location_type TEXT,        -- 'origin','hub','delivery_center','destination'
  latitude      NUMERIC(10,7),
  longitude     NUMERIC(10,7),
  event_time    TIMESTAMPTZ NOT NULL,   -- when carrier says it happened
  raw_payload   JSONB DEFAULT '{}',    -- full carrier API response for this event
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tracking_events_shipment ON shipment_tracking_events(shipment_id);
CREATE INDEX idx_tracking_events_time ON shipment_tracking_events(event_time DESC);

-- ============================================================
-- 18. CARRIER PICKUPS & MANIFESTS
-- (New — scheduling carrier pickups from warehouse)
-- ============================================================

CREATE TABLE carrier_pickups (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  warehouse_id    UUID REFERENCES warehouses(id) ON DELETE CASCADE,
  carrier         TEXT NOT NULL,
  pickup_date     DATE NOT NULL,
  pickup_slot     TEXT,              -- 'morning','afternoon' or '10:00-12:00'
  status          pickup_status_enum DEFAULT 'scheduled',
  carrier_pickup_id TEXT,            -- carrier's reference number
  num_packages    INT DEFAULT 0,
  total_weight_kg NUMERIC(10,2),
  confirmed_at    TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  notes           TEXT,
  created_by      UUID REFERENCES staff_users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE manifests (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  manifest_number TEXT UNIQUE NOT NULL,
  warehouse_id    UUID REFERENCES warehouses(id),
  pickup_id       UUID REFERENCES carrier_pickups(id) ON DELETE SET NULL,
  carrier         TEXT NOT NULL,
  generated_at    TIMESTAMPTZ DEFAULT NOW(),
  pdf_url         TEXT,
  shipment_count  INT DEFAULT 0,
  created_by      UUID REFERENCES staff_users(id)
);

CREATE SEQUENCE manifest_number_seq START 1001;
ALTER TABLE manifests ALTER COLUMN manifest_number
  SET DEFAULT 'MNF-' || LPAD(NEXTVAL('manifest_number_seq')::TEXT, 6, '0');

-- Link manifests back to shipments
ALTER TABLE shipments ADD CONSTRAINT fk_shipments_manifest
  FOREIGN KEY (manifest_id) REFERENCES manifests(id) ON DELETE SET NULL;

-- ============================================================
-- 19. PAYMENTS
-- ============================================================

CREATE TABLE payments (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id               UUID REFERENCES orders(id) ON DELETE SET NULL,
  customer_id            UUID REFERENCES customers(id) ON DELETE SET NULL,
  payment_provider       TEXT NOT NULL,
  provider_payment_id    TEXT,
  provider_order_id      TEXT,
  payment_method         TEXT,
  payment_status         payment_status_enum NOT NULL DEFAULT 'pending',
  paid_amount            NUMERIC(12,2) NOT NULL,
  currency               TEXT NOT NULL DEFAULT 'INR',
  payment_timestamp      TIMESTAMPTZ,
  failure_reason         TEXT,
  gateway_response       JSONB DEFAULT '{}',
  fraud_risk_result      JSONB DEFAULT '{}',
  verification_status    TEXT DEFAULT 'unverified',
  -- COD specific
  is_cod                 BOOLEAN DEFAULT FALSE,
  cod_collected_by       UUID REFERENCES staff_users(id) ON DELETE SET NULL,  -- delivery agent
  cod_collected_at       TIMESTAMPTZ,
  cod_remittance_id      UUID,   -- FK to cod_remittances, added later
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE payment_attempts (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_id        UUID REFERENCES payments(id) ON DELETE CASCADE,
  checkout_id       UUID REFERENCES checkout_sessions(id) ON DELETE SET NULL,
  ip_address        INET,
  attempt_timestamp TIMESTAMPTZ DEFAULT NOW(),
  success           BOOLEAN DEFAULT FALSE,
  error_logs        JSONB DEFAULT '{}'
);

-- COD Cash Remittance from delivery agents to finance
CREATE TABLE cod_remittances (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  remittance_number TEXT UNIQUE NOT NULL,
  carrier           TEXT NOT NULL,
  warehouse_id      UUID REFERENCES warehouses(id),
  total_amount      NUMERIC(12,2) NOT NULL,
  status            TEXT DEFAULT 'pending' CHECK (status IN ('pending','received','reconciled','disputed')),
  remittance_date   DATE,
  received_at       TIMESTAMPTZ,
  received_by       UUID REFERENCES staff_users(id),
  notes             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE SEQUENCE remittance_number_seq START 1001;
ALTER TABLE cod_remittances ALTER COLUMN remittance_number
  SET DEFAULT 'REM-' || LPAD(NEXTVAL('remittance_number_seq')::TEXT, 6, '0');

-- Link payments to remittance
ALTER TABLE payments ADD CONSTRAINT fk_payments_remittance
  FOREIGN KEY (cod_remittance_id) REFERENCES cod_remittances(id) ON DELETE SET NULL;

-- ============================================================
-- 20. RETURNS / RMA
-- (Replaces digital access_grants — physical returns are complex)
-- ============================================================

CREATE TABLE returns (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  return_number         TEXT UNIQUE NOT NULL,
  order_id              UUID REFERENCES orders(id) ON DELETE SET NULL,
  customer_id           UUID REFERENCES customers(id) ON DELETE SET NULL,
  return_type           return_type_enum NOT NULL DEFAULT 'refund',
  return_status         return_status_enum NOT NULL DEFAULT 'requested',
  -- Reason
  reason                TEXT NOT NULL,
  reason_category       TEXT,  -- 'defective','wrong_item','not_as_described','changed_mind','damaged_in_transit'
  customer_comments     TEXT,
  evidence_image_urls   TEXT[] DEFAULT '{}',  -- customer-uploaded photos
  -- Logistics
  return_warehouse_id   UUID REFERENCES warehouses(id),  -- where to send items back
  return_label_url      TEXT,                  -- S3 URL of prepaid return label
  tracking_number       TEXT,                  -- return shipment tracking
  carrier               TEXT,
  pickup_scheduled_at   TIMESTAMPTZ,
  shipped_back_at       TIMESTAMPTZ,
  received_at_warehouse TIMESTAMPTZ,
  -- Inspection
  inspected_by          UUID REFERENCES staff_users(id),
  inspected_at          TIMESTAMPTZ,
  condition_received    TEXT,  -- 'good','damaged','missing_parts','not_returned'
  inspection_notes      TEXT,
  -- Resolution
  restocking_fee        NUMERIC(8,2) DEFAULT 0,
  refund_amount         NUMERIC(12,2),
  refund_id             UUID,  -- FK to refunds, added later
  replacement_order_id  UUID REFERENCES orders(id) ON DELETE SET NULL,
  resolved_by           UUID REFERENCES staff_users(id),
  resolved_at           TIMESTAMPTZ,
  -- SLA
  sla_deadline          TIMESTAMPTZ,
  notes                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE SEQUENCE return_number_seq START 1001;
ALTER TABLE returns ALTER COLUMN return_number
  SET DEFAULT 'RET-' || LPAD(NEXTVAL('return_number_seq')::TEXT, 6, '0');

CREATE TABLE return_items (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  return_id            UUID REFERENCES returns(id) ON DELETE CASCADE,
  order_item_id        UUID REFERENCES order_items(id) ON DELETE SET NULL,
  product_id_snapshot  UUID,
  product_name_snapshot TEXT,
  variant_name_snapshot TEXT,
  sku_snapshot         TEXT,
  quantity_requested   INT NOT NULL DEFAULT 1,
  quantity_received    INT DEFAULT 0,
  unit_price_snapshot  NUMERIC(12,2),
  reason               TEXT,
  condition            TEXT,  -- 'sealed','opened','damaged','missing_accessories'
  action               return_item_action_enum DEFAULT 'refund',
  restock_warehouse_id UUID REFERENCES warehouses(id),
  restocked            BOOLEAN DEFAULT FALSE,
  restocked_at         TIMESTAMPTZ,
  notes                TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

-- Add FK for return shipments
ALTER TABLE shipments ADD CONSTRAINT fk_shipments_return
  FOREIGN KEY (return_id) REFERENCES returns(id) ON DELETE SET NULL;

-- ============================================================
-- 21. REFUNDS / REVERSALS
-- ============================================================

CREATE TABLE refunds (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id          UUID REFERENCES orders(id) ON DELETE SET NULL,
  return_id         UUID REFERENCES returns(id) ON DELETE SET NULL,   -- PHYSICAL
  payment_id        UUID REFERENCES payments(id) ON DELETE SET NULL,
  customer_id       UUID REFERENCES customers(id) ON DELETE SET NULL,
  refund_amount     NUMERIC(12,2) NOT NULL,
  refund_type       refund_type_enum NOT NULL,
  refund_reason     TEXT,
  refund_status     refund_status_enum NOT NULL DEFAULT 'requested',
  requested_at      TIMESTAMPTZ DEFAULT NOW(),
  approved_at       TIMESTAMPTZ,
  refunded_at       TIMESTAMPTZ,
  approved_by       UUID REFERENCES staff_users(id),
  gateway_refund_id TEXT,
  notes             TEXT,
  evidence_urls     TEXT[] DEFAULT '{}',
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Back-reference
ALTER TABLE returns ADD CONSTRAINT fk_returns_refund
  FOREIGN KEY (refund_id) REFERENCES refunds(id) ON DELETE SET NULL;

-- ============================================================
-- 22. INVOICES
-- ============================================================

CREATE TABLE invoices (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_number        TEXT UNIQUE NOT NULL,
  customer_id           UUID REFERENCES customers(id) ON DELETE SET NULL,
  order_id              UUID REFERENCES orders(id) ON DELETE SET NULL,
  invoice_status        invoice_status_enum DEFAULT 'draft',
  issue_date            TIMESTAMPTZ DEFAULT NOW(),
  due_date              TIMESTAMPTZ,
  currency              TEXT DEFAULT 'INR',
  tax_breakdown         JSONB DEFAULT '{}',  -- { "CGST": 9, "SGST": 9, "IGST": 0 }
  subtotal              NUMERIC(12,2) DEFAULT 0,
  discount              NUMERIC(12,2) DEFAULT 0,
  shipping_charges      NUMERIC(12,2) DEFAULT 0,  -- PHYSICAL
  total                 NUMERIC(12,2) DEFAULT 0,
  billing_address_snap  JSONB DEFAULT '{}',
  shipping_address_snap JSONB DEFAULT '{}',  -- PHYSICAL
  gstin                 TEXT,
  place_of_supply       TEXT,  -- PHYSICAL: state code for IGST/CGST+SGST determination
  is_igst               BOOLEAN DEFAULT FALSE,  -- PHYSICAL: interstate = IGST
  pdf_url               TEXT,
  eway_bill_number      TEXT,  -- PHYSICAL: E-way bill for goods > ₹50,000
  created_by            UUID REFERENCES staff_users(id),
  notes                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE SEQUENCE invoice_number_seq START 1001;
ALTER TABLE invoices ALTER COLUMN invoice_number
  SET DEFAULT 'INV-' || LPAD(NEXTVAL('invoice_number_seq')::TEXT, 6, '0');

CREATE TABLE invoice_line_items (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id   UUID REFERENCES invoices(id) ON DELETE CASCADE,
  description  TEXT,
  product_name TEXT,
  hsn_code     TEXT,           -- PHYSICAL
  quantity     INT NOT NULL DEFAULT 1,
  unit_price   NUMERIC(12,2) NOT NULL,
  tax_rate     NUMERIC(5,2) DEFAULT 0,
  cgst_rate    NUMERIC(5,2) DEFAULT 0,    -- PHYSICAL
  sgst_rate    NUMERIC(5,2) DEFAULT 0,    -- PHYSICAL
  igst_rate    NUMERIC(5,2) DEFAULT 0,    -- PHYSICAL
  tax_amount   NUMERIC(12,2) DEFAULT 0,
  total        NUMERIC(12,2) NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 23. WALLET / STORE CREDIT / GIFT CARDS
-- ============================================================

CREATE TABLE wallets (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id       UUID UNIQUE REFERENCES customers(id) ON DELETE CASCADE,
  current_balance   NUMERIC(12,2) DEFAULT 0,
  currency          TEXT DEFAULT 'INR',
  lifetime_credited NUMERIC(12,2) DEFAULT 0,
  lifetime_debited  NUMERIC(12,2) DEFAULT 0,
  last_updated      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE wallet_transactions (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_id          UUID REFERENCES wallets(id) ON DELETE CASCADE,
  type               wallet_tx_type_enum NOT NULL,
  amount             NUMERIC(12,2) NOT NULL,
  reason             TEXT,
  related_order_id   UUID REFERENCES orders(id) ON DELETE SET NULL,
  related_payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
  related_invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  related_return_id  UUID REFERENCES returns(id) ON DELETE SET NULL,  -- PHYSICAL
  performed_by       actor_enum DEFAULT 'system',
  performed_by_id    UUID,
  notes              TEXT,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE gift_cards (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gift_code       TEXT UNIQUE NOT NULL,
  balance         NUMERIC(12,2) NOT NULL,
  original_amount NUMERIC(12,2) NOT NULL,
  expiry_date     TIMESTAMPTZ,
  issued_to       UUID REFERENCES customers(id) ON DELETE SET NULL,
  issued_by       UUID REFERENCES staff_users(id) ON DELETE SET NULL,
  redeemed_by     UUID REFERENCES customers(id) ON DELETE SET NULL,
  redeemed_at     TIMESTAMPTZ,
  status          gift_card_status_enum DEFAULT 'active',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 24. PRODUCT REVIEWS
-- (New — critical for physical goods discovery and trust)
-- ============================================================

CREATE TABLE product_reviews (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id        UUID REFERENCES products(id) ON DELETE CASCADE,
  variant_id        UUID REFERENCES product_variants(id) ON DELETE SET NULL,
  customer_id       UUID REFERENCES customers(id) ON DELETE SET NULL,
  order_item_id     UUID REFERENCES order_items(id) ON DELETE SET NULL,
  rating            INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title             TEXT,
  body              TEXT,
  image_urls        TEXT[] DEFAULT '{}',  -- customer-uploaded review photos
  verified_purchase BOOLEAN DEFAULT FALSE,
  helpful_count     INT DEFAULT 0,
  not_helpful_count INT DEFAULT 0,
  status            review_status_enum DEFAULT 'pending',
  reviewed_by_staff UUID REFERENCES staff_users(id),
  staff_response    TEXT,   -- official store reply to review
  responded_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Aggregate review stats per product (updated via trigger)
CREATE TABLE product_review_stats (
  product_id        UUID PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  average_rating    NUMERIC(3,2) DEFAULT 0,
  total_reviews     INT DEFAULT 0,
  five_star_count   INT DEFAULT 0,
  four_star_count   INT DEFAULT 0,
  three_star_count  INT DEFAULT 0,
  two_star_count    INT DEFAULT 0,
  one_star_count    INT DEFAULT 0,
  last_updated      TIMESTAMPTZ DEFAULT NOW()
);

-- Function to keep review stats in sync
CREATE OR REPLACE FUNCTION refresh_product_review_stats()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO product_review_stats (
    product_id, average_rating, total_reviews,
    five_star_count, four_star_count, three_star_count,
    two_star_count, one_star_count, last_updated
  )
  SELECT
    product_id,
    ROUND(AVG(rating)::NUMERIC, 2),
    COUNT(*),
    COUNT(*) FILTER (WHERE rating = 5),
    COUNT(*) FILTER (WHERE rating = 4),
    COUNT(*) FILTER (WHERE rating = 3),
    COUNT(*) FILTER (WHERE rating = 2),
    COUNT(*) FILTER (WHERE rating = 1),
    NOW()
  FROM product_reviews
  WHERE product_id = COALESCE(NEW.product_id, OLD.product_id)
    AND status = 'approved'
  GROUP BY product_id
  ON CONFLICT (product_id) DO UPDATE SET
    average_rating  = EXCLUDED.average_rating,
    total_reviews   = EXCLUDED.total_reviews,
    five_star_count = EXCLUDED.five_star_count,
    four_star_count = EXCLUDED.four_star_count,
    three_star_count= EXCLUDED.three_star_count,
    two_star_count  = EXCLUDED.two_star_count,
    one_star_count  = EXCLUDED.one_star_count,
    last_updated    = NOW();
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_review_stats
  AFTER INSERT OR UPDATE OR DELETE ON product_reviews
  FOR EACH ROW EXECUTE FUNCTION refresh_product_review_stats();

-- ============================================================
-- 25. SUPPORT TICKETS
-- ============================================================

CREATE TABLE support_tickets (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_number      TEXT UNIQUE NOT NULL,
  customer_id        UUID REFERENCES customers(id) ON DELETE SET NULL,
  guest_email        TEXT,
  guest_phone        TEXT,
  subject            TEXT NOT NULL,
  description        TEXT,
  category           ticket_category_enum,
  priority           ticket_priority_enum DEFAULT 'medium',
  status             ticket_status_enum DEFAULT 'open',
  assigned_staff_id  UUID REFERENCES staff_users(id) ON DELETE SET NULL,
  related_order_id   UUID REFERENCES orders(id) ON DELETE SET NULL,
  related_payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
  related_product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  related_shipment_id UUID REFERENCES shipments(id) ON DELETE SET NULL,  -- PHYSICAL
  related_return_id  UUID REFERENCES returns(id) ON DELETE SET NULL,     -- PHYSICAL
  channel            ticket_channel_enum DEFAULT 'email',
  sla_deadline       TIMESTAMPTZ,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW(),
  closed_at          TIMESTAMPTZ
);

CREATE SEQUENCE ticket_number_seq START 1001;
ALTER TABLE support_tickets ALTER COLUMN ticket_number
  SET DEFAULT 'TKT-' || LPAD(NEXTVAL('ticket_number_seq')::TEXT, 6, '0');

CREATE TABLE ticket_messages (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id    UUID REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_type  actor_enum NOT NULL,
  sender_id    UUID,
  message_body TEXT NOT NULL,
  attachments  TEXT[] DEFAULT '{}',
  is_read      BOOLEAN DEFAULT FALSE,
  sent_at      TIMESTAMPTZ DEFAULT NOW(),
  edited_at    TIMESTAMPTZ,
  deleted      BOOLEAN DEFAULT FALSE
);

CREATE TABLE support_attachments (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id   UUID REFERENCES support_tickets(id) ON DELETE CASCADE,
  message_id  UUID REFERENCES ticket_messages(id) ON DELETE CASCADE,
  file_name   TEXT NOT NULL,
  file_type   TEXT,
  file_url    TEXT NOT NULL,
  uploaded_by UUID,
  upload_date TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 26. LIVE CHAT / CRM CONVERSATIONS
-- ============================================================

CREATE TABLE conversations (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id       UUID REFERENCES customers(id) ON DELETE SET NULL,
  channel           TEXT NOT NULL CHECK (channel IN ('website','whatsapp','instagram','messenger','email','phone')),
  assigned_staff_id UUID REFERENCES staff_users(id) ON DELETE SET NULL,
  status            TEXT DEFAULT 'open' CHECK (status IN ('open','closed','pending')),
  last_message_at   TIMESTAMPTZ,
  last_reply_at     TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE conversation_messages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  sender_type     actor_enum NOT NULL,
  sender_id       UUID,
  content         TEXT,
  attachments     TEXT[] DEFAULT '{}',
  template_used   TEXT,
  delivery_status TEXT DEFAULT 'sent',
  is_read         BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 27. LEADS / PRE-SALE CRM
-- ============================================================

CREATE TABLE leads (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name               TEXT,
  email              TEXT,
  phone              TEXT,
  company            TEXT,
  source             TEXT,
  campaign           TEXT,
  interested_product UUID REFERENCES products(id) ON DELETE SET NULL,
  estimated_budget   NUMERIC(12,2),
  lead_stage         lead_stage_enum DEFAULT 'new',
  assigned_staff_id  UUID REFERENCES staff_users(id) ON DELETE SET NULL,
  lead_score         INT DEFAULT 0,
  notes              TEXT,
  last_contacted_at  TIMESTAMPTZ,
  next_follow_up     TIMESTAMPTZ,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 28. ANALYTICS / TRACKING EVENTS
-- ============================================================

CREATE TABLE analytics_events (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID REFERENCES customers(id) ON DELETE SET NULL,
  session_id      TEXT,
  event_name      TEXT NOT NULL,
  event_timestamp TIMESTAMPTZ DEFAULT NOW(),
  page_url        TEXT,
  referrer        TEXT,
  utm_source      TEXT,
  utm_medium      TEXT,
  utm_campaign    TEXT,
  device          TEXT,
  browser         TEXT,
  country         TEXT,
  ip_address      INET,
  metadata        JSONB DEFAULT '{}'
);

-- ============================================================
-- 29. SEARCH & DISCOVERY
-- ============================================================

CREATE TABLE search_logs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id   UUID REFERENCES customers(id) ON DELETE SET NULL,
  session_id    TEXT,
  query         TEXT NOT NULL,
  results_shown INT DEFAULT 0,
  result_clicks INT DEFAULT 0,
  had_results   BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE search_settings (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  popular_searches  TEXT[] DEFAULT '{}',
  synonyms          JSONB DEFAULT '{}',
  ranking_overrides JSONB DEFAULT '{}',
  boost_scores      JSONB DEFAULT '{}',
  typo_corrections  JSONB DEFAULT '{}',
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 30. NOTIFICATION / MESSAGE LOGS
-- ============================================================

CREATE TABLE notification_logs (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id        UUID REFERENCES customers(id) ON DELETE SET NULL,
  channel            TEXT NOT NULL CHECK (channel IN ('email','sms','whatsapp','push')),
  type               TEXT NOT NULL,
  subject            TEXT,
  body               TEXT,
  status             TEXT DEFAULT 'sent' CHECK (status IN ('sent','delivered','failed','bounced','opened','clicked')),
  related_order_id   UUID REFERENCES orders(id) ON DELETE SET NULL,
  related_ticket_id  UUID REFERENCES support_tickets(id) ON DELETE SET NULL,
  related_shipment_id UUID REFERENCES shipments(id) ON DELETE SET NULL,  -- PHYSICAL
  related_return_id  UUID REFERENCES returns(id) ON DELETE SET NULL,     -- PHYSICAL
  sent_at            TIMESTAMPTZ DEFAULT NOW(),
  delivered_at       TIMESTAMPTZ,
  opened_at          TIMESTAMPTZ,
  clicked_at         TIMESTAMPTZ,
  metadata           JSONB DEFAULT '{}'
);

-- ============================================================
-- 31. CUSTOM FIELDS
-- ============================================================

CREATE TABLE custom_field_definitions (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type  TEXT NOT NULL CHECK (entity_type IN ('customer','product','order','ticket','invoice','return','shipment')),
  field_key    TEXT NOT NULL,
  field_label  TEXT NOT NULL,
  field_type   TEXT NOT NULL CHECK (field_type IN ('text','number','boolean','date','select','multi_select','json')),
  options      JSONB DEFAULT '{}',
  is_required  BOOLEAN DEFAULT FALSE,
  sort_order   INT DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (entity_type, field_key)
);

-- ============================================================
-- 32. AUDIT LOG
-- ============================================================

CREATE TABLE audit_logs (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  actor_type   actor_enum NOT NULL,
  actor_id     UUID,
  action       TEXT NOT NULL,
  entity_type  TEXT NOT NULL,
  entity_id    UUID,
  old_value    JSONB,
  new_value    JSONB,
  ip_address   INET,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================

-- Customers
CREATE INDEX idx_customers_email          ON customers(email);
CREATE INDEX idx_customers_phone          ON customers(phone);
CREATE INDEX idx_customers_referral_code  ON customers(referral_code);
CREATE INDEX idx_customers_user_id        ON customers(user_id);

-- Products
CREATE INDEX idx_products_slug            ON products(slug);
CREATE INDEX idx_products_status          ON products(status);
CREATE INDEX idx_products_category        ON products(category_id);
CREATE INDEX idx_products_type            ON products(product_type);
CREATE INDEX idx_products_sku             ON products(sku);
CREATE INDEX idx_products_barcode         ON products(barcode);

-- Variants
CREATE INDEX idx_variants_product         ON product_variants(product_id);
CREATE INDEX idx_variants_sku             ON product_variants(sku);
CREATE INDEX idx_variants_barcode         ON product_variants(barcode);

-- Inventory
CREATE INDEX idx_inventory_variant        ON inventory_locations(variant_id);
CREATE INDEX idx_inventory_warehouse      ON inventory_locations(warehouse_id);
CREATE INDEX idx_inventory_adj_product    ON inventory_adjustments(product_id);
CREATE INDEX idx_inventory_adj_warehouse  ON inventory_adjustments(warehouse_id);
CREATE INDEX idx_inventory_adj_created    ON inventory_adjustments(created_at DESC);

-- Orders
CREATE INDEX idx_orders_customer          ON orders(customer_id);
CREATE INDEX idx_orders_status            ON orders(order_status);
CREATE INDEX idx_orders_payment_status    ON orders(payment_status);
CREATE INDEX idx_orders_purchase_date     ON orders(purchase_date DESC);
CREATE INDEX idx_orders_number            ON orders(order_number);
CREATE INDEX idx_orders_warehouse         ON orders(warehouse_id);
CREATE INDEX idx_orders_is_cod            ON orders(is_cod);

-- Order Items
CREATE INDEX idx_order_items_order        ON order_items(order_id);

-- Shipments
CREATE INDEX idx_shipments_order          ON shipments(order_id);
CREATE INDEX idx_shipments_tracking       ON shipments(tracking_number);
CREATE INDEX idx_shipments_awb            ON shipments(awb_number);
CREATE INDEX idx_shipments_status         ON shipments(shipment_status);
CREATE INDEX idx_shipments_carrier        ON shipments(carrier);
CREATE INDEX idx_shipment_items_shipment  ON shipment_items(shipment_id);

-- Returns
CREATE INDEX idx_returns_order            ON returns(order_id);
CREATE INDEX idx_returns_customer         ON returns(customer_id);
CREATE INDEX idx_returns_status           ON returns(return_status);
CREATE INDEX idx_return_items_return      ON return_items(return_id);

-- Payments
CREATE INDEX idx_payments_order           ON payments(order_id);
CREATE INDEX idx_payments_customer        ON payments(customer_id);
CREATE INDEX idx_payments_status          ON payments(payment_status);

-- Carts
CREATE INDEX idx_carts_customer           ON carts(customer_id);
CREATE INDEX idx_carts_status             ON carts(status);
CREATE INDEX idx_carts_recovery_token     ON carts(recovery_token);

-- Reviews
CREATE INDEX idx_reviews_product          ON product_reviews(product_id);
CREATE INDEX idx_reviews_customer         ON product_reviews(customer_id);
CREATE INDEX idx_reviews_status           ON product_reviews(status);

-- Analytics
CREATE INDEX idx_analytics_event_name     ON analytics_events(event_name);
CREATE INDEX idx_analytics_user           ON analytics_events(user_id);
CREATE INDEX idx_analytics_timestamp      ON analytics_events(event_timestamp DESC);

-- Support Tickets
CREATE INDEX idx_tickets_customer         ON support_tickets(customer_id);
CREATE INDEX idx_tickets_status           ON support_tickets(status);
CREATE INDEX idx_tickets_shipment         ON support_tickets(related_shipment_id);
CREATE INDEX idx_tickets_return           ON support_tickets(related_return_id);

-- Notifications
CREATE INDEX idx_notifications_customer   ON notification_logs(customer_id);
CREATE INDEX idx_notifications_shipment   ON notification_logs(related_shipment_id);

-- Wallet
CREATE INDEX idx_wallet_transactions_wallet ON wallet_transactions(wallet_id);

-- Search
CREATE INDEX idx_search_logs_query        ON search_logs(query);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE customers             ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_addresses    ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders                ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items           ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments              ENABLE ROW LEVEL SECURITY;
ALTER TABLE carts                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items            ENABLE ROW LEVEL SECURITY;
ALTER TABLE wishlists             ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_messages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallets               ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet_transactions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_logs     ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_reviews       ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipments             ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipment_tracking_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE returns               ENABLE ROW LEVEL SECURITY;

-- Customers own row
CREATE POLICY "customers_own_row" ON customers
  FOR ALL USING (user_id = auth.uid());

-- Addresses
CREATE POLICY "addresses_own" ON customer_addresses
  FOR ALL USING (customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid()));

-- Orders
CREATE POLICY "orders_own" ON orders
  FOR ALL USING (customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid()));

-- Order Items
CREATE POLICY "order_items_own" ON order_items
  FOR SELECT USING (
    order_id IN (
      SELECT id FROM orders WHERE customer_id IN (
        SELECT id FROM customers WHERE user_id = auth.uid()
      )
    )
  );

-- Payments
CREATE POLICY "payments_own" ON payments
  FOR SELECT USING (customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid()));

-- Carts
CREATE POLICY "carts_own" ON carts
  FOR ALL USING (customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid()));

-- Cart Items
CREATE POLICY "cart_items_own" ON cart_items
  FOR ALL USING (
    cart_id IN (
      SELECT id FROM carts WHERE customer_id IN (
        SELECT id FROM customers WHERE user_id = auth.uid()
      )
    )
  );

-- Wishlists
CREATE POLICY "wishlists_own" ON wishlists
  FOR ALL USING (customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid()));

-- Support Tickets
CREATE POLICY "tickets_own" ON support_tickets
  FOR ALL USING (customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid()));

-- Ticket Messages
CREATE POLICY "ticket_messages_own" ON ticket_messages
  FOR SELECT USING (
    ticket_id IN (
      SELECT id FROM support_tickets WHERE customer_id IN (
        SELECT id FROM customers WHERE user_id = auth.uid()
      )
    )
  );

-- Wallets
CREATE POLICY "wallets_own" ON wallets
  FOR SELECT USING (customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid()));

-- Wallet Transactions
CREATE POLICY "wallet_tx_own" ON wallet_transactions
  FOR SELECT USING (
    wallet_id IN (
      SELECT id FROM wallets WHERE customer_id IN (
        SELECT id FROM customers WHERE user_id = auth.uid()
      )
    )
  );

-- Notifications
CREATE POLICY "notifications_own" ON notification_logs
  FOR SELECT USING (customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid()));

-- Reviews: customers can see all approved reviews, manage their own
CREATE POLICY "reviews_read_approved" ON product_reviews
  FOR SELECT USING (status = 'approved' OR customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid()));

CREATE POLICY "reviews_own_write" ON product_reviews
  FOR INSERT WITH CHECK (customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid()));

-- Shipments: customers can see their own shipments
CREATE POLICY "shipments_own" ON shipments
  FOR SELECT USING (
    order_id IN (
      SELECT id FROM orders WHERE customer_id IN (
        SELECT id FROM customers WHERE user_id = auth.uid()
      )
    )
  );

-- Tracking events: customers can see their shipment events
CREATE POLICY "tracking_events_own" ON shipment_tracking_events
  FOR SELECT USING (
    shipment_id IN (
      SELECT s.id FROM shipments s
      JOIN orders o ON o.id = s.order_id
      WHERE o.customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid())
    )
  );

-- Returns: customers can see/create their own
CREATE POLICY "returns_own" ON returns
  FOR ALL USING (customer_id IN (SELECT id FROM customers WHERE user_id = auth.uid()));

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'store_settings','store_policies','customers','categories',
    'products','orders','carts','checkout_sessions','coupons',
    'invoices','bundles','support_tickets','leads','conversations',
    'warehouses','inventory_locations','inventory_transfers',
    'shipments','returns','product_reviews'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_updated_at_%I
       BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();', t, t
    );
  END LOOP;
END;
$$;

-- ============================================================
-- LOW STOCK ALERT FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION check_low_stock()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert a notification when available stock drops at or below reorder_point
  IF NEW.available_quantity <= NEW.reorder_point AND OLD.available_quantity > OLD.reorder_point THEN
    INSERT INTO notification_logs (channel, type, subject, body, metadata)
    VALUES (
      'email', 'low_stock_alert',
      'Low Stock Alert',
      'Variant ' || NEW.variant_id || ' at warehouse ' || NEW.warehouse_id ||
        ' is at ' || NEW.available_quantity || ' units (reorder point: ' || NEW.reorder_point || ')',
      jsonb_build_object(
        'variant_id', NEW.variant_id,
        'warehouse_id', NEW.warehouse_id,
        'available_quantity', NEW.available_quantity,
        'reorder_point', NEW.reorder_point
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_low_stock
  AFTER UPDATE OF available_quantity ON inventory_locations
  FOR EACH ROW EXECUTE FUNCTION check_low_stock();

-- ============================================================
-- USEFUL VIEWS
-- ============================================================

-- Full order tracking view (everything a customer or agent needs)
CREATE OR REPLACE VIEW v_order_tracking AS
SELECT
  o.id                        AS order_id,
  o.order_number,
  o.order_status,
  o.fulfillment_status,
  o.purchase_date,
  o.expected_delivery_date,
  o.grand_total,
  o.is_cod,
  o.cod_collected,
  c.email                     AS customer_email,
  c.full_name                 AS customer_name,
  s.id                        AS shipment_id,
  s.shipment_number,
  s.carrier,
  s.tracking_number,
  s.awb_number,
  s.tracking_url,
  s.shipment_status,
  s.estimated_delivery,
  s.shipped_at,
  s.delivered_at,
  w.name                      AS warehouse_name,
  -- latest tracking event
  te.description              AS last_event_description,
  te.location                 AS last_event_location,
  te.event_time               AS last_event_time
FROM orders o
LEFT JOIN customers c ON c.id = o.customer_id
LEFT JOIN shipments s ON s.order_id = o.id AND NOT s.is_return_shipment
LEFT JOIN warehouses w ON w.id = s.warehouse_id
LEFT JOIN LATERAL (
  SELECT description, location, event_time
  FROM shipment_tracking_events
  WHERE shipment_id = s.id
  ORDER BY event_time DESC
  LIMIT 1
) te ON TRUE;

-- Order summary view
CREATE OR REPLACE VIEW v_order_summary AS
SELECT
  o.id,
  o.order_number,
  o.order_status,
  o.payment_status,
  o.fulfillment_status,
  o.grand_total,
  o.currency,
  o.purchase_date,
  o.is_cod,
  c.email                 AS customer_email,
  c.full_name             AS customer_name,
  COUNT(oi.id)            AS item_count,
  w.name                  AS fulfilling_warehouse
FROM orders o
LEFT JOIN customers c ON c.id = o.customer_id
LEFT JOIN order_items oi ON oi.order_id = o.id
LEFT JOIN warehouses w ON w.id = o.warehouse_id
GROUP BY o.id, c.email, c.full_name, w.name;

-- Customer LTV view
CREATE OR REPLACE VIEW v_customer_ltv AS
SELECT
  c.id,
  c.full_name,
  c.email,
  c.loyalty_tier,
  COUNT(o.id)                       AS total_orders,
  COALESCE(SUM(o.grand_total), 0)   AS total_spend,
  COALESCE(AVG(o.grand_total), 0)   AS avg_order_value,
  c.return_count,
  c.cod_eligible
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
  AND o.order_status NOT IN ('cancelled','refunded','failed')
GROUP BY c.id;

-- Inventory overview (available stock across all warehouses)
CREATE OR REPLACE VIEW v_inventory_summary AS
SELECT
  p.id                              AS product_id,
  p.name                            AS product_name,
  p.sku,
  pv.id                             AS variant_id,
  pv.variant_name,
  pv.sku                            AS variant_sku,
  SUM(il.quantity_on_hand)          AS total_on_hand,
  SUM(il.quantity_reserved)         AS total_reserved,
  SUM(il.available_quantity)        AS total_available,
  SUM(il.quantity_incoming)         AS total_incoming,
  MIN(il.reorder_point)             AS reorder_point,
  BOOL_OR(il.available_quantity <= il.reorder_point) AS is_low_stock
FROM products p
JOIN product_variants pv ON pv.product_id = p.id
LEFT JOIN inventory_locations il ON il.variant_id = pv.id
GROUP BY p.id, p.name, p.sku, pv.id, pv.variant_name, pv.sku;

-- Shipment tracking summary
CREATE OR REPLACE VIEW v_shipment_tracking_summary AS
SELECT
  s.id,
  s.shipment_number,
  s.order_id,
  s.carrier,
  s.tracking_number,
  s.tracking_url,
  s.shipment_status,
  s.estimated_delivery,
  s.shipped_at,
  s.delivered_at,
  COUNT(ste.id)         AS total_events,
  MAX(ste.event_time)   AS last_event_time,
  (SELECT description FROM shipment_tracking_events
   WHERE shipment_id = s.id ORDER BY event_time DESC LIMIT 1) AS latest_status_text,
  (SELECT location FROM shipment_tracking_events
   WHERE shipment_id = s.id ORDER BY event_time DESC LIMIT 1) AS latest_location
FROM shipments s
LEFT JOIN shipment_tracking_events ste ON ste.shipment_id = s.id
GROUP BY s.id;

-- Returns overview
CREATE OR REPLACE VIEW v_returns_summary AS
SELECT
  r.id,
  r.return_number,
  r.return_status,
  r.return_type,
  r.reason_category,
  r.created_at,
  r.resolved_at,
  o.order_number,
  c.email     AS customer_email,
  c.full_name AS customer_name,
  COUNT(ri.id) AS item_count
FROM returns r
LEFT JOIN orders o ON o.id = r.order_id
LEFT JOIN customers c ON c.id = r.customer_id
LEFT JOIN return_items ri ON ri.return_id = r.id
GROUP BY r.id, o.order_number, c.email, c.full_name;

-- ============================================================
-- END OF SCHEMA
-- ============================================================
