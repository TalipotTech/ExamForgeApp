# Authentication, Admin & Frontend Routing Module

## Overview

Full authentication system, admin panel, role-based routing, and public examination pages for ExamForge MVP.

---

## Architecture

```
User (Browser)
  │
  ├─ NextAuth.js v5 (JWT strategy)
  │   ├─ Credentials provider (email / phone / username + password)
  │   └─ Google OAuth provider (optional, env-gated)
  │
  ├─ Next.js Middleware (role-based route guard)
  │   ├─ Public routes: /, /login, /signup, /exams, /examinations, etc.
  │   ├─ Admin-only: /admin/*, /questions, /generate, /scraper, /syllabus, etc.
  │   └─ Student routes: /exams/start
  │
  └─ tRPC v11 (Fastify 5)
      ├─ publicProcedure — no auth
      ├─ protectedProcedure — any authenticated user
      ├─ adminProcedure — admin or superadmin
      └─ superAdminProcedure — superadmin only
```

## Workflow

### Registration Flow

1. User submits registration form (email/phone/username + password)
2. `auth.register` tRPC mutation:
   - Checks feature flags (signup enabled, email/phone signup allowed)
   - Validates uniqueness (email, phone, username)
   - Hashes password (bcryptjs, 12 rounds)
   - Creates user with `role: "student"`, assigns free plan + initial credits
   - Generates OTP (6-digit, bcrypt-hashed, 10min expiry)
   - Logs OTP to console (dev) or sends via Resend (prod)
3. Redirect to `/verify` page
4. User enters OTP → `auth.verifyOtp` validates against hashed record

### Login Flow

1. User enters identifier (auto-detects email/@, phone/+digits, or username)
2. NextAuth Credentials provider:
   - Looks up user by detected identifier type
   - Compares bcrypt password hash
   - Checks `isBanned` and `isActive` flags
   - Updates `lastLoginAt` and `loginCount`
3. JWT token issued with `userId`, `role`, `orgId`
4. Middleware redirects: admin → `/admin`, student → `/exams/start`

### Google OAuth Flow

1. User clicks "Continue with Google"
2. NextAuth Google provider redirects to Google consent
3. `signIn` callback: checks if email exists in DB
   - Existing user: updates `googleId`, `lastLoginAt`
   - New user: creates user with `role: "student"`, `authProvider: "google"`
4. `jwt` callback: fetches `userId`, `role`, `orgId` from DB into token

### OTP System

- 6-digit numeric code, bcrypt-hashed before storage
- 10-minute expiry, max 5 verification attempts
- Rate limit: max 3 OTPs per identifier per hour
- 60-second cooldown between resends
- Dev: printed to API console (`[OTP] email: 123456`)
- Prod: sent via Resend email API

### Role-Based Access Control

| Role         | Landing Page   | Access                            |
| ------------ | -------------- | --------------------------------- |
| `student`    | `/exams/start` | Start Exam, Examinations (public) |
| `teacher`    | `/exams/start` | Same as student (expandable)      |
| `admin`      | `/admin`       | All pages + admin panel           |
| `superadmin` | `/admin`       | All pages + platform settings     |

### Admin Panel

- `/admin` — Dashboard with stats (users, questions, documents, errors)
- `/admin/users` — User list with search, filters, pagination, create/ban/deactivate
- `/admin/users/[id]` — User detail with role/plan/credits management, audit log
- `/admin/settings` — Feature flags, SMS config, payment config (superadmin only)

### Public Examination Pages

- `/examinations` — Lists all processed examination schedule documents as cards
- `/examinations/[documentId]` — Mobile-first card layout showing all exam entries
  - Search with yellow highlight on matching text
  - View syllabus button → dialog with tree view
  - Download syllabus PDF
  - No admin actions (parse, approve, etc.)

---

## Database Tables (New)

| Table                 | Purpose                                        |
| --------------------- | ---------------------------------------------- |
| `otp_verifications`   | OTP records with hashed code, attempts, expiry |
| `auth_sessions`       | Extended session tracking with device info     |
| `admin_feature_flags` | Key-value feature flags with categories        |
| `payment_orders`      | Razorpay payment records                       |
| `admin_audit_log`     | Admin action audit trail                       |
| `subscription_plans`  | Plan definitions (free/pro/premium)            |
| `user_subscriptions`  | Active user subscriptions                      |
| `user_credits`        | Monthly credit tracking                        |
| `user_exams`          | User's selected exams for preparation          |
| `user_progress`       | Cached per-exam progress stats                 |
| `topic_conversations` | AI topic Q&A conversations                     |

### Modified Tables

- `users` — Added: `username`, `emailVerified`, `phoneVerified`, `authProvider`, `googleId`, `isActive`, `isBanned`, `banReason`, `lastLoginAt`, `loginCount`, `signupSource`

---

## File Map

### Database Schemas (`packages/shared/src/db/schema/`)

- `users.ts` — Extended user table with auth fields
- `otp-verifications.ts` — OTP storage
- `auth-sessions.ts` — Session tracking
- `admin-feature-flags.ts` — Feature flag storage
- `payment-orders.ts` — Payment records
- `admin-audit-log.ts` — Audit trail
- `subscription-plans.ts` — Plan definitions
- `user-subscriptions.ts` — User plan assignments
- `user-credits.ts` — Credit tracking
- `user-exams.ts` — User exam selections
- `user-progress.ts` — Progress stats
- `topic-conversations.ts` — AI conversations

### Validators (`packages/shared/src/validators/`)

- `auth.ts` — Zod schemas for register, login, verify OTP, reset password

### API Services (`apps/api/src/services/`)

- `otp-service.ts` — OTP generation, verification, rate limiting
- `email-service.ts` — Email sending (console.log dev / Resend prod)
- `sms-service.ts` — SMS sending (console.log / MSG91 / Twilio)
- `feature-flags.ts` — Redis-cached feature flag reads/writes
- `payment-service.ts` — Razorpay subscription management
- `audit-log.ts` — Admin audit log helper

### API Routers (`apps/api/src/trpc/routers/`)

- `auth.ts` — Register, verify OTP, resend, forgot/reset password, me, getAuthFlags
- `payment.ts` — Plans, subscriptions, payment verification, history
- `admin-users.ts` — User CRUD, ban/unban, role/plan changes, soft delete
- `admin-settings.ts` — Feature flags CRUD, SMS/payment test endpoints
- `portal-ingestion.ts` — Added 3 public endpoints: `listExaminationDocuments`, `getExaminationEntries`, `getPublicSyllabusData`

### Frontend Auth (`apps/web/src/`)

- `lib/auth.ts` — NextAuth config (Credentials + Google providers, callbacks)
- `lib/auth-types.ts` — Session/JWT type augmentation
- `middleware.ts` — Route guards (public, admin-only, role-based redirects)

### Frontend Pages (`apps/web/src/app/`)

- `(auth)/layout.tsx` — Auth page layout with header/footer matching home page
- `(auth)/login/page.tsx` — Multi-identifier login with Google OAuth
- `(auth)/signup/page.tsx` — Tabbed registration (email/phone/username)
- `(auth)/verify/page.tsx` — 6-digit OTP input with auto-focus
- `(auth)/forgot-password/page.tsx` — Two-step password reset
- `(dashboard)/layout.tsx` — Role-aware nav (admin sees all, student sees Start Exam)
- `(dashboard)/admin/layout.tsx` — Admin sidebar (Overview, Users, Settings)
- `(dashboard)/admin/page.tsx` — Admin dashboard with stats cards
- `(dashboard)/admin/users/page.tsx` — User management list
- `(dashboard)/admin/users/[id]/page.tsx` — User detail + actions
- `(dashboard)/admin/settings/page.tsx` — Feature flags + config
- `examinations/layout.tsx` — Public layout with header/footer
- `examinations/page.tsx` — Examination schedule listing with search
- `examinations/[documentId]/page.tsx` — Mobile-first exam entries with syllabus viewer
- `page.tsx` — Home page with examination cards + search box

### Frontend Components

- `components/user-menu.tsx` — User name + sign out (→ `/`)
- `components/home/examination-list.tsx` — Exam schedule cards for home page

### Seed Script

- `packages/shared/scripts/seed.ts` — Seeds subscription plans, feature flags, test users, credits

---

## Environment Variables

### Required

```
AUTH_SECRET=              # NextAuth secret (generate with: npx auth secret)
DATABASE_URL=             # PostgreSQL connection string
```

### Optional (enable features)

```
# Google OAuth
GOOGLE_CLIENT_ID=         # Google Cloud OAuth client ID
GOOGLE_CLIENT_SECRET=     # Google Cloud OAuth client secret

# Email (Resend)
RESEND_API_KEY=           # Resend API key (without this, OTPs log to console)
EMAIL_FROM=               # Sender address (e.g., ExamForge <noreply@examforge.in>)

# SMS
MSG91_AUTH_KEY=            # MSG91 auth key
MSG91_TEMPLATE_ID=        # MSG91 OTP template ID
MSG91_SENDER_ID=          # MSG91 sender ID
TWILIO_ACCOUNT_SID=       # Twilio account SID
TWILIO_AUTH_TOKEN=        # Twilio auth token
TWILIO_PHONE_NUMBER=      # Twilio phone number

# Payments
RAZORPAY_KEY_ID=          # Razorpay key ID
RAZORPAY_KEY_SECRET=      # Razorpay key secret
RAZORPAY_WEBHOOK_SECRET=  # Razorpay webhook secret
```

---

## Feature Flags (24 flags, seeded)

| Category | Flag                               | Default |
| -------- | ---------------------------------- | ------- |
| Auth     | `auth.signup_enabled`              | true    |
| Auth     | `auth.google_oauth_enabled`        | true    |
| Auth     | `auth.email_signup_enabled`        | true    |
| Auth     | `auth.phone_signup_enabled`        | true    |
| Auth     | `auth.email_verification_required` | false   |
| Auth     | `auth.phone_verification_required` | false   |
| SMS      | `sms.provider`                     | "none"  |
| Payment  | `payment.enabled`                  | false   |
| Feature  | `feature.free_credits_monthly`     | 50      |
| Feature  | `feature.maintenance_mode`         | false   |
| ...      | (14 more)                          | ...     |

---

## Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Create OAuth 2.0 Client ID (Web application)
3. Add redirect URIs:
   - Dev: `http://localhost:3000/api/auth/callback/google`
   - Prod: `https://yourdomain.com/api/auth/callback/google`
4. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env.local`
5. Restart dev server — the Google button appears automatically
