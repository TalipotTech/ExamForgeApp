# Feature: Auth System, Payments & Admin User Management

> **Priority:** P0 — Must ship before anything else in MVP
> **Branch:** `feat/auth-payments-admin`
> **Integrates with:** MVP_SCOPE.md (replaces basic auth)
> **Current state:** NextAuth v5 with credentials provider exists.
> This prompt REPLACES it with a full production auth system.

---

## 1. What We're Building

```
┌─────────────────────────────────────────────────────────┐
│  SIGNUP / LOGIN                                          │
│                                                          │
│  ┌─────────────────┐  ┌──────────────────────┐          │
│  │ Email + Password │  │ Google OAuth          │          │
│  │ Phone + Password │  │ (one-click signup)    │          │
│  │ Username + Pass  │  │                       │          │
│  └────────┬────────┘  └──────────┬────────────┘          │
│           │                      │                       │
│           ▼                      ▼                       │
│  ┌─────────────────┐  ┌──────────────────────┐          │
│  │ OTP Verification │  │ Google verified email │          │
│  │ ✉ Email OTP (now)│  │ (auto-verified)      │          │
│  │ 📱 SMS OTP (later│  │                       │          │
│  └────────┬────────┘  └──────────┬────────────┘          │
│           │                      │                       │
│           ▼                      ▼                       │
│  ┌─────────────────────────────────────────────┐        │
│  │ VERIFIED USER → Onboarding → Dashboard       │        │
│  │ Auto-assigned: Free plan + 50 credits        │        │
│  └─────────────────────────────────────────────┘        │
│                                                          │
│  ┌─────────────────────────────────────────────┐        │
│  │ SUBSCRIPTION (Razorpay)                      │        │
│  │ Built now. Admin toggles on when ready.      │        │
│  │ Upgrade Free → Pro (₹299) → Premium (₹799)  │        │
│  └─────────────────────────────────────────────┘        │
│                                                          │
│  ┌─────────────────────────────────────────────┐        │
│  │ ADMIN DASHBOARD                              │        │
│  │ • Feature toggles (enable/disable auth/pay)  │        │
│  │ • Full user management (CRUD + roles + subs) │        │
│  │ • SMS provider config (MSG91/Twilio)         │        │
│  │ • Payment gateway config                     │        │
│  └─────────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────┘
```

---

## 2. Database Schema

### 2.1 Alter `users` Table

Add to existing `packages/shared/src/db/schema/users.ts`:

```
username            varchar(50)   UNIQUE nullable    — alphanumeric + underscore, 3-30 chars
phone               varchar(20)   UNIQUE nullable    — with country code: +919876543210
                    (phone column may already exist — ensure UNIQUE constraint)
emailVerified       timestamp     nullable           — when email was verified
phoneVerified       timestamp     nullable           — when phone was verified
authProvider        varchar(20)   default 'credentials'
                    — credentials | google | (future: facebook, apple)
googleId            varchar(100)  UNIQUE nullable    — Google OAuth sub ID
avatarUrl           varchar(1000) nullable           — from Google or uploaded
isActive            boolean       default true       — admin can deactivate
isBanned            boolean       default false      — hard ban
banReason           text          nullable
lastLoginAt         timestamp     nullable
lastLoginIp         varchar(45)   nullable           — IPv4 or IPv6
loginCount          integer       default 0
signupSource        varchar(50)   nullable           — 'web', 'mobile', 'referral'
referredBy          uuid          nullable FK → users.id
metadata            jsonb         default '{}'       — extensible user data
```

### 2.2 New Table: `otp_verifications`

```sql
CREATE TABLE otp_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),         -- nullable (pre-registration OTP)
  identifier VARCHAR(255) NOT NULL,          -- email or phone number
  identifier_type VARCHAR(10) NOT NULL,      -- 'email' | 'phone'
  otp_code VARCHAR(10) NOT NULL,             -- 6-digit code, hashed
  purpose VARCHAR(30) NOT NULL,
    -- signup | login | reset_password | verify_email | verify_phone | change_email | change_phone
  attempts INTEGER DEFAULT 0,               -- failed verification attempts
  max_attempts INTEGER DEFAULT 5,
  is_used BOOLEAN DEFAULT false,
  expires_at TIMESTAMPTZ NOT NULL,           -- OTP expiry (10 min default)
  verified_at TIMESTAMPTZ,
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_otp_identifier ON otp_verifications(identifier, purpose)
  WHERE is_used = false;
CREATE INDEX idx_otp_expiry ON otp_verifications(expires_at)
  WHERE is_used = false;
```

### 2.3 New Table: `auth_sessions` (Extended Session Tracking)

```sql
CREATE TABLE auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_token VARCHAR(255) NOT NULL UNIQUE,
  device_info JSONB DEFAULT '{}',
    -- { browser, os, device, ip, location }
  is_active BOOLEAN DEFAULT true,
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_auth_sessions_user ON auth_sessions(user_id);
CREATE INDEX idx_auth_sessions_token ON auth_sessions(session_token)
  WHERE is_active = true;
```

### 2.4 New Table: `admin_feature_flags`

```sql
CREATE TABLE admin_feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(100) NOT NULL UNIQUE,
  value JSONB NOT NULL,                     -- true/false or complex config
  description TEXT,
  category VARCHAR(50) NOT NULL,            -- 'auth' | 'payment' | 'sms' | 'feature' | 'ui'
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Seed with:

```typescript
const DEFAULT_FLAGS = [
  // Auth
  {
    key: "auth.signup_enabled",
    value: true,
    category: "auth",
    description: "Allow new user registrations",
  },
  {
    key: "auth.google_oauth_enabled",
    value: true,
    category: "auth",
    description: "Allow Google OAuth signup/login",
  },
  {
    key: "auth.email_password_enabled",
    value: true,
    category: "auth",
    description: "Allow email + password signup/login",
  },
  {
    key: "auth.phone_password_enabled",
    value: false,
    category: "auth",
    description: "Allow phone + password signup/login",
  },
  {
    key: "auth.username_login_enabled",
    value: true,
    category: "auth",
    description: "Allow login with username",
  },
  {
    key: "auth.email_otp_verification",
    value: true,
    category: "auth",
    description: "Require email OTP on signup",
  },
  {
    key: "auth.sms_otp_verification",
    value: false,
    category: "auth",
    description: "Require SMS OTP on signup (needs SMS provider)",
  },
  {
    key: "auth.require_verification",
    value: true,
    category: "auth",
    description: "Users must verify email/phone before full access",
  },

  // SMS
  {
    key: "sms.provider",
    value: "none",
    category: "sms",
    description: "SMS provider: none | msg91 | twilio",
  },
  {
    key: "sms.msg91_auth_key",
    value: "",
    category: "sms",
    description: "MSG91 authentication key",
  },
  {
    key: "sms.msg91_sender_id",
    value: "EXMFRG",
    category: "sms",
    description: "MSG91 sender ID (6 chars)",
  },
  {
    key: "sms.msg91_template_id",
    value: "",
    category: "sms",
    description: "MSG91 OTP template ID",
  },
  { key: "sms.twilio_account_sid", value: "", category: "sms", description: "Twilio Account SID" },
  { key: "sms.twilio_auth_token", value: "", category: "sms", description: "Twilio Auth Token" },
  {
    key: "sms.twilio_phone_number",
    value: "",
    category: "sms",
    description: "Twilio sender phone number",
  },

  // Payment
  {
    key: "payment.enabled",
    value: false,
    category: "payment",
    description: "Enable payment processing",
  },
  {
    key: "payment.provider",
    value: "razorpay",
    category: "payment",
    description: "Payment gateway: razorpay | stripe",
  },
  {
    key: "payment.razorpay_key_id",
    value: "",
    category: "payment",
    description: "Razorpay Key ID",
  },
  {
    key: "payment.razorpay_key_secret",
    value: "",
    category: "payment",
    description: "Razorpay Key Secret (encrypted)",
  },
  {
    key: "payment.razorpay_webhook_secret",
    value: "",
    category: "payment",
    description: "Razorpay Webhook Secret",
  },
  {
    key: "payment.test_mode",
    value: true,
    category: "payment",
    description: "Use test/sandbox credentials",
  },

  // Features
  {
    key: "feature.free_credits_on_signup",
    value: 50,
    category: "feature",
    description: "Credits given to new users",
  },
  {
    key: "feature.referral_bonus_credits",
    value: 10,
    category: "feature",
    description: "Credits for referrer when referee signs up",
  },
  {
    key: "feature.maintenance_mode",
    value: false,
    category: "feature",
    description: "Show maintenance page to non-admins",
  },
];
```

### 2.5 New Table: `payment_orders`

```sql
CREATE TABLE payment_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  order_type VARCHAR(30) NOT NULL,
    -- subscription | credits_topup | marketplace_purchase (future)
  amount_inr INTEGER NOT NULL,              -- paisa
  currency VARCHAR(3) DEFAULT 'INR',
  status VARCHAR(20) NOT NULL DEFAULT 'created',
    -- created | authorized | captured | failed | refunded
  -- Razorpay fields
  razorpay_order_id VARCHAR(100) UNIQUE,
  razorpay_payment_id VARCHAR(100),
  razorpay_signature VARCHAR(255),
  -- Subscription linkage
  plan_id UUID REFERENCES subscription_plans(id),
  billing_cycle VARCHAR(10),                -- monthly | yearly
  -- Meta
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payment_orders_user ON payment_orders(user_id);
CREATE INDEX idx_payment_orders_razorpay ON payment_orders(razorpay_order_id);
```

### 2.6 New Table: `admin_audit_log`

```sql
CREATE TABLE admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES users(id),
  action VARCHAR(100) NOT NULL,
    -- user.create | user.update | user.ban | user.unban | user.delete
    -- | user.change_role | user.change_plan | user.reset_password
    -- | user.add_credits | user.revoke_credits
    -- | flag.update | payment.refund
  target_type VARCHAR(50),                  -- 'user' | 'flag' | 'payment'
  target_id UUID,
  details JSONB DEFAULT '{}',
    -- { before: {...}, after: {...}, reason: "..." }
  ip_address VARCHAR(45),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_admin ON admin_audit_log(admin_id);
CREATE INDEX idx_audit_target ON admin_audit_log(target_type, target_id);
```

---

## 3. Auth Implementation

### 3.1 Registration Flow

```
POST /api/auth/register
Body: {
  method: 'email' | 'phone' | 'username_email',
  email?: string,
  phone?: string,      // +91XXXXXXXXXX
  username?: string,    // 3-30 chars, alphanumeric + underscore
  password: string,     // min 8 chars, 1 upper, 1 lower, 1 number
  name: string,
}

Steps:
1. Validate input (Zod)
2. Check feature flag: auth.signup_enabled
3. Check feature flag: auth.email_password_enabled (or phone variant)
4. Check uniqueness: email, phone, username (whichever provided)
5. Hash password with bcrypt (12 rounds)
6. Create user record (emailVerified=null, phoneVerified=null)
7. Create user_subscription (free plan)
8. Create user_credits (feature.free_credits_on_signup credits)
9. If auth.email_otp_verification enabled:
   a. Generate 6-digit OTP
   b. Hash OTP, store in otp_verifications (expires: 10 min)
   c. Send OTP email (Resend / Nodemailer / AWS SES)
   d. Return { requiresVerification: true, verificationType: 'email' }
10. If auth.sms_otp_verification enabled AND phone provided:
    a. Generate 6-digit OTP
    b. Store in otp_verifications
    c. Send via SMS provider (MSG91 / Twilio, based on sms.provider flag)
    d. Return { requiresVerification: true, verificationType: 'phone' }
11. If no verification required:
    Return { success: true, redirect: '/onboarding' }
```

### 3.2 OTP Verification Flow

```
POST /api/auth/verify-otp
Body: { identifier, otp, purpose }

Steps:
1. Find otp_verifications WHERE identifier + purpose + is_used=false + expires_at > now()
2. If not found: error "Invalid or expired OTP"
3. If attempts >= max_attempts: error "Too many attempts. Request new OTP."
4. Compare OTP (bcrypt compare against stored hash)
5. If wrong: increment attempts, return error
6. If correct:
   a. Mark OTP as used (is_used=true, verified_at=now)
   b. Update user: emailVerified=now (or phoneVerified)
   c. Create session
   d. Return { success: true, redirect: '/onboarding' }
```

### 3.3 Resend OTP

```
POST /api/auth/resend-otp
Body: { identifier, identifierType, purpose }

Rate limit: max 3 resends per identifier per hour.
Generate new OTP, invalidate old ones, send.
```

### 3.4 Google OAuth Flow

```
NextAuth Google Provider:
1. User clicks "Continue with Google"
2. Redirects to Google consent screen
3. On callback:
   a. Check if user exists with this googleId
   b. If exists: login, update lastLoginAt
   c. If not exists:
      - Check auth.google_oauth_enabled flag
      - Create user with: email (from Google), name, avatarUrl, googleId
      - emailVerified = now (Google verifies email)
      - authProvider = 'google'
      - Create subscription + credits
      - Redirect to /onboarding (first time) or /dashboard (returning)
```

### 3.5 Login Flow

```
POST /api/auth/login
Body: {
  identifier: string,   // email, phone (+91...), or username
  password: string,
}

Steps:
1. Detect identifier type:
   - Contains '@' → email
   - Starts with '+' or all digits → phone (check auth.phone_password_enabled)
   - Otherwise → username (check auth.username_login_enabled)
2. Find user by identifier
3. If not found: error "Invalid credentials" (don't reveal which field)
4. If user.isBanned: error "Account suspended. Contact support."
5. If !user.isActive: error "Account deactivated."
6. Compare password (bcrypt)
7. If wrong: error "Invalid credentials"
8. If auth.require_verification AND user.emailVerified is null AND user.phoneVerified is null:
   error "Please verify your email first." + option to resend OTP
9. Update: lastLoginAt, lastLoginIp, loginCount++
10. Create session + auth_sessions record
11. Return session token
```

### 3.6 Password Reset

```
POST /api/auth/forgot-password
Body: { email }
→ Generate OTP, send to email, store in otp_verifications (purpose: reset_password)

POST /api/auth/reset-password
Body: { email, otp, newPassword }
→ Verify OTP, hash new password, update user, invalidate all sessions
```

---

## 4. Payment Integration (Razorpay)

### 4.1 Subscription Purchase Flow

```
User clicks "Upgrade to Pro" on pricing page
    │
    ▼
Frontend: check payment.enabled flag
    │ If disabled: show "Coming soon" message
    │ If enabled: proceed
    │
    ▼
POST /api/payment/create-subscription
Body: { planName: 'pro', billingCycle: 'monthly' }
    │
    ▼
Server:
  1. Look up plan from subscription_plans
  2. Create Razorpay subscription:
     razorpay.subscriptions.create({
       plan_id: plan.razorpayPlanId,
       customer_notify: 1,
       total_count: billingCycle === 'yearly' ? 1 : 12,
     })
  3. Create payment_orders record
  4. Return { subscriptionId, razorpayKeyId }
    │
    ▼
Frontend: Open Razorpay checkout modal
  var options = {
    key: razorpayKeyId,
    subscription_id: subscriptionId,
    name: "ExamForge",
    description: "Pro Plan - Monthly",
    handler: function(response) {
      // POST /api/payment/verify
    }
  }
  var rzp = new Razorpay(options);
  rzp.open();
    │
    ▼
POST /api/payment/verify
Body: { razorpay_payment_id, razorpay_subscription_id, razorpay_signature }
    │
    ▼
Server:
  1. Verify signature: HMAC SHA256(order_id + "|" + payment_id, secret)
  2. Update payment_orders: status='captured'
  3. Update/create user_subscriptions: planId=pro, status='active'
  4. Update user_credits: creditsTotal = plan.creditsPerMonth
  5. Return { success: true }
```

### 4.2 Razorpay Webhook Handler

```
POST /api/payment/webhook
Headers: x-razorpay-signature

Events to handle:
- subscription.activated → set user_subscriptions.status = 'active'
- subscription.charged → renew credits for new period
- subscription.pending → set status = 'past_due', send warning email
- subscription.halted → set status = 'expired', downgrade to free
- subscription.cancelled → set cancelAtPeriodEnd = true
- payment.failed → log, send retry notification
- refund.created → handle refund
```

### 4.3 Pre-create Razorpay Plans

Razorpay requires plans to be created in their dashboard (or via API).
Create a setup script:

```typescript
// scripts/setup-razorpay-plans.ts
const plans = [
  { name: "ExamForge Pro Monthly", amount: 29900, currency: "INR", period: "monthly", interval: 1 },
  { name: "ExamForge Pro Yearly", amount: 249900, currency: "INR", period: "yearly", interval: 1 },
  {
    name: "ExamForge Premium Monthly",
    amount: 79900,
    currency: "INR",
    period: "monthly",
    interval: 1,
  },
  {
    name: "ExamForge Premium Yearly",
    amount: 699900,
    currency: "INR",
    period: "yearly",
    interval: 1,
  },
];
// Creates plans via Razorpay API, stores plan IDs in subscription_plans table
```

---

## 5. Admin Dashboard — Feature Flags & User Management

### 5.1 Feature Flags Page (`/admin/settings`)

```
┌─────────────────────────────────────────────────────┐
│  Platform Settings                                   │
│                                                      │
│  AUTHENTICATION                                      │
│  ──────────────────────────────────────              │
│  ☑ Allow new registrations          [enabled]        │
│  ☑ Google OAuth                      [enabled]        │
│  ☑ Email + Password                  [enabled]        │
│  ☐ Phone + Password                  [disabled]       │
│  ☑ Username login                    [enabled]        │
│  ☑ Require email verification        [enabled]        │
│  ☐ Require SMS verification          [disabled]       │
│                                                      │
│  SMS PROVIDER                                        │
│  ──────────────────────────────────────              │
│  Provider: [None ▾]  (None | MSG91 | Twilio)        │
│  ┌ MSG91 Config (shown when MSG91 selected) ──┐     │
│  │ Auth Key: [•••••••••]                       │     │
│  │ Sender ID: [EXMFRG]                         │     │
│  │ Template ID: [•••••••]                      │     │
│  │ [Test SMS →] send test to admin phone       │     │
│  └─────────────────────────────────────────────┘     │
│                                                      │
│  PAYMENTS                                            │
│  ──────────────────────────────────────              │
│  ☐ Enable payment processing         [disabled]      │
│  Provider: [Razorpay ▾]                              │
│  ☑ Test/Sandbox mode                 [enabled]        │
│  ┌ Razorpay Config ────────────────────────────┐     │
│  │ Key ID: [rzp_test_•••••]                    │     │
│  │ Key Secret: [•••••••••]                     │     │
│  │ Webhook Secret: [•••••••]                   │     │
│  │ [Test Connection →]                         │     │
│  └─────────────────────────────────────────────┘     │
│                                                      │
│  CONTENT                                             │
│  ──────────────────────────────────────              │
│  Free credits on signup: [50]                        │
│  Referral bonus credits: [10]                        │
│  ☐ Maintenance mode                  [disabled]      │
│                                                      │
│  [Save All Settings]                                 │
└─────────────────────────────────────────────────────┘
```

### 5.2 User Management Page (`/admin/users`)

```
┌─────────────────────────────────────────────────────┐
│  User Management                    [+ Create User]  │
│                                                      │
│  ┌─ Search ──────────────────────────────────────┐  │
│  │ 🔍 Search by name, email, phone, username...   │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  Filters: [All Roles ▾] [All Plans ▾] [All Status ▾]│
│  Showing 1-20 of 1,247 users                        │
│                                                      │
│  ┌─ USER TABLE ───────────────────────────────────┐ │
│  │ Name/Email  │ Role   │ Plan  │Status│Credits│Act│ │
│  │─────────────│────────│───────│──────│───────│───│ │
│  │ Sameesh K   │ admin  │ -     │ ✓   │ -     │ ⋯│ │
│  │ sameesh@... │        │       │      │       │   │ │
│  │─────────────│────────│───────│──────│───────│───│ │
│  │ Priya M     │ student│ Pro   │ ✓   │ 380   │ ⋯│ │
│  │ priya@...   │        │ ₹299  │      │ /500  │   │ │
│  │─────────────│────────│───────│──────│───────│───│ │
│  │ Rahul S     │ student│ Free  │ ⚠   │ 3    │ ⋯│ │
│  │ +91987...   │        │       │unver.│ /50   │   │ │
│  └─────────────────────────────────────────────────┘ │
│                                                      │
│  ⋯ Actions dropdown per user:                        │
│  • View Profile                                      │
│  • Edit Details                                      │
│  • Change Role (student/teacher/admin/superadmin)    │
│  • Change Plan (free/pro/premium)                    │
│  • Add Credits / Set Credits                         │
│  • Reset Password                                    │
│  • Verify Email/Phone manually                       │
│  • Deactivate / Reactivate                           │
│  • Ban / Unban (with reason)                         │
│  • View Login History                                │
│  • View Activity Log                                 │
│  • Impersonate (login as this user)                  │
│  • Delete Account                                    │
└─────────────────────────────────────────────────────┘
```

### 5.3 User Detail Modal/Page (`/admin/users/[id]`)

```
┌─────────────────────────────────────────────────────┐
│  Priya Menon                              [Actions ▾]│
│  priya.menon@gmail.com • +919876543210               │
│  @priya_menon                                        │
│                                                      │
│  ACCOUNT                    │  SUBSCRIPTION           │
│  ─────────                  │  ──────────             │
│  Role: student              │  Plan: Pro (₹299/mo)   │
│  Status: Active ✓           │  Since: Jan 15, 2026   │
│  Email: Verified ✓          │  Renews: Apr 15, 2026  │
│  Phone: Not verified ⚠      │  Credits: 380/500      │
│  Auth: credentials          │  [Change Plan] [Add ₹] │
│  Joined: Dec 10, 2025       │                         │
│  Last login: 2 hours ago    │                         │
│  Total logins: 147          │                         │
│                                                      │
│  EXAMS PREPARING            │  ACTIVITY               │
│  ─────────────              │  ────────               │
│  🎯 BPharm Asst Prof       │  Qs attempted: 842     │
│  💊 GPAT 2026               │  Mock exams: 15        │
│  🏥 NEET UG                 │  AI questions: 67      │
│                             │  Avg score: 74%        │
│                             │  Streak: 12 days       │
│                                                      │
│  LOGIN HISTORY (last 10)                             │
│  ──────────────────────────────────────              │
│  Mar 13, 2026 14:22 • Chrome/Mac • 49.36.xx.xx      │
│  Mar 12, 2026 09:15 • Chrome/Mac • 49.36.xx.xx      │
│  Mar 11, 2026 20:45 • Mobile Safari • 103.xx.xx.xx  │
│                                                      │
│  ADMIN ACTIONS LOG                                   │
│  ──────────────────────────────────────              │
│  Admin changed plan Free → Pro (Jan 15, by Sameesh)  │
│  Admin verified email manually (Dec 10, by Sameesh)  │
└─────────────────────────────────────────────────────┘
```

---

## 6. File Locations

| What                  | Where                                                                                                           |
| --------------------- | --------------------------------------------------------------------------------------------------------------- |
| User schema changes   | `packages/shared/src/db/schema/users.ts`                                                                        |
| New schemas           | `otp-verifications.ts`, `auth-sessions.ts`, `admin-feature-flags.ts`, `payment-orders.ts`, `admin-audit-log.ts` |
| Auth validators       | `packages/shared/src/validators/auth.ts`                                                                        |
| NextAuth config       | `apps/web/src/auth.ts` (update existing)                                                                        |
| Auth API routes       | `apps/api/src/routers/auth.ts`                                                                                  |
| OTP service           | `apps/api/src/services/otp-service.ts`                                                                          |
| SMS service           | `apps/api/src/services/sms-service.ts`                                                                          |
| Email service         | `apps/api/src/services/email-service.ts`                                                                        |
| Payment service       | `apps/api/src/services/payment-service.ts`                                                                      |
| Feature flag service  | `apps/api/src/services/feature-flags.ts`                                                                        |
| Payment router        | `apps/api/src/routers/payment.ts`                                                                               |
| Admin user router     | `apps/api/src/routers/admin-users.ts`                                                                           |
| Admin settings router | `apps/api/src/routers/admin-settings.ts`                                                                        |
| Razorpay webhook      | `apps/web/src/app/api/payment/webhook/route.ts` (Next.js API route)                                             |
| Signup page           | `apps/web/src/app/(auth)/signup/page.tsx`                                                                       |
| Login page            | `apps/web/src/app/(auth)/login/page.tsx`                                                                        |
| Verify OTP page       | `apps/web/src/app/(auth)/verify/page.tsx`                                                                       |
| Forgot password       | `apps/web/src/app/(auth)/forgot-password/page.tsx`                                                              |
| Admin settings        | `apps/web/src/app/(dashboard)/admin/settings/page.tsx`                                                          |
| Admin users           | `apps/web/src/app/(dashboard)/admin/users/page.tsx`                                                             |
| Admin user detail     | `apps/web/src/app/(dashboard)/admin/users/[id]/page.tsx`                                                        |

---

## 7. Claude Code Implementation Prompt

> **Execute in order. Each step = one commit.**

### STEP 1: Database schema

`commit: feat: add auth, payments, feature flags, and audit log tables`

1A. Alter `users` table: add all columns from section 2.1.
1B. Create `otp_verifications` table (section 2.2).
1C. Create `auth_sessions` table (section 2.3).
1D. Create `admin_feature_flags` table (section 2.4).
1E. Create `payment_orders` table (section 2.5).
1F. Create `admin_audit_log` table (section 2.6).
1G. Create validators in `packages/shared/src/validators/auth.ts`:

- `RegisterSchema`: validates all 3 registration methods
- `LoginSchema`: identifier (email/phone/username) + password
- `VerifyOtpSchema`: identifier + otp + purpose
- `ResetPasswordSchema`, `ForgotPasswordSchema`
- `UpdateUserAdminSchema`: admin editing user fields
  1H. Export, generate migration, run migration.
  1I. Update seed: add feature flags (all from section 2.4 seed), update admin user
  with new columns, create test student user with all new fields populated.

### STEP 2: Core services

`commit: feat: add OTP, email, SMS, feature flag, and payment services`

2A. **Feature flag service** (`apps/api/src/services/feature-flags.ts`):

```typescript
export async function getFlag(key: string): Promise<any>;
export async function setFlag(key: string, value: any, adminId: string): Promise<void>;
export async function getAllFlags(): Promise<Record<string, any>>;
export async function getFlagsByCategory(category: string): Promise<FeatureFlag[]>;
```

Cache flags in Redis (TTL: 5 min). Bust cache on setFlag.

2B. **OTP service** (`apps/api/src/services/otp-service.ts`):

```typescript
export async function generateOtp(params: {
  identifier: string;
  identifierType: "email" | "phone";
  purpose: string;
  userId?: string;
  ip?: string;
}): Promise<{ otpId: string; expiresAt: Date }>;

export async function verifyOtp(params: {
  identifier: string;
  otp: string;
  purpose: string;
}): Promise<{ success: boolean; userId?: string; error?: string }>;

export async function resendOtp(params: {
  identifier: string;
  identifierType: string;
  purpose: string;
}): Promise<{ success: boolean; cooldownSeconds?: number }>;
```

OTP is 6 digits. Hash with bcrypt before storing. Expires in 10 min.
Rate limit: max 3 OTPs per identifier per hour.

2C. **Email service** (`apps/api/src/services/email-service.ts`):

```typescript
export async function sendOtpEmail(email: string, otp: string, purpose: string): Promise<void>;
export async function sendWelcomeEmail(email: string, name: string): Promise<void>;
export async function sendPasswordResetEmail(email: string, otp: string): Promise<void>;
```

Use Resend (`resend` npm package) for now. Easy to swap later.
Template the emails with basic HTML (OTP prominent, ExamForge branding).
Check feature flag before sending: if email OTP disabled, skip.

2D. **SMS service** (`apps/api/src/services/sms-service.ts`):

```typescript
export async function sendOtpSms(phone: string, otp: string): Promise<void>;
```

Check `sms.provider` flag:

- If 'none': log OTP to console (development), don't send
- If 'msg91': call MSG91 API
- If 'twilio': call Twilio API

MSG91 implementation:

```typescript
await fetch("https://control.msg91.com/api/v5/otp", {
  method: "POST",
  headers: { authkey: msg91AuthKey },
  body: JSON.stringify({ mobile: phone, otp, sender: senderId, template_id: templateId }),
});
```

Twilio implementation:

```typescript
const client = twilio(accountSid, authToken);
await client.messages.create({
  body: `Your ExamForge OTP is: ${otp}`,
  from: twilioPhone,
  to: phone,
});
```

2E. **Payment service** (`apps/api/src/services/payment-service.ts`):

```typescript
export async function createSubscription(
  userId: string,
  planName: string,
  billingCycle: string,
): Promise<RazorpaySubscription>;
export async function verifyPayment(params: {
  razorpay_payment_id;
  razorpay_subscription_id;
  razorpay_signature;
}): Promise<boolean>;
export async function cancelSubscription(userId: string): Promise<void>;
export async function handleWebhook(event: string, payload: any): Promise<void>;
```

Check `payment.enabled` flag before any operation. If disabled, throw error
with message "Payments are not enabled yet."

Install: `pnpm add razorpay resend`
Install (optional, for SMS): `pnpm add twilio`

### STEP 3: Auth router + registration/login/OTP endpoints

`commit: feat: add complete auth flow with registration, login, OTP verification`

Create `apps/api/src/routers/auth.ts`:

**Public endpoints:**

- `register` — full flow from section 3.1. Check feature flags at every step.
- `login` — flow from section 3.5. Detect identifier type automatically.
- `verifyOtp` — flow from section 3.2.
- `resendOtp` — rate-limited resend.
- `forgotPassword` — generate OTP, send email.
- `resetPassword` — verify OTP, set new password, invalidate sessions.
- `googleCallback` — handle Google OAuth result (or integrate via NextAuth).

Update `apps/web/src/auth.ts` (NextAuth config):

- Add Google provider (check flag before allowing)
- Update Credentials provider to use the new login logic
- Add session callback to include user role, plan, credits in session
- Add signIn callback: update lastLoginAt, create auth_sessions record

### STEP 4: Payment router + Razorpay webhook

`commit: feat: add Razorpay payment integration with subscription management`

Create `apps/api/src/routers/payment.ts`:

- `createSubscription` — creates Razorpay subscription, returns checkout data.
  Check `payment.enabled` flag. If disabled: return `{ enabled: false, message: "..." }`.
- `verifyPayment` — verifies signature, activates subscription, grants credits.
- `getCurrentSubscription` — returns user's active subscription + plan details.
- `cancelSubscription` — sets cancelAtPeriodEnd=true via Razorpay API.
- `getPaymentHistory` — list user's payment_orders.
- `getPlans` — public: returns active subscription_plans with Razorpay plan IDs.

Create webhook handler:
`apps/web/src/app/api/payment/webhook/route.ts` (Next.js API route):

- Verify Razorpay webhook signature
- Route to payment service handleWebhook
- Handle all events from section 4.2

### STEP 5: Admin routers — user management + feature flags

`commit: feat: add admin user management and platform settings`

Create `apps/api/src/routers/admin-users.ts` (all adminProcedure):

- `list` — paginated user list with filters:
  - search (name, email, phone, username)
  - role filter, plan filter, status filter (active/inactive/banned/unverified)
  - sort: joined date, last login, name, credits
- `getById` — full user detail: profile + subscription + credits + exams + progress + login history + admin audit log
- `create` — admin creates a user (with any role, pre-verified)
- `update` — edit name, email, phone, username, role
- `changeRole` — change user role + audit log
- `changePlan` — change subscription plan + adjust credits + audit log
- `addCredits` — add bonus credits to user + audit log
- `setCredits` — override credit count + audit log
- `resetPassword` — generate temp password, email to user + audit log
- `verifyManually` — set emailVerified/phoneVerified + audit log
- `deactivate` / `reactivate` — toggle isActive + audit log
- `ban` / `unban` — toggle isBanned, require reason + audit log
- `getLoginHistory` — auth_sessions for user
- `getAuditLog` — admin_audit_log for user
- `deleteUser` — soft delete (deactivate + anonymize PII) + audit log
- `impersonate` — generate a temporary session token for admin to login as user
  (with audit log). The session is flagged as impersonated.

Create `apps/api/src/routers/admin-settings.ts` (superadmin only):

- `getFlags` — all feature flags grouped by category
- `updateFlag` — update a single flag value + audit log
- `updateFlags` — bulk update multiple flags + audit log
- `testSms` — send test SMS to admin's phone using current SMS config
- `testPayment` — create a ₹1 test order on Razorpay and verify connection

Every admin action creates an `admin_audit_log` entry.

### STEP 6: Auth pages (Signup, Login, Verify, Forgot Password)

`commit: feat: add signup, login, OTP verification, and password reset pages`

Create `apps/web/src/app/(auth)/layout.tsx`:

- Centered card layout, ExamForge branding, background gradient
- No sidebar (auth pages are standalone)

Create `apps/web/src/app/(auth)/signup/page.tsx`:

- **Tab selector**: "Email" | "Phone" | "Username + Email"
- **Email tab**: Name, Email, Password, Confirm Password
- **Phone tab**: Name, Phone (with +91 prefix), Password, Confirm Password
- **Username tab**: Name, Username, Email, Password, Confirm Password
- **Divider**: "— or —"
- **Google button**: "Continue with Google" (if flag enabled)
- **Submit**: calls auth.register mutation
- **After submit**: redirect to /verify if OTP required
- **Bottom**: "Already have an account? Login"
- **Validation**: real-time Zod validation, show errors inline
- If `auth.signup_enabled` is false: show "Registration is currently closed"

Create `apps/web/src/app/(auth)/login/page.tsx`:

- **Single input**: "Email, phone number, or username"
  Auto-detect type as user types (show icon: ✉ for email, 📱 for phone, 👤 for username)
- **Password** field with show/hide toggle
- **"Forgot password?"** link
- **Submit**: calls auth.login
- **Google button** (if flag enabled)
- **Bottom**: "Don't have an account? Sign up"

Create `apps/web/src/app/(auth)/verify/page.tsx`:

- "Enter the 6-digit code sent to {email/phone}"
- **6 individual digit inputs** (auto-focus next on input)
- **Countdown timer**: "Resend code in 0:45"
- **"Resend Code"** button (enabled after countdown)
- **"Change email/phone"** link (goes back to signup)
- On success: redirect to /onboarding (new) or /dashboard (returning)

Create `apps/web/src/app/(auth)/forgot-password/page.tsx`:

- **Email input** + Submit
- After submit: show OTP entry + new password fields
- On success: redirect to /login with "Password reset successfully" toast

Use shadcn/ui: Card, Input, Button, Tabs, InputOTP (from shadcn).

### STEP 7: Admin settings page

`commit: feat: add admin platform settings page with feature toggles`

Create `apps/web/src/app/(dashboard)/admin/settings/page.tsx`:

Layout from section 5.1. Grouped by category: Auth, SMS, Payments, Content.
Each toggle is a Switch component bound to the flag value.
Text/secret inputs for API keys (type=password for secrets).
"Test SMS" and "Test Payment" buttons call the respective admin-settings endpoints.
"Save All" button calls updateFlags with all changed values.
Toast on save success.

Superadmin only: check role in middleware + show "Access denied" for non-superadmins.

### STEP 8: Admin user management page

`commit: feat: add admin user management with full CRUD`

Create `apps/web/src/app/(dashboard)/admin/users/page.tsx`:

- Search bar + filter dropdowns (role, plan, status) + sort
- Table with columns: User (name+email), Role badge, Plan badge, Status, Credits bar, Actions dropdown
- Actions dropdown: all items from section 5.2
- Clicking user name → opens detail page/modal

Create `apps/web/src/app/(dashboard)/admin/users/[id]/page.tsx`:

- Full detail view from section 5.3
- Editable fields (inline or form)
- Action buttons: Change Role, Change Plan, Add Credits, Ban, etc.
- Login history table
- Admin audit log table
- Confirmation modals for destructive actions (ban, delete)

Use shadcn/ui: Table, DropdownMenu, Dialog (for confirmations), Badge,
Avatar, Switch, Tabs (for detail sections).

### STEP 9: Post-implementation

`commit: chore: update docs for auth, payments, and admin features`

1. `pnpm lint:fix && pnpm type-check && pnpm build`
2. Update CLAUDE.md: auth flow, payment integration, admin feature flags
3. Update BACKLOG.md
4. Test flows:
   - Signup with email → OTP → verify → onboarding → dashboard
   - Login with email / username
   - Google OAuth signup + login
   - Forgot password → OTP → reset
   - Admin: toggle feature flags → verify they take effect
   - Admin: create user, change role, change plan, add credits, ban/unban
   - Admin: view user detail, login history, audit log
   - Payment: (if enabled) create subscription → Razorpay checkout → verify
5. Ensure admin retains full access when flags are toggled
6. Verify: SMS OTP path exists but is disabled by default (no errors, just skipped)
7. Verify: Payment path exists but is disabled by default (returns "coming soon")

---

## 8. Dependencies to Install

```bash
# In apps/api
pnpm add razorpay resend bcryptjs
pnpm add -D @types/bcryptjs

# Optional (for SMS - install when enabling)
pnpm add twilio    # or
pnpm add msg91-sdk # (if available, otherwise use fetch)

# In apps/web (for Razorpay frontend)
# Razorpay checkout.js is loaded via script tag, no npm package needed
```

---

## 9. Environment Variables to Add

```bash
# Add to .env.example and .env.local

# Email (Resend)
RESEND_API_KEY=re_xxxxx
EMAIL_FROM=ExamForge <noreply@examforge.in>

# Google OAuth
GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxx

# Razorpay (use test keys initially)
RAZORPAY_KEY_ID=rzp_test_xxxxx
RAZORPAY_KEY_SECRET=xxxxx
RAZORPAY_WEBHOOK_SECRET=xxxxx

# SMS (configure when ready)
MSG91_AUTH_KEY=
MSG91_SENDER_ID=EXMFRG
MSG91_TEMPLATE_ID=
# OR
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
```
