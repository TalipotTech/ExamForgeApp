# Claude Code — MVP Sprint 1: User Foundation

> **Read first:** `@CLAUDE.md`, then `@docs/MVP_SCOPE.md`
>
> **MVP rule:** Admin creates content. Users consume content. Users sign up,
> get 50 free credits, practice exams, read tutorials, ask AI questions,
> track progress. That's the entire user-facing product for launch.
>
> **Do NOT build:** User content creation, uploads, scrapers for users,
> marketplace, content transfer. Those are post-MVP.
>
> **Execute in order. Each step = one commit.**

---

## STEP 1: Database — User-facing tables + subscription plans

`commit: feat: add user subscription, credits, progress, and topic Q&A tables`

### 1A. Create `subscription_plans` table

Create `packages/shared/src/db/schema/subscription-plans.ts`:

```
id                  uuid PK
name                varchar(50) NOT NULL UNIQUE    — 'free', 'pro', 'premium'
displayName         varchar(100) NOT NULL
priceMonthlyInr     integer NOT NULL               — paisa (29900 = ₹299). 0 for free.
priceYearlyInr      integer NOT NULL               — paisa
creditsPerMonth     integer NOT NULL               — -1 = unlimited
maxExams            integer NOT NULL               — max exams user can track
maxTutorialsFree    integer NOT NULL               — free tutorial views per exam. -1 = all
maxAiQuestions      integer NOT NULL               — AI Q&A per month. -1 = unlimited
maxMockExams        integer NOT NULL               — mock exams per month. -1 = unlimited
features            jsonb NOT NULL                 — { ad_free, detailed_analytics, ai_insights, ... }
isActive            boolean default true
sortOrder           integer default 0
createdAt           timestamp NOT NULL default now()
```

### 1B. Create `user_subscriptions` table

Create `packages/shared/src/db/schema/user-subscriptions.ts`:

```
id                      uuid PK
userId                  uuid NOT NULL FK → users.id
planId                  uuid NOT NULL FK → subscription_plans.id
status                  varchar(20) NOT NULL default 'active'
                        — active | cancelled | expired | past_due
billingCycle            varchar(10) nullable         — monthly | yearly | null (free)
currentPeriodStart      timestamp NOT NULL
currentPeriodEnd        timestamp NOT NULL
razorpaySubscriptionId  varchar(100) nullable
cancelAtPeriodEnd       boolean default false
createdAt               timestamp NOT NULL default now()
updatedAt               timestamp NOT NULL default now()
```

UNIQUE index on userId WHERE status = 'active' (one active sub per user).

### 1C. Create `user_credits` table

Create `packages/shared/src/db/schema/user-credits.ts`:

```
id                  uuid PK
userId              uuid NOT NULL FK → users.id
periodStart         date NOT NULL
periodEnd           date NOT NULL
creditsTotal        integer NOT NULL               — allocated for this period
creditsUsed         integer NOT NULL default 0
questionsAttempted  integer default 0
mockExamsTaken      integer default 0
aiQuestionsAsked    integer default 0
tutorialsAccessed   integer default 0
createdAt           timestamp NOT NULL default now()
updatedAt           timestamp NOT NULL default now()
UNIQUE(userId, periodStart)
```

Add a computed helper in the app layer (not stored column — Drizzle doesn't
support generated columns well):

```typescript
function creditsRemaining(record): number {
  return record.creditsTotal - record.creditsUsed;
}
```

### 1D. Create `user_exams` table

Create `packages/shared/src/db/schema/user-exams.ts`:

```
id          uuid PK
userId      uuid NOT NULL FK → users.id
examId      uuid NOT NULL FK → exams.id
targetScore integer nullable
priority    integer default 1          — 1 = primary exam
isActive    boolean default true
createdAt   timestamp NOT NULL default now()
updatedAt   timestamp NOT NULL default now()
UNIQUE(userId, examId)
```

### 1E. Create `user_progress` table

Create `packages/shared/src/db/schema/user-progress.ts`:

```
id                      uuid PK
userId                  uuid NOT NULL FK → users.id
examId                  uuid FK → exams.id nullable   — NULL = overall stats
totalQuestionsAttempted  integer default 0
totalCorrect            integer default 0
totalExamsTaken         integer default 0
averageScore            real nullable
streakDays              integer default 0
lastActivityAt          timestamp nullable
subjectScores           jsonb default '{}'
    — { "Pharmacology": { attempted: 50, correct: 40, accuracy: 0.8 } }
weakSubjects            jsonb default '[]'
strongSubjects          jsonb default '[]'
updatedAt               timestamp NOT NULL default now()
UNIQUE(userId, examId)
```

### 1F. Create `topic_conversations` table

Create `packages/shared/src/db/schema/topic-conversations.ts`:

```
id              uuid PK
userId          uuid NOT NULL FK → users.id
examId          uuid FK → exams.id nullable
contextType     varchar(20) NOT NULL       — tutorial | question | topic | general
contextId       uuid nullable              — tutorial.id or question.id
contextTitle    varchar(500) nullable
messages        jsonb NOT NULL default '[]'
    — [{ role: 'user'|'assistant', content: '...', timestamp: '...' }]
messageCount    integer default 0
aiProvider      varchar(50) nullable
totalTokens     integer default 0
createdAt       timestamp NOT NULL default now()
updatedAt       timestamp NOT NULL default now()
```

Indexes: on userId, on (contextType, contextId).

### 1G. Validators

Create `packages/shared/src/validators/user-mvp.ts`:

```typescript
export const SelectExamsSchema = z.object({
  examIds: z.array(z.string().uuid()).min(1).max(10),
});

export const StartPracticeSchema = z.object({
  examId: z.string().uuid(),
  mode: z.enum(["quick", "mock", "topic", "weak_areas"]),
  subject: z.string().optional(), // for topic mode
  questionCount: z.number().min(5).max(200).default(10),
});

export const AskTopicQuestionSchema = z.object({
  message: z.string().min(1).max(2000),
  contextType: z.enum(["tutorial", "question", "topic", "general"]),
  contextId: z.string().uuid().optional(),
  examId: z.string().uuid().optional(),
  conversationId: z.string().uuid().optional(), // continue existing conversation
});

export const SubscriptionPlanSchema = z.object({
  planName: z.enum(["free", "pro", "premium"]),
  billingCycle: z.enum(["monthly", "yearly"]).optional(),
});
```

### 1H. Export everything, generate migration, seed plans

1. Export all tables from `packages/shared/src/db/schema/index.ts`
2. Export validators from `packages/shared/src/validators/index.ts`
3. Export from `packages/shared/src/index.ts`
4. `pnpm db:generate && pnpm db:migrate`

5. Update `packages/shared/scripts/seed.ts`:
   - Seed 3 subscription plans (Free, Pro, Premium) with exact values from MVP_SCOPE.md section 4.2
   - After creating the admin user, also create:
     - A user_subscription (free plan) for the admin
     - A user_credits row (50 credits for current month)
     - 2 user_exams entries (BPharm + GPAT)
   - Create a second test user: `student@examforge.dev` / `student123` with role='student', free plan, 2 exams

6. Run: `pnpm db:seed`

---

## STEP 2: Credit check middleware + auto-setup on signup

`commit: feat: add credit system with auto-provisioning on signup`

### 2A. Create credit check middleware

Create `apps/api/src/middleware/credit-check.ts`:

```typescript
export const CREDIT_COSTS = {
  practice_question: 1,
  mock_exam: 5,
  ai_question: 1,
  tutorial_access: 1, // after free tier limit
} as const;

// Check if user has enough credits. Throws TRPCError if not.
export async function checkCredits(
  userId: string,
  action: keyof typeof CREDIT_COSTS,
  count: number = 1,
): Promise<{ creditsRemaining: number }>;

// Deduct credits after successful action. Call AFTER the action completes.
export async function deductCredits(
  userId: string,
  action: keyof typeof CREDIT_COSTS,
  count: number = 1,
): Promise<void>;

// Get current month's credit status
export async function getCurrentCredits(userId: string): Promise<{
  total: number;
  used: number;
  remaining: number;
  questionsAttempted: number;
  mockExamsTaken: number;
  aiQuestionsAsked: number;
  tutorialsAccessed: number;
  planName: string;
}>;

// Check plan-specific limits (exams tracked, tutorials, etc.)
export async function checkPlanLimit(
  userId: string,
  limitType: "exams" | "tutorials_free" | "ai_questions" | "mock_exams",
  currentCount: number,
): Promise<{ allowed: boolean; limit: number; used: number }>;
```

Implementation:

- `getCurrentCredits`: JOIN user_credits + user_subscriptions + subscription_plans for current month
- If no user_credits row exists for current month, create one (lazy provisioning):
  look up user's active subscription → plan.creditsPerMonth → insert user_credits
- If creditsPerMonth = -1, remaining is effectively Infinity (skip check)
- Error message must include: credits remaining, credits needed, and a hint to upgrade

### 2B. Auto-provision on signup

In the auth flow (wherever new users are created — probably a NextAuth callback
or a register tRPC mutation):

After creating the user record:

1. Look up the 'free' subscription plan
2. Create user_subscription: userId, planId, status='active', billingCycle=null,
   currentPeriodStart=startOfMonth, currentPeriodEnd=endOfMonth
3. Create user_credits: 50 credits for current month
4. The onboarding flow (Step 3) will add user_exams

If a registration tRPC mutation exists, add this there.
If using NextAuth callbacks, add to the `signIn` or `createUser` callback.

---

## STEP 3: Onboarding flow — choose exams

`commit: feat: add exam selection onboarding after signup`

### 3A. Create user-exam tRPC router

Create `apps/api/src/routers/user-exam.ts`:

- `list` — user's selected exams with exam details (JOIN exams table)
- `selectExams` — bulk set exams during onboarding. Input: `{ examIds: string[] }`.
  Check plan limit on maxExams. Insert user_exams rows. If any exist, skip (idempotent).
- `add` — add a single exam. Check plan limit.
- `remove` — remove an exam (set isActive=false)
- `reorder` — update priority ordering

### 3B. Create credits tRPC router

Create `apps/api/src/routers/user-credits.ts`:

- `getCurrent` — returns current month credits + plan info (from getCurrentCredits helper)
- `getHistory` — returns last 6 months of credit usage (for a usage chart)

### 3C. Create subscription tRPC router

Create `apps/api/src/routers/subscription.ts`:

- `getPlans` — returns all active subscription plans (public, no auth)
- `getCurrentSubscription` — user's active subscription + plan details
- `upgrade` — (placeholder for now, just changes plan in DB; Razorpay integration in Sprint 4)
- `cancel` — set cancelAtPeriodEnd=true

### 3D. Create onboarding page

Create `apps/web/src/app/(auth)/onboarding/page.tsx`.

This page shows AFTER signup but BEFORE the dashboard. The user MUST select
at least 1 exam before they can access the dashboard.

**Check in middleware**: if user has 0 user_exams rows AND is not admin → redirect to /onboarding.

**Layout:**

1. "Welcome to ExamForge! What exams are you preparing for?"
2. Grid of exam cards (fetched from tRPC exam.listPublic or a simpler query):
   - Each card: exam name, conducting body, category icon, exam date
   - Checkbox on each card (multi-select)
   - Highlight selected cards with accent border
3. Category filter tabs above: All | Pharmacy | Medical | Civil Services | State PSC | Engineering
4. "Continue" button (disabled until at least 1 selected)
5. After clicking Continue:
   - Calls userExam.selectExams
   - Redirects to /dashboard

Plan limit check: if free plan (max 2 exams), show "(Free plan: select up to 2)"
and disable selection after 2. Show "Upgrade for more" link.

Use shadcn/ui: Card, Checkbox, Badge, Button, Tabs.

---

## STEP 4: User dashboard layout + main dashboard

`commit: feat: add user dashboard with sidebar, stats, and credit widget`

### 4A. Create/update dashboard layout

Edit `apps/web/src/app/(dashboard)/layout.tsx`.

**Sidebar** (simplified for MVP — users are viewers, not creators):

```
👤 User Name
   Free Plan • ⭐ 38/50 credits

─────────────────────
📊 Dashboard            ← active

MY EXAMS
 🎯 BPharm Asst Prof
 💊 GPAT 2026

LEARN & PRACTICE
 📖 Tutorials
 📝 Practice
 📋 My Results

─────────────────────
💬 AI Tutor             (ask any topic)
📈 My Progress
⚙️ Settings
💳 Subscription

─────────────────────
🔥 Credits: 38/50 remaining
   [Upgrade to Pro →]
```

Notes:

- "MY EXAMS" section: fetch from `trpc.userExam.list.useQuery()`
- Credits widget at bottom: fetch from `trpc.userCredits.getCurrent.useQuery()`
- If admin user: show admin links too (Scraper, Content Finder, etc.)
- Mobile: sidebar collapses to hamburger, credits in header

### 4B. Create main dashboard page

Create `apps/web/src/app/(dashboard)/dashboard/page.tsx`:

**Sections:**

1. **Welcome banner**:
   "Welcome back, {name}! You have **38 credits** remaining this month."
   [If < 20%]: amber bar: "Running low on credits. Upgrade for unlimited access."
   [If 0]: red bar: "Credits exhausted. Upgrade to continue practicing."

2. **Exam progress cards** (one per user_exam):
   For each registered exam:
   - Exam name + countdown ("Exam in 96 days")
   - Overall accuracy: "78% (62/80 questions correct)"
   - Subject mini-bars (top 3 subjects, showing accuracy %)
   - Quick actions: "Practice" (→ practice page), "Syllabus" (→ tutorial tree)

   Fetch: `trpc.userExam.list.useQuery()` + user_progress per exam

3. **Study streak card**:
   - "🔥 5 day streak! Keep it going!"
   - Calendar heatmap (last 30 days — green dots for active days)
   - From user_progress.streakDays + user_progress.lastActivityAt

4. **Credits widget** (card):
   - Progress bar: 38/50 used
   - Breakdown: 20 practice Qs + 2 mock exams + 6 AI questions
   - "Upgrade" button (if not premium)

5. **Quick actions**:
   - "Start Practice" → opens exam/mode selector
   - "Browse Tutorials" → syllabus tree
   - "Ask AI Tutor" → opens topic chat
   - "View Exams" → /exams

Fetch with parallel TanStack Query calls. Show skeletons while loading.

---

## STEP 5: Pricing page

`commit: feat: add public pricing page with plan comparison`

Create `apps/web/src/app/pricing/page.tsx`.

**This is PUBLIC (no auth). Important for SEO and conversion.**

```typescript
export const metadata = {
  title: "Pricing — ExamForge",
  description:
    "Start free with 50 monthly credits. Upgrade to Pro or Premium for unlimited exam preparation.",
};
```

**Layout:**

1. Header: "Simple, transparent pricing" + "Start free. Upgrade when you need more."

2. Three plan cards side by side:

   **Free** (₹0):
   - 50 credits/month
   - 2 exams
   - 5 free tutorials per exam
   - 10 AI questions/month
   - 2 mock exams/month
   - Basic progress tracking
   - [Current Plan] or [Get Started Free]

   **Pro** (₹299/mo or ₹2,499/yr — save 30%):
   - 500 credits/month
   - 5 exams
   - All tutorials
   - 100 AI questions/month
   - 20 mock exams/month
   - Detailed analytics
   - Ad-free
   - [Upgrade to Pro]

   **Premium** (₹799/mo or ₹6,999/yr — save 27%):
   - Unlimited everything
   - Unlimited exams
   - AI-powered study insights
   - Priority support
   - [Upgrade to Premium]

3. Monthly/Yearly toggle (show savings for yearly)

4. Feature comparison table below:

   | Feature         | Free | Pro | Premium   |
   | --------------- | ---- | --- | --------- |
   | Monthly credits | 50   | 500 | Unlimited |
   | Exams tracked   | 2    | 5   | Unlimited |

   | ... (full table from MVP_SCOPE.md section 3.2)

5. FAQ section:
   - "What are credits?" — explanation
   - "What happens when I run out?" — you can still browse, view explanations
   - "Can I cancel anytime?" — yes, access until period end
   - "Is there a student discount?" — coming soon

Use shadcn/ui: Card, Badge, Tabs (monthly/yearly toggle), Table.
Highlight "Pro" as recommended (border accent, "Most Popular" badge).

---

## STEP 6: Per-exam practice entry point

`commit: feat: add practice mode selector for per-exam preparation`

Create `apps/web/src/app/(dashboard)/dashboard/exam/[examId]/page.tsx`:

This is the per-exam hub showing progress and offering practice options.

**Layout:**

1. **Header**: Exam name + conducting body + countdown + target score
2. **Stats row**: Questions attempted, Accuracy %, Exams taken, Credits used for this exam
3. **Subject progress**:
   - Bar chart or horizontal bars per subject
   - Color: green (>70%), amber (40-70%), red (<40%)
   - "No data yet" for subjects not attempted
4. **Practice options** (4 cards):
   - **Quick Practice**: "10 random questions — 10 credits"
   - **Mock Test**: "Full exam simulation — 5 credits"
   - **Topic Practice**: "Choose a subject" + subject selector dropdown → "Start — X credits"
   - **Weak Areas**: "AI picks your weakest topics — 10 credits"
     Each card: title, description, credit cost badge, "Start" button
5. **Syllabus shortcut**: "📖 Browse syllabus & tutorials" → links to syllabus tree
6. **Recent results**: last 3 exam sessions for this exam with score + date

On clicking any practice option:

1. Check credits (via trpc.userCredits.getCurrent, client-side check)
2. If insufficient: show upgrade modal instead of starting
3. If sufficient: call the existing exam-session creation logic
4. Redirect to exam-taking interface

---

## STEP 7: Tutorial access with credit gating

`commit: feat: add credit-gated tutorial access for users`

Users can browse the syllabus tree for free but accessing tutorials beyond
the free tier costs credits.

### 7A. Update syllabus tree viewer

The syllabus tree viewer already exists (or is specified). Update it so:

- **Tree structure** is always visible (free)
- **Tutorial content** for the first N tutorials per exam is free (plan.maxTutorialsFree)
- Beyond that: clicking a tutorial shows a gate:
  "This tutorial requires 1 credit. You have 38 remaining. [Read Tutorial] [Upgrade Plan]"

Implementation:

- When user clicks a tutorial node, the tRPC query checks:
  1. Is user admin? → always allow
  2. How many tutorials has user accessed for this exam this month?
  3. If count < plan.maxTutorialsFree → allow free
  4. Else → check and deduct 1 credit
- Track in user_credits.tutorialsAccessed

### 7B. Add "Ask AI" to tutorial viewer

On every tutorial page, add a chat interface at the bottom:

- Input: "Ask a question about this topic..."
- Uses Vercel AI SDK `useChat` hook
- API endpoint: creates/continues a topic_conversation
- Context: tutorial content is prepended as system context
- Each user message costs 1 credit (checked server-side before streaming)
- If no credits: input disabled with "Upgrade to ask questions" message

---

## STEP 8: Exam results with "Learn from mistakes" flow

`commit: feat: add learn-from-mistakes flow in exam results`

Update the exam results page (after completing a practice test):

For each wrong answer, show:

1. ✗ Your answer: A) Aspirin
2. ✓ Correct answer: B) Celecoxib
3. 💡 **Explanation** (always free, from question.explanation)
4. 📖 **"Read Tutorial"** link — IF the question is linked to a syllabus node
   (via tutorial_questions junction table), link to that tutorial.
   If no tutorial linked, show "Tutorial not available for this topic."
5. 💬 **"Ask AI about this"** — opens topic chat with question as context.
   Shows: "1 credit" badge. If no credits: "Upgrade to ask AI."
6. 📝 **"Practice similar questions"** — starts a new mini-session with questions
   from the same subject/topic. Shows: "X credits for Y questions."

This creates a natural learning loop:
Practice → Get wrong → Read explanation → Go deeper with tutorial → Ask AI → Practice again

---

## STEP 9: Post-implementation

`commit: chore: update all project docs for MVP Sprint 1`

1. `pnpm lint:fix && pnpm type-check && pnpm build`

2. Update CLAUDE.md:
   - Current Status: add user signup, onboarding, dashboard, credits, pricing
   - Database Schema: add all 6 new tables
   - Note: "MVP model: admin creates, users consume. Credit-gated access."

3. Update BACKLOG.md: check off Sprint 1 items

4. Update TASKS_COMPLETED.md: document Sprint 1

5. Test the full flow manually:
   - Sign up as new user → onboarding (select exams) → dashboard
   - Check credits widget shows 50/50
   - Start practice → answer questions → credits deducted
   - View results → read explanation (free) → ask AI (1 credit)
   - Browse syllabus → read tutorial (free for first 5) → 6th costs credit
   - View pricing page → verify plan details
   - Log in as admin → verify admin still has full access to scraper, generator, etc.

6. Add `.claude/rules/credit-system.md` documenting the credit patterns
7. Add `.cursor/rules/user-mvp.mdc` for user-facing UI conventions
