// ── Core Types ────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  password_hash: string | null;
  role: 'user' | 'admin' | 'moderator';
  tier: 'free' | 'premium' | 'enterprise';
  auth_provider: 'local' | 'google' | 'facebook' | 'apple';
  provider_id: string | null;
  is_active: boolean;
  is_verified: boolean;
  mfa_enabled: boolean;
  mfa_secret: string | null;
  failed_login_attempts: number;
  locked_until: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: string;
  tier: string;
}

export interface DownloadJob {
  id: string;
  user_id: string | null;
  pinterest_url: string;
  pin_id: string | null;
  title: string | null;
  description: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  format: 'mp4' | 'webm' | 'mp3';
  quality: string;
  ai_enhancement: 'none' | 'upscale_2x' | 'upscale_4x' | 'denoise' | 'color_correct';
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'scheduled';
  progress: number;
  file_url: string | null;
  file_size_bytes: number | null;
  s3_key: string | null;
  signed_url: string | null;
  signed_url_expires: string | null;
  error_message: string | null;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  updated_at: string;
}

export interface BatchJob {
  id: string;
  user_id: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  total_count: number;
  completed_count: number;
  failed_count: number;
  zip_url: string | null;
  zip_s3_key: string | null;
  created_at: string;
  updated_at: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string;
  stripe_price_id: string;
  status: 'active' | 'canceled' | 'past_due' | 'trialing' | 'incomplete';
  tier: 'premium' | 'enterprise';
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiKey {
  id: string;
  user_id: string;
  name: string;
  key_prefix: string;
  key_hash: string;
  tier: 'free' | 'pro' | 'enterprise';
  daily_limit: number;
  monthly_limit: number;
  scopes: string[];
  last_used_at: string | null;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  resource: string | null;
  resource_id: string | null;
  details: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface DmcaRequest {
  id: string;
  complainant_name: string;
  complainant_email: string;
  download_job_id: string | null;
  pinterest_url: string | null;
  description: string;
  status: 'pending' | 'under_review' | 'actioned' | 'dismissed';
  reviewed_by: string | null;
  reviewed_at: string | null;
  actioned_at: string | null;
  created_at: string;
}

export interface Collection {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

// ── Request augmentation ──────────────────────────────
declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}
