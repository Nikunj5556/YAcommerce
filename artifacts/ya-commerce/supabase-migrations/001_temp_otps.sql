-- Migration: Add temp_otps table for OTP storage
-- This table is required by the authentication functions

CREATE TABLE IF NOT EXISTS temp_otps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  identifier TEXT UNIQUE NOT NULL, -- email or phone
  otp_hash TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('email', 'phone')),
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_temp_otps_identifier ON temp_otps(identifier);
CREATE INDEX IF NOT EXISTS idx_temp_otps_expires ON temp_otps(expires_at);

-- Function to auto-delete expired OTPs
CREATE OR REPLACE FUNCTION cleanup_expired_otps()
RETURNS void AS $$
BEGIN
  DELETE FROM temp_otps WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Optional: Create a cron job to clean up expired OTPs periodically
-- This would require pg_cron extension
-- SELECT cron.schedule('cleanup-otps', '*/5 * * * *', 'SELECT cleanup_expired_otps()');

COMMENT ON TABLE temp_otps IS 'Temporary storage for OTP codes during authentication';
