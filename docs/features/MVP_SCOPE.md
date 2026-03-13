# ExamForge MVP — Scope & Architecture (Consolidated)

> **This document supersedes all previous phase documents for the initial launch.**
> Previous specs (Platform Architecture, Content Marketplace, User Workspaces)
> are preserved as `docs/future/` — they define the post-MVP roadmap.

---

## 1. MVP Philosophy

```
╔══════════════════════════════════════════════════════╗
║                   MVP RULE                            ║
║                                                       ║
║   Admin CREATES content.                              ║
║   Users CONSUME content.                              ║
║   That's it.                                          ║
║                                                       ║
║   Users do NOT create, scrape, upload, or sell.        ║
║   Those features come AFTER the site goes live.        ║
╚══════════════════════════════════════════════════════╝
```

### What Admin Does (Backend/Dashboard — already built or in progress)

- Uploads syllabi → AI extracts structure → generates tutorials
- Configures scrapers → scrapes previous year questions
- Uses Content Finder → discovers and saves exam resources
- Generates questions via AI (single or multi-agent)
- Creates and manages exams
- Manages exam catalog (dates, featured, categories)
- All content is `owner_type='platform'`, `visibility='public'`

### What Users Do (Frontend — this build)

- **Sign up** (email + password, Google OAuth)
- **Choose exams** they're preparing for (multi-exam)
- **Browse the exam catalog** (public, SEO-friendly)
- **Take practice exams** (costs credits)
- **Read tutorials** generated from syllabi
- **Learn from Q&A** — every question has an explanation; user can ask follow-up questions on any topic using AI
- **Track progress** — per-exam dashboard with subject-wise scores, streak, weak areas
- **Subscription** — free tier with limited credits, paid tiers for more

### What Users Do NOT Do (Post-MVP)

- ❌ Create questions or tutorials
- ❌ Upload content (PDFs, text, notes)
- ❌ Configure scrapers
- ❌ Use Content Finder to search the web
- ❌ Sell or buy content on marketplace
- ❌ Transfer content to other users

---

## 2. User Experience Flow

### 2.1 Signup → Onboarding → Dashboard

```
Sign Up (email/Google)
    │
    ▼
Onboarding: "What exams are you preparing for?"
    │  ☑ BPharm Assistant Professor
    │  ☑ GPAT 2026
    │  ☐ NEET UG
    │  ☐ UPSC CSE
    │
    ▼
Dashboard (personalized for selected exams)
    │
    ├── Exam Progress Cards (per exam)
    ├── Daily Study Streak
    ├── Credits Remaining: 50/50 free questions
    ├── Quick Actions: Practice, Learn, Browse
    └── "Upgrade for unlimited access" CTA
```

### 2.2 Learn Flow (Tutorials from Syllabus)

```
Dashboard → Select Exam → View Syllabus
    │
    ▼
Syllabus Tree View (collapsible, read-only)
    ├── Unit I: Pharmaceutics
    │   ├── 1.1 Dosage Forms         [📖 Tutorial Available]
    │   ├── 1.2 Tablet Technology     [📖 Tutorial Available]
    │   └── 1.3 Capsule Formulation   [🔒 Pro Plan]
    │
    ▼
Click "1.1 Dosage Forms"
    │
    ▼
Tutorial Page (rich content, read-only)
    ├── Learning Objectives
    ├── Detailed Explanation
    ├── Key Definitions (highlighted)
    ├── Formulas
    ├── Clinical Applications
    ├── Summary & Mnemonics
    │
    ├── 💬 "Ask a Question" (AI chat on this topic)
    │   User: "What's the difference between wet and dry granulation?"
    │   AI: [detailed answer using tutorial context as RAG]
    │   (costs 1 credit per question)
    │
    └── 📝 "Practice Questions on This Topic" → starts mini-exam
        (costs credits based on question count)
```

### 2.3 Practice Flow (Exams & Questions)

```
Dashboard → Select Exam → Practice
    │
    ├── Option A: "Quick Practice" (10 random Qs, 1 credit each)
    ├── Option B: "Mock Test" (full exam simulation, 5 credits)
    ├── Option C: "Topic Practice" (select subject/topic)
    └── Option D: "Weak Areas" (AI picks topics user struggles with)
    │
    ▼
Exam Interface (timer, navigation, A-D shortcuts)
    │
    ▼
Results Page
    ├── Score: 78% (62/80)
    ├── Time: 45:23
    ├── Per-question breakdown
    │   ├── Q1: ✓ Correct
    │   ├── Q2: ✗ Wrong — Correct: B) Enalapril
    │   │   └── 📖 "Learn about this topic" → links to tutorial
    │   │   └── 💡 Explanation (always shown)
    │   │   └── 💬 "Ask why" → AI explains the answer
    │   └── ...
    ├── Subject Analysis: Pharmacology 85%, Pharmaceutics 65%
    └── "Retake" / "Practice Weak Areas" / "Back to Dashboard"
```

### 2.4 Ask Questions on Topics (AI Tutor)

This is a KEY differentiator. After reading a tutorial or reviewing exam
results, the user can ask follow-up questions and get AI-powered answers.

```
Context: User is viewing Tutorial "1.1 Dosage Forms"

User: "Explain bioavailability in simple terms with an example"

AI (Claude): [Uses tutorial content as RAG context]
"Bioavailability refers to the fraction of an administered drug that
reaches systemic circulation in unchanged form. For example, if you
take a 100mg oral tablet of Drug X and only 70mg reaches your blood,
the bioavailability is 70%.

This matters for dosage form design because..."

[AI response is FREE to read — only the act of asking costs 1 credit]
[Response includes: references to tutorial sections, related topics to explore]
```

Implementation: Vercel AI SDK `useChat` hook with RAG context (tutorial
content + question explanation + syllabus node) prepended to the prompt.

---

## 3. Credit & Subscription System

### 3.1 Credit Model

Every user action that uses AI or accesses premium content costs credits:

| Action                                      | Credit Cost     |
| ------------------------------------------- | --------------- |
| View tutorial (free tier, first 5 per exam) | 0               |
| View tutorial (beyond free limit)           | 1               |
| Take practice question                      | 1 per question  |
| Take mock exam (full simulation)            | 5 flat          |
| Ask AI a question (topic Q&A)               | 1               |
| View question explanation                   | 0 (always free) |
| Browse exam catalog                         | 0               |
| View syllabus tree (structure only)         | 0               |
| View dashboard & progress                   | 0               |

### 3.2 Subscription Plans

| Feature                   | Free           | Pro (₹299/mo)    | Premium (₹799/mo)      |
| ------------------------- | -------------- | ---------------- | ---------------------- |
| Monthly credits           | 50             | 500              | Unlimited              |
| Exams tracked             | 2              | 5                | Unlimited              |
| Tutorials (free per exam) | 5              | All              | All                    |
| AI topic Q&A              | 10/month       | 100/month        | Unlimited              |
| Mock exams                | 2/month        | 20/month         | Unlimited              |
| Question explanations     | ✓ Always free  | ✓                | ✓                      |
| Syllabus access           | Structure only | Full + tutorials | Full + tutorials       |
| Progress analytics        | Basic          | Detailed         | Detailed + AI insights |
| Ad-free                   | ✗              | ✓                | ✓                      |
| Priority support          | ✗              | ✗                | ✓                      |

### 3.3 Credit Lifecycle

```
User signs up
    │
    ▼
50 free credits added (no payment required)
    │
    ▼
User practices exams, reads tutorials, asks AI questions
    │
    ▼
Credits deplete → soft warnings at 20%, 10%, 0%
    │
    ├── At 20%: "You have 10 credits remaining"
    ├── At 10%: "Running low! Upgrade for unlimited access"
    └── At 0%: Can still browse, view explanations, see dashboard
              But cannot: take exams, ask AI, access premium tutorials
    │
    ▼
Upgrade prompt → Razorpay subscription → credits reset monthly
```

---

## 4. Database Changes for MVP

### 4.1 New Tables (User-Facing)

```sql
-- User's selected exams for preparation
CREATE TABLE user_exams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  exam_id UUID NOT NULL REFERENCES exams(id),
  target_score INTEGER,
  priority INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, exam_id)
);

-- Subscription plans
CREATE TABLE subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) NOT NULL UNIQUE,       -- 'free', 'pro', 'premium'
  display_name VARCHAR(100) NOT NULL,
  price_monthly_inr INTEGER NOT NULL,     -- paisa (0 for free)
  price_yearly_inr INTEGER NOT NULL,
  credits_per_month INTEGER NOT NULL,     -- -1 = unlimited
  max_exams INTEGER NOT NULL,
  max_tutorials_free INTEGER NOT NULL,    -- free tutorials per exam
  max_ai_questions INTEGER NOT NULL,      -- AI topic Q&A per month
  max_mock_exams INTEGER NOT NULL,
  features JSONB NOT NULL,                -- detailed feature flags
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Active user subscriptions
CREATE TABLE user_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  plan_id UUID NOT NULL REFERENCES subscription_plans(id),
  status VARCHAR(20) NOT NULL DEFAULT 'active',
    -- active | cancelled | expired | past_due
  billing_cycle VARCHAR(10),              -- monthly | yearly | null (free)
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  razorpay_subscription_id VARCHAR(100),
  cancel_at_period_end BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_user_sub_active ON user_subscriptions(user_id)
  WHERE status = 'active';

-- Monthly credit tracking
CREATE TABLE user_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  credits_total INTEGER NOT NULL,         -- allocated for this period
  credits_used INTEGER NOT NULL DEFAULT 0,
  credits_remaining INTEGER GENERATED ALWAYS AS (credits_total - credits_used) STORED,
  questions_attempted INTEGER DEFAULT 0,
  mock_exams_taken INTEGER DEFAULT 0,
  ai_questions_asked INTEGER DEFAULT 0,
  tutorials_accessed INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, period_start)
);

-- User progress stats (cached, per exam)
CREATE TABLE user_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  exam_id UUID REFERENCES exams(id),      -- NULL = overall
  total_questions_attempted INTEGER DEFAULT 0,
  total_correct INTEGER DEFAULT 0,
  total_exams_taken INTEGER DEFAULT 0,
  average_score REAL,
  streak_days INTEGER DEFAULT 0,
  last_activity_at TIMESTAMPTZ,
  subject_scores JSONB DEFAULT '{}',
    -- { "Pharmacology": { attempted: 50, correct: 40, accuracy: 0.8 } }
  weak_subjects JSONB DEFAULT '[]',
  strong_subjects JSONB DEFAULT '[]',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, exam_id)
);

-- AI topic Q&A conversations (per tutorial/question context)
CREATE TABLE topic_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  exam_id UUID REFERENCES exams(id),
  context_type VARCHAR(20) NOT NULL,
    -- tutorial | question | topic | general
  context_id UUID,                        -- tutorial.id or question.id
  context_title VARCHAR(500),
  messages JSONB NOT NULL DEFAULT '[]',
    -- [{ role: 'user'|'assistant', content: '...', timestamp: '...' }]
  message_count INTEGER DEFAULT 0,
  ai_provider VARCHAR(50),
  total_tokens INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_topic_conv_user ON topic_conversations(user_id);
CREATE INDEX idx_topic_conv_context ON topic_conversations(context_type, context_id);
```

### 4.2 Seed Data

```typescript
// 3 subscription plans
const plans = [
  {
    name: "free",
    displayName: "Free",
    priceMonthlyInr: 0,
    priceYearlyInr: 0,
    creditsPerMonth: 50,
    maxExams: 2,
    maxTutorialsFree: 5,
    maxAiQuestions: 10,
    maxMockExams: 2,
    features: {
      explanations: true,
      syllabus_structure: true,
      basic_analytics: true,
      detailed_analytics: false,
      ai_insights: false,
      ad_free: false,
    },
  },
  {
    name: "pro",
    displayName: "Pro",
    priceMonthlyInr: 29900,
    priceYearlyInr: 249900,
    creditsPerMonth: 500,
    maxExams: 5,
    maxTutorialsFree: -1,
    maxAiQuestions: 100,
    maxMockExams: 20,
    features: {
      explanations: true,
      syllabus_structure: true,
      basic_analytics: true,
      detailed_analytics: true,
      ai_insights: false,
      ad_free: true,
    },
  },
  {
    name: "premium",
    displayName: "Premium",
    priceMonthlyInr: 79900,
    priceYearlyInr: 699900,
    creditsPerMonth: -1,
    maxExams: -1,
    maxTutorialsFree: -1,
    maxAiQuestions: -1,
    maxMockExams: -1,
    features: {
      explanations: true,
      syllabus_structure: true,
      basic_analytics: true,
      detailed_analytics: true,
      ai_insights: true,
      ad_free: true,
    },
  },
];
// On new user signup: create user_subscription with free plan +
// create user_credits with 50 credits for current month
```

---

## 5. User-Facing Pages

| Path                                       | Auth   | Description                                      |
| ------------------------------------------ | ------ | ------------------------------------------------ |
| `/`                                        | Public | Landing page (existing) + exam showcase          |
| `/exams`                                   | Public | Exam catalog with filters (SEO)                  |
| `/exams/[id]`                              | Public | Exam detail (dates, subjects, syllabus preview)  |
| `/signup`                                  | Public | Registration                                     |
| `/login`                                   | Public | Login                                            |
| `/pricing`                                 | Public | Subscription comparison (Free vs Pro vs Premium) |
| `/dashboard`                               | Auth   | User's main dashboard                            |
| `/dashboard/exam/[id]`                     | Auth   | Per-exam progress                                |
| `/dashboard/exam/[id]/practice`            | Auth   | Start practice (quick/mock/topic/weak areas)     |
| `/dashboard/exam/[id]/syllabus`            | Auth   | Syllabus tree (read-only)                        |
| `/dashboard/exam/[id]/syllabus/[nodeId]`   | Auth   | Tutorial viewer + AI Q&A                         |
| `/dashboard/exam/[id]/results/[sessionId]` | Auth   | Exam results + learn from mistakes               |
| `/dashboard/history`                       | Auth   | Past exam sessions                               |
| `/dashboard/settings`                      | Auth   | Profile, password, notifications                 |
| `/dashboard/subscription`                  | Auth   | Current plan, usage, upgrade                     |

Admin pages remain at `/admin/*` — unchanged from current build.

---

## 6. Key Components

### 6.1 Credit Gate Middleware

```typescript
// apps/api/src/middleware/credit-check.ts

export async function checkCredits(userId: string, cost: number, action: string): Promise<void> {
  const credits = await getCurrentCredits(userId);

  if (credits.creditsRemaining < cost) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        `Not enough credits. You need ${cost} credit(s) for this action. ` +
        `Remaining: ${credits.creditsRemaining}. Upgrade your plan for more.`,
      cause: { creditsRemaining: credits.creditsRemaining, required: cost, action },
    });
  }
}

export async function deductCredits(userId: string, cost: number, action: string): Promise<void> {
  await db
    .update(userCredits)
    .set({
      creditsUsed: sql`credits_used + ${cost}`,
      [`${action}` as any]: sql`${action} + 1`, // increment action counter
    })
    .where(and(eq(userCredits.userId, userId), eq(userCredits.periodStart, startOfCurrentMonth())));
}
```

### 6.2 AI Topic Q&A (useChat Integration)

```typescript
// apps/web — using Vercel AI SDK
const { messages, input, handleSubmit, isLoading } = useChat({
  api: "/api/ai/topic-chat",
  body: {
    contextType: "tutorial", // or 'question'
    contextId: tutorial.id,
    examId: exam.id,
  },
  onFinish: () => {
    // Credit is deducted server-side before streaming starts
  },
});

// apps/api — chat endpoint
// 1. Check credits (1 per question)
// 2. Load context: tutorial content / question + explanation
// 3. Build prompt with RAG context
// 4. Stream response via Vercel AI SDK
// 5. Deduct 1 credit
// 6. Save to topic_conversations
```

### 6.3 "Learn from This Question" Flow

After viewing a wrong answer in exam results:

1. Show explanation (always free)
2. "📖 Read Tutorial" → links to the relevant tutorial (from syllabus node)
3. "💬 Ask AI" → opens topic chat with the question as context
4. "📝 Practice Similar" → generates similar questions on the same topic
5. Each of 3 and 4 costs credits

---

## 7. What Has Already Been Built (Don't Rebuild)

| Component                         | Status  | Location                                  |
| --------------------------------- | ------- | ----------------------------------------- |
| Monorepo + Turborepo              | ✅ Done | Root                                      |
| Database: 8 tables + migrations   | ✅ Done | packages/shared/src/db/schema/            |
| Auth (NextAuth v5 + credentials)  | ✅ Done | apps/web/src/auth.ts                      |
| Landing page                      | ✅ Done | apps/web/src/app/page.tsx                 |
| API server (Fastify + tRPC)       | ✅ Done | apps/api/                                 |
| Add Source page (scraper)         | ✅ Done | apps/web/src/app/(dashboard)/scraper/add/ |
| Seed script                       | ✅ Done | packages/shared/scripts/seed.ts           |
| Docker Compose (Postgres + Redis) | ✅ Done | docker-compose.yml                        |
| AWS CDK stack                     | ✅ Done | infra/                                    |
| CI/CD (GitHub Actions)            | ✅ Done | .github/workflows/                        |

| Component                                                 | Status       | Spec                                    |
| --------------------------------------------------------- | ------------ | --------------------------------------- |
| Syllabus Pipeline (schema + extraction + tutorials + MCQ) | 📋 Specified | docs/features/SYLLABUS_PIPELINE.md      |
| Exam Discovery Agent + Scraper                            | 📋 Specified | docs/features/EXAM_DISCOVERY_SCRAPER.md |
| Content Finder (search + save)                            | 📋 Specified | docs/features/CONTENT_FINDER.md         |
| Platform Expansion (user-as-creator, marketplace)         | 📋 Future    | docs/future/PLATFORM_ARCHITECTURE.md    |

---

## 8. MVP Implementation Order

### Sprint 1: User Foundation (this sprint)

1. User-facing tables: user_exams, subscription_plans, user_subscriptions, user_credits, user_progress, topic_conversations
2. Seed plans (Free, Pro, Premium) + auto-assign Free on signup
3. Onboarding flow (choose exams)
4. User dashboard layout (sidebar with exam list, credits widget)
5. Main dashboard page (exam cards, stats, streak, credits remaining)
6. Pricing page (public)
7. Credit check middleware

### Sprint 2: Exam Experience

1. Public exam catalog (/exams with filters) — from EXAM_DISCOVERY spec
2. Exam detail page (public)
3. Per-exam dashboard with subject progress
4. Practice options (quick, mock, topic, weak areas)
5. Exam-taking interface (already specified)
6. Results page with "Learn from mistakes" flow

### Sprint 3: Learning Experience

1. Syllabus tree viewer (read-only for users, admin manages)
2. Tutorial viewer (rich content from admin-generated tutorials)
3. AI Topic Q&A chat (Vercel AI SDK useChat, RAG with tutorial context)
4. "Learn about this topic" links from question explanations
5. Credit deduction for all AI interactions

### Sprint 4: Subscriptions & Polish

1. Razorpay subscription integration
2. Upgrade/downgrade flow
3. Credit reset cron (monthly)
4. Low-credit warnings and upgrade CTAs
5. Progress analytics (basic for free, detailed for pro)
6. SEO (generateMetadata for exam pages)
7. PWA setup (offline exam-taking)

### Post-MVP (after site goes live)

→ Move `docs/future/PLATFORM_ARCHITECTURE.md` features into active development:

- User content creation (questions, tutorials, uploads)
- Content Finder for users
- User-configured scrapers
- Marketplace + content transfer
- Audio/video upload + transcription
