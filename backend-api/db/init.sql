-- PinVault Pro – PostgreSQL Schema
-- Run once on fresh database

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────────────
-- USERS
-- ─────────────────────────────────────────────────────
CREATE TYPE user_role AS ENUM ('user', 'admin', 'moderator');
CREATE TYPE subscription_tier AS ENUM ('free', 'premium', 'enterprise');
CREATE TYPE auth_provider AS ENUM ('local', 'google', 'facebook', 'apple');

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  username      VARCHAR(50) UNIQUE,
  display_name  VARCHAR(100),
  avatar_url    TEXT,
  password_hash TEXT,
  role          user_role NOT NULL DEFAULT 'user',
  tier          subscription_tier NOT NULL DEFAULT 'free',
  auth_provider auth_provider NOT NULL DEFAULT 'local',
  provider_id   VARCHAR(255),
  is_active     BOOLEAN NOT NULL DEFAULT true,
  is_verified   BOOLEAN NOT NULL DEFAULT false,
  mfa_enabled   BOOLEAN NOT NULL DEFAULT false,
  mfa_secret    TEXT,
  failed_login_attempts INT NOT NULL DEFAULT 0,
  locked_until  TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_provider ON users(auth_provider, provider_id);

-- ─────────────────────────────────────────────────────
-- REFRESH TOKENS
-- ─────────────────────────────────────────────────────
CREATE TABLE refresh_tokens (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  device_info TEXT,
  ip_address INET,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_hash ON refresh_tokens(token_hash);

-- ─────────────────────────────────────────────────────
-- EMAIL VERIFICATIONS & PASSWORD RESETS
-- ─────────────────────────────────────────────────────
CREATE TABLE email_verifications (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE password_resets (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────
-- SUBSCRIPTIONS
-- ─────────────────────────────────────────────────────
CREATE TYPE subscription_status AS ENUM ('active', 'canceled', 'past_due', 'trialing', 'incomplete');

CREATE TABLE subscriptions (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_customer_id  VARCHAR(255) UNIQUE,
  stripe_subscription_id VARCHAR(255) UNIQUE,
  stripe_price_id     VARCHAR(255),
  status              subscription_status NOT NULL DEFAULT 'active',
  tier                subscription_tier NOT NULL DEFAULT 'premium',
  current_period_start TIMESTAMPTZ,
  current_period_end  TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  canceled_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_stripe ON subscriptions(stripe_subscription_id);

-- ─────────────────────────────────────────────────────
-- DOWNLOAD JOBS
-- ─────────────────────────────────────────────────────
CREATE TYPE download_status AS ENUM ('pending', 'processing', 'completed', 'failed', 'scheduled');
CREATE TYPE download_format AS ENUM ('mp4', 'webm', 'mp3');
CREATE TYPE ai_enhancement_type AS ENUM ('none', 'upscale_2x', 'upscale_4x', 'denoise', 'color_correct');

CREATE TABLE download_jobs (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id           UUID REFERENCES users(id) ON DELETE SET NULL,
  pinterest_url     TEXT NOT NULL,
  pin_id            VARCHAR(255),
  title             TEXT,
  description       TEXT,
  thumbnail_url     TEXT,
  duration_seconds  INT,
  format            download_format NOT NULL DEFAULT 'mp4',
  quality           VARCHAR(20) DEFAULT 'best',
  ai_enhancement    ai_enhancement_type NOT NULL DEFAULT 'none',
  status            download_status NOT NULL DEFAULT 'pending',
  progress          SMALLINT NOT NULL DEFAULT 0,
  file_url          TEXT,
  file_size_bytes   BIGINT,
  s3_key            TEXT,
  signed_url        TEXT,
  signed_url_expires TIMESTAMPTZ,
  error_message     TEXT,
  scheduled_at      TIMESTAMPTZ,
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  ip_address        INET,
  user_agent        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_jobs_user ON download_jobs(user_id);
CREATE INDEX idx_jobs_status ON download_jobs(status);
CREATE INDEX idx_jobs_created ON download_jobs(created_at DESC);

-- ─────────────────────────────────────────────────────
-- BATCH JOBS
-- ─────────────────────────────────────────────────────
CREATE TABLE batch_jobs (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  status       download_status NOT NULL DEFAULT 'pending',
  total_count  INT NOT NULL DEFAULT 0,
  completed_count INT NOT NULL DEFAULT 0,
  failed_count INT NOT NULL DEFAULT 0,
  zip_url      TEXT,
  zip_s3_key   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE batch_job_items (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_job_id  UUID NOT NULL REFERENCES batch_jobs(id) ON DELETE CASCADE,
  download_job_id UUID REFERENCES download_jobs(id),
  pinterest_url TEXT NOT NULL,
  status        download_status NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_batch_items_job ON batch_job_items(batch_job_id);

-- ─────────────────────────────────────────────────────
-- FAVORITES / COLLECTIONS
-- ─────────────────────────────────────────────────────
CREATE TABLE collections (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL,
  description TEXT,
  is_public   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE collection_items (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  collection_id   UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  download_job_id UUID NOT NULL REFERENCES download_jobs(id) ON DELETE CASCADE,
  added_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(collection_id, download_job_id)
);

-- ─────────────────────────────────────────────────────
-- API KEYS (for developer access)
-- ─────────────────────────────────────────────────────
CREATE TYPE api_tier AS ENUM ('free', 'pro', 'enterprise');

CREATE TABLE api_keys (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            VARCHAR(100) NOT NULL,
  key_prefix      VARCHAR(8) NOT NULL,
  key_hash        TEXT NOT NULL UNIQUE,
  tier            api_tier NOT NULL DEFAULT 'free',
  daily_limit     INT NOT NULL DEFAULT 100,
  monthly_limit   INT NOT NULL DEFAULT 3000,
  scopes          TEXT[] NOT NULL DEFAULT ARRAY['download:read', 'download:create'],
  last_used_at    TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_api_keys_user ON api_keys(user_id);
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);

-- ─────────────────────────────────────────────────────
-- AUDIT LOG
-- ─────────────────────────────────────────────────────
CREATE TABLE audit_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  action      VARCHAR(100) NOT NULL,
  resource    VARCHAR(100),
  resource_id UUID,
  details     JSONB,
  ip_address  INET,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);

-- ─────────────────────────────────────────────────────
-- DMCA REQUESTS
-- ─────────────────────────────────────────────────────
CREATE TYPE dmca_status AS ENUM ('pending', 'under_review', 'actioned', 'dismissed');

CREATE TABLE dmca_requests (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  complainant_name VARCHAR(255) NOT NULL,
  complainant_email VARCHAR(255) NOT NULL,
  download_job_id  UUID REFERENCES download_jobs(id),
  pinterest_url    TEXT,
  description      TEXT NOT NULL,
  status           dmca_status NOT NULL DEFAULT 'pending',
  reviewed_by      UUID REFERENCES users(id),
  reviewed_at      TIMESTAMPTZ,
  actioned_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────
-- DAILY DOWNLOAD COUNTS (for free tier limits)
-- ─────────────────────────────────────────────────────
CREATE TABLE daily_download_counts (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date       DATE NOT NULL DEFAULT CURRENT_DATE,
  count      INT NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, date)
);

-- ─────────────────────────────────────────────────────
-- UPDATED_AT triggers
-- ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_download_jobs_updated_at BEFORE UPDATE ON download_jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_batch_jobs_updated_at BEFORE UPDATE ON batch_jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_api_keys_updated_at BEFORE UPDATE ON api_keys FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_collections_updated_at BEFORE UPDATE ON collections FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
