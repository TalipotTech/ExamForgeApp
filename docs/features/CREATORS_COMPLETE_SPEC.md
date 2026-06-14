# Creators Ecosystem — Complete Feature Spec (All PadVik Features)

> **Replaces:** CREATORS_PADVIK_ANALYSIS.md and CREATORS_REVENUE_MODEL.md
> **Source:** PadVik codebase (reviewed), adapted for ExamForge competitive exam context
> **Scope:** EVERYTHING — classrooms, video, audio, live sessions, handwritten OCR, promotions
> **Company:** Ensate Technologies — this feature is shared architecture across PadVik + ExamForge

---

## 1. Complete Creator Feature Map

```
┌─────────────────────────────────────────────────────────────┐
│                   CREATOR ECOSYSTEM                          │
│                                                              │
│  CREATOR TYPES                                               │
│  ├── Individual Expert (professor, coaching faculty, topper) │
│  ├── Institute (coaching center, tuition batch)              │
│  ├── Student Creator (peer tutor, notes sharer)              │
│  └── Publisher (textbook author, content house)              │
│                                                              │
│  CONTENT TYPES                                               │
│  ├── 📝 Question Sets (MCQ banks, test series)              │
│  ├── 📖 Tutorials / Study Notes (rich text, markdown)       │
│  ├── 🎬 Video Lessons (recorded lectures, explanations)     │
│  ├── 🎧 Audio Lessons (podcast-style, revision audio)       │
│  ├── 📄 Documents (PDF notes, handwritten scans)            │
│  ├── 🖼️ Images / Diagrams (handwritten → OCR → digital)     │
│  ├── 📦 Courses (bundled tutorials + questions + exams)     │
│  └── 📢 Promotional Content (free preview, ads)             │
│                                                              │
│  INTERACTION                                                 │
│  ├── 🎓 Classrooms (institute creates, students join)       │
│  ├── ❓ Doubt Clearance (student asks, creator answers)     │
│  ├── 🤖 Creator's AI Tutor (RAG on creator's content)      │
│  ├── 📺 Live Sessions (embedded meet link or WebRTC)        │
│  ├── 💬 Community / Comments                                │
│  └── ⭐ Ratings & Reviews                                   │
│                                                              │
│  MONETIZATION                                                │
│  ├── 💰 Marketplace (sell content, 70/30 split)             │
│  ├── 📊 Subscription Pool (passive income from free content)│
│  ├── 🎓 Classroom Fees (institute charges students)         │
│  ├── 🎁 Tips / Donations                                    │
│  ├── 📢 Promoted Content (paid visibility)                  │
│  └── 🔗 Referral Earnings                                   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Database Schema (All Tables)

All tables use UUID PKs and follow ExamForge Drizzle conventions.
Adapted from PadVik's BIGINT pattern.

### 2.1 Creator Profile

```sql
CREATE TABLE creator_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,

  -- Identity
  display_name VARCHAR(255) NOT NULL,
  bio TEXT,
  avatar_url VARCHAR(1000),
  cover_image_url VARCHAR(1000),
  institution VARCHAR(255),
  institution_type VARCHAR(30),
    -- independent | institute | student_creator | publisher
  qualification VARCHAR(255),

  -- What they cover (exam-focused, not board-focused)
  specializations JSONB DEFAULT '[]',     -- ["Pharmacology", "Organic Chemistry"]
  exams_covered JSONB DEFAULT '[]',       -- ["GPAT", "NEET UG", "Kerala PSC"]

  -- Verification
  verification_status VARCHAR(20) NOT NULL DEFAULT 'unverified',
    -- unverified | verified | premium
  kyc_status VARCHAR(20) DEFAULT 'pending',
  kyc_details JSONB DEFAULT '{}',

  -- Creator plan
  creator_tier VARCHAR(20) NOT NULL DEFAULT 'free',
    -- free | pro_creator | institute
  creator_plan_expires_at TIMESTAMPTZ,

  -- Payout
  payout_upi VARCHAR(100),
  payout_bank JSONB,                      -- { accountNumber, ifsc, accountName } encrypted
  pan_number VARCHAR(10),
  gst_number VARCHAR(15),

  -- Stats (cached)
  follower_count INTEGER DEFAULT 0,
  content_count INTEGER DEFAULT 0,
  total_views INTEGER DEFAULT 0,
  total_students INTEGER DEFAULT 0,
  total_sales INTEGER DEFAULT 0,
  total_revenue_earned INTEGER DEFAULT 0, -- paisa
  average_rating REAL DEFAULT 0,
  total_ratings INTEGER DEFAULT 0,

  -- Social
  website_url VARCHAR(500),
  youtube_url VARCHAR(500),
  social_links JSONB DEFAULT '{}',

  -- Promotional
  promotional_banner_url VARCHAR(1000),
  promotional_text TEXT,
  is_promoted BOOLEAN DEFAULT false,
  promoted_until TIMESTAMPTZ,

  is_featured BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 2.2 Creator Content (Universal — all content types)

```sql
CREATE TABLE creator_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES creator_profiles(id) ON DELETE CASCADE,

  -- Content type
  content_type VARCHAR(30) NOT NULL,
    -- video | audio | note | document | question_set | image | course | live_session | promotional
  title VARCHAR(500) NOT NULL,
  description TEXT,
  body TEXT,                               -- for text/note content (markdown)
  slug VARCHAR(600) UNIQUE,

  -- File storage
  file_upload_id UUID REFERENCES file_uploads(id),
  original_file_name VARCHAR(500),
  original_file_type VARCHAR(100),
  original_file_size_bytes INTEGER,

  -- Processed media
  media_url TEXT,                          -- processed URL (HLS for video, AAC for audio)
  processed_url TEXT,                      -- alternate processed format
  thumbnail_url TEXT,
  duration_seconds INTEGER,               -- for video/audio

  -- Exam mapping (ExamForge-specific)
  exam_id UUID REFERENCES exams(id),
  syllabus_id UUID REFERENCES syllabi(id),
  syllabus_node_id UUID REFERENCES syllabus_nodes(id),
  subject VARCHAR(255),
  topic VARCHAR(255),

  -- Pricing
  is_premium BOOLEAN NOT NULL DEFAULT false,
  price_inr INTEGER,                      -- paisa (NULL = free)
  is_promotional BOOLEAN DEFAULT false,
  promotional_expires_at TIMESTAMPTZ,

  -- AI processing
  ai_summary TEXT,
  ai_tags TEXT[] DEFAULT '{}',
  ai_transcript TEXT,                     -- for video/audio (Whisper or Claude)
  ai_quality_score REAL,                  -- 0-1 from AI quality check
  ai_language VARCHAR(10),
  upload_status VARCHAR(20) NOT NULL DEFAULT 'pending',
    -- pending | processing | completed | failed

  -- Verification (ExamForge 6-layer)
  verification_status VARCHAR(20) DEFAULT 'unverified',
  verification_score REAL,
  review_status VARCHAR(20) NOT NULL DEFAULT 'pending',
    -- pending | approved | rejected
  review_notes TEXT,

  -- Stats
  view_count INTEGER DEFAULT 0,
  like_count INTEGER DEFAULT 0,
  share_count INTEGER DEFAULT 0,
  doubt_count INTEGER DEFAULT 0,
  total_watch_minutes INTEGER DEFAULT 0,
  avg_rating REAL DEFAULT 0,

  -- Classroom assignment
  assigned_classrooms UUID[] DEFAULT '{}',

  -- Publishing
  is_published BOOLEAN NOT NULL DEFAULT false,
  published_at TIMESTAMPTZ,
  language VARCHAR(10) NOT NULL DEFAULT 'en',
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 2.3 File Uploads

```sql
CREATE TABLE file_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  storage_key VARCHAR(500) NOT NULL,       -- S3 key
  original_name VARCHAR(500),
  mime_type VARCHAR(100) NOT NULL,
  size_bytes INTEGER NOT NULL,
  public_url TEXT,
  cdn_url TEXT,                            -- CloudFront URL

  -- Processing
  processing_status VARCHAR(20) DEFAULT 'uploaded',
    -- uploaded | processing | processed | failed
  processed_variants JSONB DEFAULT '{}',
    -- { hls_360p, hls_480p, hls_720p, hls_1080p, aac_128k, thumbnail }

  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 2.4 Classrooms

```sql
CREATE TABLE classrooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES creator_profiles(id),

  name VARCHAR(255) NOT NULL,
  description TEXT,

  -- Exam focus (ExamForge mapping)
  exam_id UUID REFERENCES exams(id),
  subject VARCHAR(255),

  -- Access
  join_code VARCHAR(10) NOT NULL UNIQUE,   -- 6-char alphanumeric code
  is_active BOOLEAN NOT NULL DEFAULT true,
  max_students INTEGER NOT NULL DEFAULT 100,
  student_count INTEGER NOT NULL DEFAULT 0,

  -- Pricing
  is_paid BOOLEAN DEFAULT false,
  fee_inr INTEGER,                         -- paisa per month
  billing_cycle VARCHAR(10),               -- monthly | quarterly | yearly | one_time

  -- Settings
  settings JSONB DEFAULT '{}',
    -- { allowDoubts, requireApproval, showLeaderboard, autoAssignContent }
  academic_year VARCHAR(10),

  -- Scheduling
  schedule JSONB DEFAULT '{}',
    -- { days: ["mon","wed","fri"], time: "18:00", timezone: "Asia/Kolkata" }
  next_live_session TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE classroom_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id UUID NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  role VARCHAR(20) NOT NULL DEFAULT 'student',
    -- student | monitor | assistant
  status VARCHAR(20) NOT NULL DEFAULT 'active',
    -- active | removed | left | pending_approval

  -- Subscription (if paid classroom)
  subscription_status VARCHAR(20),
    -- active | expired | cancelled
  subscription_expires_at TIMESTAMPTZ,
  payment_order_id UUID REFERENCES payment_orders(id),

  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  removed_at TIMESTAMPTZ,

  UNIQUE(classroom_id, student_id)
);

-- Assignments: teacher assigns content/exams to classroom
CREATE TABLE classroom_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id UUID NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,

  -- What's assigned
  assignment_type VARCHAR(30) NOT NULL,
    -- content | exam | question_set | tutorial
  content_id UUID REFERENCES creator_content(id),
  exam_session_config JSONB,              -- for exam assignments: { questionCount, timeLimit, ... }

  title VARCHAR(500) NOT NULL,
  instructions TEXT,

  -- Schedule
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  due_at TIMESTAMPTZ,

  -- Tracking
  total_students INTEGER DEFAULT 0,
  completed_count INTEGER DEFAULT 0,
  average_score REAL,

  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Track individual student progress on assignments
CREATE TABLE assignment_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES classroom_assignments(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id),

  status VARCHAR(20) NOT NULL DEFAULT 'pending',
    -- pending | started | submitted | graded
  score REAL,
  time_spent_seconds INTEGER,
  submitted_at TIMESTAMPTZ,

  -- For exam assignments
  exam_session_id UUID REFERENCES exam_sessions(id),

  -- Teacher feedback
  feedback TEXT,
  graded_by UUID REFERENCES users(id),
  graded_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(assignment_id, student_id)
);
```

### 2.5 Doubts

```sql
CREATE TABLE doubts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  creator_id UUID REFERENCES users(id),
  content_id UUID REFERENCES creator_content(id),
  syllabus_node_id UUID REFERENCES syllabus_nodes(id),
  classroom_id UUID REFERENCES classrooms(id),

  question_text TEXT NOT NULL,
  question_images JSONB DEFAULT '[]',      -- [{ url, caption }]

  status VARCHAR(20) NOT NULL DEFAULT 'open',
    -- open | ai_answered | creator_answered | closed
  upvote_count INTEGER DEFAULT 0,
  is_public BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE doubt_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doubt_id UUID NOT NULL REFERENCES doubts(id) ON DELETE CASCADE,
  responder_id UUID NOT NULL REFERENCES users(id),

  response_text TEXT NOT NULL,
  response_type VARCHAR(20) NOT NULL DEFAULT 'text',
    -- text | audio | video
  media_url TEXT,

  is_ai BOOLEAN DEFAULT false,
  is_accepted BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 2.6 Live Sessions

```sql
CREATE TABLE live_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES creator_profiles(id),
  classroom_id UUID REFERENCES classrooms(id),

  title VARCHAR(500) NOT NULL,
  description TEXT,

  -- Scheduling
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER DEFAULT 60,
  status VARCHAR(20) NOT NULL DEFAULT 'scheduled',
    -- scheduled | live | ended | cancelled

  -- Meeting
  meeting_type VARCHAR(20) NOT NULL DEFAULT 'embedded',
    -- embedded (WebRTC) | google_meet | zoom | youtube_live
  meeting_url TEXT,
  meeting_id VARCHAR(100),

  -- Recording
  is_recorded BOOLEAN DEFAULT false,
  recording_url TEXT,                      -- S3 URL after processing
  recording_upload_id UUID REFERENCES file_uploads(id),

  -- Exam mapping
  exam_id UUID REFERENCES exams(id),
  subject VARCHAR(255),
  topic VARCHAR(255),

  -- Stats
  max_attendees INTEGER DEFAULT 0,
  peak_concurrent INTEGER DEFAULT 0,
  total_watch_minutes INTEGER DEFAULT 0,

  -- Access
  is_free BOOLEAN DEFAULT true,
  price_inr INTEGER,                      -- paisa if paid

  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE live_session_attendees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES live_sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  left_at TIMESTAMPTZ,
  watch_seconds INTEGER DEFAULT 0,
  UNIQUE(session_id, user_id)
);
```

### 2.7 Marketplace + Earnings (from earlier spec)

```sql
-- marketplace_listings  — same as CREATORS_REVENUE_MODEL.md section 5
-- marketplace_purchases — same
-- creator_wallets       — same
-- creator_earnings      — same
-- content_ratings       — same
-- subscription_pool     — same
-- (not repeated here to avoid duplication — refer to that document)
```

### 2.8 Creator Followers + Content Views

```sql
CREATE TABLE creator_followers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES creator_profiles(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(creator_id, student_id)
);

CREATE TABLE content_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID NOT NULL REFERENCES creator_content(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  creator_id UUID REFERENCES creator_profiles(id),
  classroom_id UUID REFERENCES classrooms(id),

  watched_seconds INTEGER NOT NULL DEFAULT 0,
  completed BOOLEAN DEFAULT false,
  credit_cost INTEGER DEFAULT 0,           -- credits consumed for this view

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 2.9 Promotional Content

```sql
CREATE TABLE promotions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id UUID NOT NULL REFERENCES creator_profiles(id),

  promotion_type VARCHAR(30) NOT NULL,
    -- banner | featured_content | search_boost | homepage_card

  -- What's promoted
  content_id UUID REFERENCES creator_content(id),
  listing_id UUID REFERENCES marketplace_listings(id),
  classroom_id UUID REFERENCES classrooms(id),

  -- Display
  banner_image_url VARCHAR(1000),
  headline VARCHAR(255),
  description TEXT,
  cta_text VARCHAR(100),                   -- "Join Now", "Start Learning"
  cta_url VARCHAR(500),

  -- Targeting
  target_exams JSONB DEFAULT '[]',         -- show to users preparing for these exams
  target_subjects JSONB DEFAULT '[]',

  -- Budget
  budget_type VARCHAR(20) NOT NULL,
    -- fixed_duration | per_click | per_impression
  budget_amount_inr INTEGER,               -- paisa
  spent_amount_inr INTEGER DEFAULT 0,

  -- Performance
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,           -- signups, purchases, follows

  -- Schedule
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
    -- pending | active | paused | completed | rejected

  approved_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 3. Media Processing Pipeline

### 3.1 Video Processing

```
Creator uploads video (MP4/WebM, max 2GB)
    │
    ▼
Store original: s3://examforge-media/creators/{creatorId}/{contentId}/original.mp4
    │
    ▼
Queue: 'media-processing' job type: 'transcode-video'
    │
    ▼
AWS MediaConvert (or FFmpeg on ECS for cost savings):
    ├── 360p  — 500kbps  (mobile, low bandwidth)
    ├── 480p  — 1Mbps    (default quality)
    ├── 720p  — 2.5Mbps  (Pro subscribers)
    └── 1080p — 5Mbps    (Premium only)
    Output: HLS adaptive bitrate (.m3u8 + .ts segments)
    │
    ▼
Store segments: s3://examforge-media/creators/{creatorId}/{contentId}/hls/
    │
    ▼
CDN: CloudFront distribution with signed URLs
    ├── Free content: public CloudFront URL
    ├── Premium content: signed URL (4-hour expiry)
    └── Classroom content: signed URL (per-session)
    │
    ▼
Generate thumbnail: extract frame at 10% duration → resize → S3
    │
    ▼
AI processing (parallel):
    ├── Whisper API → transcript (for search + AI tutor context)
    ├── Claude Haiku → summary + tags
    └── Language detection
    │
    ▼
Update creator_content: media_url, thumbnail_url, duration_seconds,
  ai_transcript, ai_summary, ai_tags, upload_status='completed'
```

### 3.2 Audio Processing

```
Creator uploads audio (MP3/WAV/M4A, max 500MB)
    │
    ▼
Store original: s3://examforge-media/creators/{creatorId}/{contentId}/original.*
    │
    ▼
Transcode to AAC 128kbps (universal playback):
    Output: .m4a file
    │
    ▼
CDN delivery (same as video)
    │
    ▼
AI: Whisper transcription → summary → tags
```

### 3.3 Handwritten Notes OCR

This is the PadVik pattern — creator uploads photos of handwritten notes,
AI converts to searchable digital text.

```
Creator uploads image(s) of handwritten notes
    ├── Single image or batch (up to 20 images)
    │
    ▼
Store originals in S3
    │
    ▼
For each image:
    ├── Claude Vision (Sonnet 4) with OCR prompt:
    │   "This is a handwritten educational note. Extract ALL text,
    │    preserving structure: headings, bullet points, formulas,
    │    diagrams (describe), tables. Output clean Markdown."
    │
    ├── If "handwritten" flag is set, use enhanced OCR prompt:
    │   buildOcrPrompt() → detects: headings, equations, diagrams,
    │   numbered lists, highlighted text, margin notes
    │
    └── Output: structured Markdown with:
        ├── Headings preserved
        ├── Formulas in LaTeX notation
        ├── Diagrams described: "[Diagram: feedback loop showing...]"
        ├── Tables reconstructed
        └── Margin notes as aside blocks
    │
    ▼
Save as creator_content with:
    body = extracted Markdown
    content_type = 'document'
    metadata = { isHandwritten: true, ocrModel: 'claude-sonnet-4', pageCount: N }
    │
    ▼
AI quality check + auto-tagging
    │
    ▼
Published (after review if unverified creator)
```

### 3.4 Document Processing (PDF/DOCX)

```
Creator uploads PDF or DOCX (max 50MB)
    │
    ▼
Store original in S3
    │
    ▼
Extract text:
    ├── DOCX: mammoth.js → HTML → Markdown
    ├── PDF (text-based): pdf-parse → text
    └── PDF (scanned): Claude Vision OCR (page by page)
    │
    ▼
AI processing:
    ├── Summary + tags
    ├── Question extraction (if document contains MCQs)
    ├── Key terms extraction
    └── Syllabus node auto-mapping
    │
    ▼
Save to creator_content with body = extracted text
```

---

## 4. Classroom System

### 4.1 Institute Creates Classroom

```
Institute creator → "Create Classroom"
    │
    ├── Name: "GPAT 2026 Batch — Morning"
    ├── Exam: GPAT (dropdown)
    ├── Subject: All / Pharmacology / Specific
    ├── Max students: 50
    ├── Pricing: Free / ₹999/month / ₹2,499/quarter
    ├── Schedule: Mon/Wed/Fri 6:00 PM IST
    └── Settings: allow doubts, show leaderboard, auto-assign
    │
    ▼
System generates join code: "GPT26M" (6-char unique)
    │
    ▼
Creator shares code → students join
```

### 4.2 Student Joins Classroom

```
Student enters join code or scans QR
    │
    ▼
If free classroom: instant join
If paid classroom:
    ├── Show pricing: "₹999/month for GPAT 2026 Morning Batch"
    ├── Razorpay checkout
    ├── On success: join classroom + create subscription
    └── Auto-renew monthly (student can cancel)
    │
    ▼
Student sees classroom in sidebar:
    ├── Assigned content (ordered curriculum)
    ├── Upcoming live sessions
    ├── Assignments (with due dates)
    ├── Leaderboard (scores among classmates)
    ├── Doubt board (classroom-scoped)
    └── Class announcements
```

### 4.3 Teacher Manages Classroom

```
Creator Dashboard → Classrooms → "GPAT 2026 Morning"
    │
    ├── STUDENTS tab:
    │   ├── List with: name, join date, progress %, last active
    │   ├── Remove student / change role (monitor/assistant)
    │   └── Bulk message
    │
    ├── CONTENT tab:
    │   ├── Assign existing content to this classroom
    │   ├── Upload new content (auto-assigned to this class)
    │   ├── Drag-and-drop ordering (curriculum sequence)
    │   └── Per-content stats: who viewed, completion rate
    │
    ├── ASSIGNMENTS tab:
    │   ├── Create assignment: pick exam/content + set due date
    │   ├── View submissions: score, time, completion
    │   ├── Grade descriptive assignments (manual)
    │   └── Export results as CSV
    │
    ├── LIVE SESSIONS tab:
    │   ├── Schedule new session (date, time, topic)
    │   ├── Start live session (opens meet link or WebRTC)
    │   ├── Past recordings (auto-saved)
    │   └── Attendance tracking
    │
    ├── DOUBTS tab:
    │   ├── Classroom doubt board
    │   ├── Unanswered doubts highlighted
    │   └── AI auto-answers for common questions
    │
    └── ANALYTICS tab:
        ├── Class average scores over time
        ├── Per-student progress
        ├── Topic-wise strengths/weaknesses
        ├── Attendance trends
        └── Revenue from this classroom
```

---

## 5. Promotional Content System

### 5.1 What Creators Can Promote

```
PROMOTION TYPES:

1. BANNER AD
   ├── Image + headline + CTA
   ├── Shown on: exam landing pages, dashboard sidebar
   ├── Targeting: by exam, subject, location
   └── Budget: ₹500/day or ₹5/click

2. FEATURED CONTENT
   ├── Creator's content highlighted in search/browse
   ├── "Sponsored" badge shown to users
   ├── Higher ranking in content listings
   └── Budget: ₹200/day

3. SEARCH BOOST
   ├── Content appears higher in search results
   ├── When user searches relevant topic
   ├── No visible "ad" label (organic-feeling)
   └── Budget: ₹3/impression

4. HOMEPAGE CARD
   ├── Featured card on user's dashboard
   ├── "Recommended by [Creator Name]"
   ├── Links to: content, classroom, or marketplace listing
   └── Budget: ₹1,000/day (premium placement)

5. FREE PREVIEW CONTENT
   ├── Creator publishes free content that acts as a funnel
   ├── Free tutorial → "Want more? Join my classroom for ₹999/mo"
   ├── Free 10 questions → "Full 500-question set on marketplace: ₹299"
   └── No budget needed — organic promotion through quality
```

### 5.2 Promotion Flow

```
Creator → "Promote Content"
    │
    ├── Select what to promote (content, listing, classroom)
    ├── Choose promotion type (banner, featured, search boost, homepage)
    ├── Set targeting (exams, subjects)
    ├── Set budget and duration
    ├── Upload creative (banner image, headline)
    ├── Preview
    └── Submit for admin approval
    │
    ▼
Admin reviews: approve / reject / request changes
    │
    ▼
If approved: starts running on scheduled date
    │
    ▼
Creator sees in analytics:
    ├── Impressions, clicks, conversions
    ├── Spend vs budget remaining
    └── ROI: revenue generated from promotion
```

---

## 6. Creator's AI Tutor (RAG on Creator Content)

From PadVik — each creator can have an AI tutor trained on their content:

```
Student opens creator's content → taps "Ask [Creator Name]'s AI"
    │
    ▼
System:
    1. Query creator's published content via embedding similarity
       (creator_content.ai_transcript + body + ai_summary)
    2. Inject relevant chunks as RAG context
    3. Send to Claude with system prompt:
       "You are [Creator Name]'s AI teaching assistant.
        Answer based on the creator's published content.
        If the answer is not in the content, say so."
    4. Stream response
    │
    ▼
User sees: "Ask Dr. Priya's AI" with the creator's avatar
    │
    ▼
Branding: feels like the teacher's own assistant
Credits: 1 per question (from student's credits)
Revenue: counted as "view" for creator's subscription pool share
```

---

## 7. Revenue Model (Updated with All Features)

### 7.1 Revenue Streams

```
PLATFORM REVENUE:

1. User subscriptions:           ₹45,00,000/month (unchanged)
2. Marketplace commission (30%): ₹3,00,000/month
3. Creator subscriptions:        ₹2,00,000/month
4. Classroom fees (15% cut):     ₹2,25,000/month
   (100 paid classrooms × ₹1,500 avg × 15%)
5. Promotional revenue:          ₹1,50,000/month
   (50 active promotions × ₹1,000 avg/week)
6. Featured placement:           ₹1,00,000/month
7. Live session tickets (10%):   ₹50,000/month

TOTAL:                           ₹55,25,000/month

CREATOR REVENUE:
1. Marketplace sales (70%):      ₹7,00,000/month (across all creators)
2. Subscription pool:            ₹9,00,000/month (20% of sub revenue)
3. Classroom fees (85%):         ₹12,75,000/month
4. Live session revenue (90%):   ₹4,50,000/month
5. Tips:                         ₹1,00,000/month

Top creators earning:            ₹1-3 lakh/month
Average active creator:          ₹15,000-40,000/month
```

### 7.2 Creator Subscription Plans

| Feature              | Free Creator              | Pro Creator (₹499/mo) | Institute (₹4,999/mo)      |
| -------------------- | ------------------------- | --------------------- | -------------------------- |
| Content uploads      | 50 questions, 5 tutorials | Unlimited             | Unlimited                  |
| Marketplace          | ❌                        | ✅                    | ✅                         |
| Revenue share        | ❌                        | 70%                   | 80%                        |
| Classrooms           | 1 (max 20 students)       | 5 (max 100 each)      | Unlimited (max 500 each)   |
| Live sessions        | ❌                        | 5/month               | Unlimited                  |
| Video upload         | ❌                        | 10GB/month            | 100GB/month                |
| AI tutor on content  | ❌                        | ✅                    | ✅ branded                 |
| Analytics            | Basic (views)             | Detailed              | Full + export              |
| Promotions           | ❌                        | ✅                    | ✅ discounted              |
| Team members         | 1                         | 1                     | 10                         |
| Doubt management     | Limited                   | Unlimited             | Unlimited + AI auto-reply  |
| Branding/white-label | ❌                        | ❌                    | ✅ custom logo + colors    |
| Support              | Community                 | Email                 | Priority + onboarding call |

---

## 8. File Locations

```
Database:
  packages/shared/src/db/schema/
    ├── creator-profiles.ts
    ├── creator-content.ts
    ├── file-uploads.ts
    ├── classrooms.ts
    ├── classroom-members.ts
    ├── classroom-assignments.ts
    ├── assignment-submissions.ts
    ├── doubts.ts
    ├── doubt-responses.ts
    ├── live-sessions.ts
    ├── live-session-attendees.ts
    ├── creator-followers.ts
    ├── content-views.ts
    ├── promotions.ts
    ├── marketplace-listings.ts
    ├── marketplace-purchases.ts
    ├── creator-wallets.ts
    ├── creator-earnings.ts
    ├── content-ratings.ts
    └── subscription-pool.ts

API (tRPC routers):
  apps/api/src/routers/
    ├── creator.ts              — profile, register, browse
    ├── creator-content.ts      — upload, manage, publish
    ├── classroom.ts            — CRUD, members, assignments
    ├── doubt.ts                — ask, inbox, respond
    ├── live-session.ts         — schedule, start, attend
    ├── marketplace.ts          — listings, purchase, browse
    ├── creator-earnings.ts     — wallet, history, payout
    ├── promotion.ts            — create, manage, analytics

Workers:
  apps/api/src/workers/
    ├── media-processing-worker.ts  — video transcode + audio + OCR
    ├── promotion-worker.ts         — impression tracking, budget enforcement

Frontend:
  apps/web/src/app/
    ├── (dashboard)/creator/            — creator dashboard
    │   ├── page.tsx                    — creator hub
    │   ├── register/page.tsx           — become a creator
    │   ├── content/                    — manage content
    │   ├── classrooms/                 — manage classrooms
    │   ├── doubts/                     — doubt inbox
    │   ├── earnings/                   — wallet + payout
    │   ├── analytics/                  — stats
    │   ├── promotions/                 — manage promotions
    │   ├── live/                       — live sessions
    │   └── profile/                    — edit profile
    ├── marketplace/                    — public marketplace
    │   ├── page.tsx                    — browse
    │   └── [slug]/page.tsx             — listing detail
    ├── creators/                       — public creator directory
    │   ├── page.tsx                    — browse creators
    │   └── [id]/page.tsx               — creator profile
    └── (dashboard)/dashboard/
        ├── classroom/                  — student's classroom view
        │   ├── page.tsx                — my classrooms
        │   └── [id]/page.tsx           — classroom detail
        └── doubts/                     — student's doubts
```

---

## 9. Implementation Phases

### Phase A (Month 1-2): Creator Foundation

- Tables: creator_profiles, creator_content, file_uploads, creator_followers, content_views
- Registration flow, profile page, content upload (text + document + image)
- Basic verification integration
- Creator dashboard with stats
- Browse creators (public)

### Phase B (Month 2-3): Marketplace + Earnings

- Tables: marketplace_listings, purchases, creator_wallets, creator_earnings, content_ratings
- Listing creation, purchase flow, Razorpay integration
- Revenue split automation, wallet, payout
- Marketplace browse + search

### Phase C (Month 3-4): Media + Classrooms

- Tables: classrooms, classroom_members, assignments, submissions, live_sessions
- Video upload + HLS transcoding (MediaConvert or FFmpeg)
- Audio upload + AAC transcode
- Handwritten notes OCR (Claude Vision)
- Classroom creation, join code, member management
- Assignment system, grading

### Phase D (Month 4-5): Live + Promotions + Polish

- Tables: live_sessions, live_session_attendees, promotions
- Live session scheduling + recording
- Doubt system (student-creator + AI auto-answer)
- Promotional content system
- Creator's branded AI tutor (RAG)
- Creator analytics dashboard
- Subscription pool monthly distribution

### Phase E (Month 5-6): Growth

- Cross-platform creator identity (PadVik ↔ ExamForge)
- Institute white-label features
- API access for institutes
- Creator referral program
- Advanced analytics + recommendations

````

---

## 10. Feature Flags

```typescript
// ALL disabled at launch — enable one by one
const CREATOR_FLAGS = [
  { key: 'creators.enabled', value: false, category: 'creators' },
  { key: 'creators.registration_open', value: false, category: 'creators' },
  { key: 'creators.marketplace_enabled', value: false, category: 'creators' },
  { key: 'creators.classrooms_enabled', value: false, category: 'creators' },
  { key: 'creators.live_sessions_enabled', value: false, category: 'creators' },
  { key: 'creators.video_upload_enabled', value: false, category: 'creators' },
  { key: 'creators.audio_upload_enabled', value: false, category: 'creators' },
  { key: 'creators.ocr_enabled', value: false, category: 'creators' },
  { key: 'creators.promotions_enabled', value: false, category: 'creators' },
  { key: 'creators.doubts_enabled', value: false, category: 'creators' },
  { key: 'creators.ai_tutor_enabled', value: false, category: 'creators' },
  { key: 'creators.paid_classrooms_enabled', value: false, category: 'creators' },
  { key: 'creators.revenue_share_verified', value: 70, category: 'creators' },
  { key: 'creators.revenue_share_premium', value: 80, category: 'creators' },
  { key: 'creators.subscription_pool_percent', value: 20, category: 'creators' },
  { key: 'creators.classroom_platform_fee_percent', value: 15, category: 'creators' },
  { key: 'creators.min_payout_inr', value: 500, category: 'creators' },
  { key: 'creators.max_video_size_mb', value: 2048, category: 'creators' },
  { key: 'creators.max_audio_size_mb', value: 500, category: 'creators' },
  { key: 'creators.kyc_required_for_payout', value: true, category: 'creators' },
  { key: 'creators.auto_publish_threshold', value: 0.75, category: 'creators' },
];
````
