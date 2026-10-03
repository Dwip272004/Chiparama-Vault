import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
);

export const ADMIN_ROLES = ['founder', 'cofounder', 'cmo', 'admin'];
export const LEADER_ROLES = ['founder', 'cofounder', 'cmo'];

export const TWOFA = {
  none: { label: 'No 2FA', short: 'None' },
  authenticator_app: { label: 'Authenticator app', short: 'Authenticator' },
  sms_otp: { label: 'SMS OTP', short: 'SMS OTP' },
  email_otp: { label: 'Email OTP', short: 'Email OTP' },
  hardware_key: { label: 'Hardware key', short: 'Hardware key' },
  backup_codes: { label: 'Backup codes', short: 'Backup codes' },
  other: { label: 'Other', short: 'Other' },
};
