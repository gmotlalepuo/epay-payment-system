-- Digital Wallet & QR Payment Platform - Database Schema
-- MVP Phase 1

-- ============================================
-- 1. USERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  phone_number TEXT UNIQUE NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('super_admin', 'customer', 'merchant', 'finance_officer', 'support_officer')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended', 'blocked')),
  email_verified BOOLEAN DEFAULT FALSE,
  phone_verified BOOLEAN DEFAULT FALSE,
  two_factor_enabled BOOLEAN DEFAULT FALSE,
  password_hash TEXT NOT NULL,
  failed_login_attempts INTEGER DEFAULT 0,
  last_login_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.users FOR SELECT 
  USING (auth.uid() = id OR (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin');

CREATE POLICY "Users can update own profile" ON public.users FOR UPDATE 
  USING (auth.uid() = id);

-- ============================================
-- 2. MERCHANTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.merchants (
  id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  business_name TEXT NOT NULL,
  business_type TEXT NOT NULL,
  business_registration_number TEXT UNIQUE NOT NULL,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  country TEXT NOT NULL,
  postal_code TEXT NOT NULL,
  tax_id TEXT UNIQUE,
  bank_account_number TEXT,
  bank_name TEXT,
  bank_code TEXT,
  account_holder_name TEXT,
  settlement_frequency TEXT DEFAULT 'daily' CHECK (settlement_frequency IN ('daily', 'weekly', 'monthly')),
  is_verified BOOLEAN DEFAULT FALSE,
  verification_date TIMESTAMP WITH TIME ZONE,
  kyc_status TEXT DEFAULT 'pending' CHECK (kyc_status IN ('pending', 'verified', 'rejected')),
  kyc_rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.merchants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Merchants can view own data" ON public.merchants FOR SELECT 
  USING (auth.uid() = id OR (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin');

-- ============================================
-- 3. WALLETS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  currency TEXT DEFAULT 'USD',
  balance DECIMAL(15, 2) DEFAULT 0 CHECK (balance >= 0),
  available_balance DECIMAL(15, 2) DEFAULT 0,
  reserved_balance DECIMAL(15, 2) DEFAULT 0,
  daily_limit DECIMAL(15, 2) DEFAULT 10000,
  monthly_limit DECIMAL(15, 2) DEFAULT 100000,
  daily_spent DECIMAL(15, 2) DEFAULT 0,
  monthly_spent DECIMAL(15, 2) DEFAULT 0,
  last_reset_date DATE DEFAULT CURRENT_DATE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'frozen', 'closed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own wallet" ON public.wallets FOR SELECT 
  USING (auth.uid() = user_id OR (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin');

CREATE UNIQUE INDEX idx_wallets_user_id ON public.wallets(user_id);

-- ============================================
-- 4. WALLET TRANSACTIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('deposit', 'withdrawal', 'transfer_sent', 'transfer_received', 'payment', 'refund')),
  amount DECIMAL(15, 2) NOT NULL,
  fee DECIMAL(15, 2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'successful', 'failed', 'cancelled', 'reversed')),
  reference_number TEXT UNIQUE NOT NULL,
  description TEXT,
  balance_before DECIMAL(15, 2),
  balance_after DECIMAL(15, 2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transactions" ON public.wallet_transactions FOR SELECT 
  USING (wallet_id IN (SELECT id FROM public.wallets WHERE user_id = auth.uid()) OR 
         (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin');

-- ============================================
-- 5. TRANSFERS (P2P) TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_wallet_id UUID NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
  receiver_wallet_id UUID NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
  amount DECIMAL(15, 2) NOT NULL,
  fee DECIMAL(15, 2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'successful', 'failed', 'cancelled', 'reversed')),
  reference_number TEXT UNIQUE NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transfers" ON public.transfers FOR SELECT 
  USING (sender_wallet_id IN (SELECT id FROM public.wallets WHERE user_id = auth.uid()) OR
         receiver_wallet_id IN (SELECT id FROM public.wallets WHERE user_id = auth.uid()) OR
         (SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin');

-- ============================================
-- 6. PAYMENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payer_wallet_id UUID NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  amount DECIMAL(15, 2) NOT NULL,
  fee DECIMAL(15, 2) DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'successful', 'failed', 'cancelled', 'refunded')),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('wallet', 'stripe_card', 'bank_transfer')),
  reference_number TEXT UNIQUE NOT NULL,
  description TEXT,
  stripe_payment_intent_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 7. QR CODES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.qr_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  qr_code_type TEXT NOT NULL CHECK (qr_code_type IN ('static', 'dynamic')),
  amount DECIMAL(15, 2),
  currency TEXT DEFAULT 'USD',
  qr_data TEXT NOT NULL,
  qr_image_url TEXT,
  reference_number TEXT UNIQUE NOT NULL,
  description TEXT,
  expiry_date TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN DEFAULT TRUE,
  scans_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.qr_codes ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 8. NOTIFICATIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('payment', 'security', 'wallet', 'complaint', 'merchant', 'system')),
  type TEXT NOT NULL CHECK (type IN ('info', 'warning', 'success', 'error')),
  reference_id UUID,
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications" ON public.notifications FOR SELECT 
  USING (auth.uid() = user_id);

-- ============================================
-- 9. NOTIFICATION PREFERENCES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  payment_notifications BOOLEAN DEFAULT TRUE,
  security_notifications BOOLEAN DEFAULT TRUE,
  wallet_notifications BOOLEAN DEFAULT TRUE,
  complaint_notifications BOOLEAN DEFAULT TRUE,
  merchant_notifications BOOLEAN DEFAULT FALSE,
  email_notifications BOOLEAN DEFAULT TRUE,
  sms_notifications BOOLEAN DEFAULT FALSE,
  in_app_notifications BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 10. COMPLAINTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.complaints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number TEXT UNIQUE NOT NULL,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  merchant_id UUID REFERENCES public.merchants(id) ON DELETE SET NULL,
  category TEXT NOT NULL CHECK (category IN ('failed_transaction', 'incorrect_transfer', 'refund_request', 'unauthorized_transaction', 'qr_payment_issue', 'wallet_issue', 'merchant_dispute', 'account_access_issue', 'system_issue', 'other')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'under_review', 'in_progress', 'awaiting_customer_response', 'resolved', 'rejected', 'escalated', 'closed')),
  subject TEXT NOT NULL,
  description TEXT NOT NULL,
  transaction_id UUID REFERENCES public.wallet_transactions(id) ON DELETE SET NULL,
  assigned_to UUID REFERENCES public.users(id) ON DELETE SET NULL,
  resolution_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  sla_due_date TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own complaints" ON public.complaints FOR SELECT 
  USING (auth.uid() = user_id OR 
         auth.uid() = assigned_to OR
         (SELECT role FROM public.users WHERE id = auth.uid()) IN ('super_admin', 'support_officer'));

-- ============================================
-- 11. COMPLAINT COMMENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.complaint_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id UUID NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  comment TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.complaint_comments ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 12. COMPLAINT ATTACHMENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.complaint_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  complaint_id UUID NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  uploaded_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.complaint_attachments ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 13. AUDIT LOGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  user_agent TEXT,
  status TEXT DEFAULT 'success' CHECK (status IN ('success', 'failure')),
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can view audit logs" ON public.audit_logs FOR SELECT 
  USING ((SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin');

-- ============================================
-- 14. PAYMENT GATEWAYS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.payment_gateways (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL CHECK (name IN ('stripe', 'paypal', 'flutterwave', 'paystack')),
  is_active BOOLEAN DEFAULT FALSE,
  api_key TEXT NOT NULL,
  webhook_secret TEXT NOT NULL,
  api_version TEXT,
  test_mode BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.payment_gateways ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can view gateways" ON public.payment_gateways FOR SELECT 
  USING ((SELECT role FROM public.users WHERE id = auth.uid()) = 'super_admin');

-- ============================================
-- 15. SETTLEMENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.settlements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  settlement_date DATE NOT NULL,
  total_amount DECIMAL(15, 2) NOT NULL,
  total_fee DECIMAL(15, 2) DEFAULT 0,
  net_amount DECIMAL(15, 2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  payment_reference TEXT UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.settlements ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 16. RECONCILIATION REPORTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.reconciliation_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_date DATE NOT NULL,
  merchant_id UUID REFERENCES public.merchants(id) ON DELETE SET NULL,
  report_type TEXT NOT NULL CHECK (report_type IN ('daily', 'weekly', 'monthly')),
  total_transactions INTEGER DEFAULT 0,
  total_amount DECIMAL(15, 2) DEFAULT 0,
  matched_transactions INTEGER DEFAULT 0,
  unmatched_transactions INTEGER DEFAULT 0,
  discrepancies JSONB,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'failed')),
  verified_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  verified_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.reconciliation_reports ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 17. FAILED TRANSACTIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.failed_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID REFERENCES public.wallet_transactions(id) ON DELETE SET NULL,
  payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
  transfer_id UUID REFERENCES public.transfers(id) ON DELETE SET NULL,
  failure_reason TEXT NOT NULL,
  error_code TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  last_retry_at TIMESTAMP WITH TIME ZONE,
  next_retry_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.failed_transactions ENABLE ROW LEVEL SECURITY;

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================
CREATE INDEX idx_users_role ON public.users(role);
CREATE INDEX idx_users_status ON public.users(status);
CREATE INDEX idx_wallets_user_id_status ON public.wallets(user_id, status);
CREATE INDEX idx_wallet_transactions_wallet_id_created ON public.wallet_transactions(wallet_id, created_at DESC);
CREATE INDEX idx_transfers_sender_receiver ON public.transfers(sender_wallet_id, receiver_wallet_id);
CREATE INDEX idx_transfers_created_at ON public.transfers(created_at DESC);
CREATE INDEX idx_payments_merchant_created ON public.payments(merchant_id, created_at DESC);
CREATE INDEX idx_payments_status_created ON public.payments(status, created_at DESC);
CREATE INDEX idx_qr_codes_merchant_id ON public.qr_codes(merchant_id);
CREATE INDEX idx_notifications_user_read ON public.notifications(user_id, is_read);
CREATE INDEX idx_complaints_status_created ON public.complaints(status, created_at DESC);
CREATE INDEX idx_complaints_user_id ON public.complaints(user_id);
CREATE INDEX idx_audit_logs_user_created ON public.audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);
CREATE INDEX idx_settlements_merchant_date ON public.settlements(merchant_id, settlement_date DESC);
