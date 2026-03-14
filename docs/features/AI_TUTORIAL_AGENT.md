# Feature: AI Tutorial Agent — Auto-Generate Rich Tutorials from Syllabus

> **Priority:** P0 — Core learning experience for MVP
> **Branch:** `feat/tutorial-agent`
> **Depends on:** Syllabus Pipeline (syllabus_nodes in DB), Auth/Subscriptions, Credit System
> **Key decision:** Tutorials saved as HTML files on S3, NOT in database.

---

## 1. What the Agent Does

```
┌─────────────────────────────────────────────────────────┐
│                  AI TUTORIAL AGENT                        │
│                                                          │
│  INPUT (automatic — no manual feeding):                  │
│  ├── Syllabus PDF path (from syllabi.file_key in DB)    │
│  ├── Extracted text (from syllabi.raw_text in DB)       │
│  ├── Syllabus tree (from syllabus_nodes in DB)          │
│  └── Exam context (name, pattern, conducting body)      │
│                                                          │
│  PROCESSING:                                             │
│  ├── Agent walks the syllabus tree node by node         │
│  ├── For each topic: generates a rich HTML tutorial     │
│  │   ├── Structured content with headings               │
│  │   ├── Mermaid diagrams / SVG visualizations          │
│  │   ├── Tables for classifications & comparisons       │
│  │   ├── Highlighted definitions & formulas             │
│  │   ├── Mnemonics & memory aids                        │
│  │   ├── Clinical/practical applications                │
│  │   ├── Reference links to standard textbooks          │
│  │   └── "Key Points for Exam" summary box              │
│  ├── Generates exam questions per topic (on demand)     │
│  └── Tracks progress across entire syllabus             │
│                                                          │
│  OUTPUT:                                                 │
│  ├── HTML files stored on S3 (one per syllabus node)    │
│  ├── DB records in tutorial_files (metadata + S3 path)  │
│  ├── Free preview HTML (truncated) for free users       │
│  └── User-specific exam questions (owner_type='user')   │
└─────────────────────────────────────────────────────────┘
```

---

## 2. Tutorial Storage Architecture

### Why HTML files on S3 instead of DB?

A single tutorial for a topic can be 10-50KB of rich HTML. A full syllabus
with 200+ topics = 2-10MB of tutorial content. Across 100 exams = 200MB-1GB
in the database, growing linearly. HTML files on S3 + CloudFront:

- Zero DB storage cost for content
- CDN-cached globally (fast loads in India)
- Cheap: S3 Standard = $0.023/GB, CloudFront serves cached
- Easy to regenerate (overwrite file, same URL)
- Browser renders HTML natively (no parsing needed)
- Can include inline CSS, SVG, Mermaid diagrams

### File Structure on S3

```
s3://examforge-tutorials/
  └── {examId}/
      └── {syllabusId}/
          ├── _index.html              ← syllabus overview / table of contents
          ├── unit-1/
          │   ├── _index.html          ← unit overview
          │   ├── topic-1-1.html       ← "Introduction to Dosage Forms"
          │   ├── topic-1-2.html       ← "Tablet Technology"
          │   ├── topic-1-2-preview.html  ← FREE preview (first 30% of content)
          │   └── topic-1-3.html
          ├── unit-2/
          │   ├── _index.html
          │   ├── topic-2-1.html
          │   └── topic-2-1-preview.html
          └── _metadata.json           ← generation info, word counts, timestamps
```

### Access Control

HTML files on S3 are NOT publicly accessible. Access is through the API:

```
User requests tutorial for topic-1-2
    │
    ▼
API checks:
    ├── Is user authenticated? (required)
    ├── Is this a free preview topic? → serve preview HTML
    ├── Is user on Free plan?
    │   ├── First 5 topics per exam → serve full HTML (free quota)
    │   └── Beyond 5 → return { locked: true, previewHtml, upgradeMessage }
    ├── Is user on Pro/Premium? → serve full HTML
    └── Deduct 1 credit if applicable
    │
    ▼
API generates S3 presigned URL (expires: 1 hour) or streams HTML content
```

---

## 3. Database Schema

### 3.1 New Table: `tutorial_files`

This is the metadata table. Actual content is in S3 HTML files.

```sql
CREATE TABLE tutorial_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  syllabus_node_id UUID NOT NULL REFERENCES syllabus_nodes(id) ON DELETE CASCADE,
  syllabus_id UUID NOT NULL REFERENCES syllabi(id) ON DELETE CASCADE,
  exam_id UUID NOT NULL REFERENCES exams(id),

  -- File storage
  file_key VARCHAR(500) NOT NULL,           -- S3 key: {examId}/{syllabusId}/unit-1/topic-1-1.html
  file_url VARCHAR(1000),                   -- CloudFront URL (for CDN delivery)
  preview_file_key VARCHAR(500),            -- S3 key for free preview version
  preview_file_url VARCHAR(1000),
  file_size_bytes INTEGER,

  -- Content metadata (stored here so we don't need to read the HTML)
  title VARCHAR(500) NOT NULL,
  word_count INTEGER,
  estimated_read_minutes INTEGER,
  sections_count INTEGER,                   -- number of major sections
  has_diagrams BOOLEAN DEFAULT false,
  has_formulas BOOLEAN DEFAULT false,
  has_tables BOOLEAN DEFAULT false,
  has_mnemonics BOOLEAN DEFAULT false,
  key_terms JSONB DEFAULT '[]',             -- extracted key terms for search
  reference_links JSONB DEFAULT '[]',       -- [{ title, url, source }]

  -- Generation info
  version INTEGER NOT NULL DEFAULT 1,
  is_current BOOLEAN DEFAULT true,          -- latest version flag
  generated_by VARCHAR(50) NOT NULL,        -- 'agent' | 'manual' | 'regenerated'
  ai_providers_used JSONB DEFAULT '[]',     -- ["claude", "gemini"]
  ai_tokens_used INTEGER DEFAULT 0,
  ai_cost_usd REAL DEFAULT 0,
  generation_config JSONB DEFAULT '{}',     -- prompt version, model params

  -- Access tracking
  is_free_preview BOOLEAN DEFAULT false,    -- always accessible (first N per exam)
  free_preview_percentage INTEGER DEFAULT 30,  -- % of content in preview
  total_views INTEGER DEFAULT 0,
  unique_viewers INTEGER DEFAULT 0,

  -- Ownership (always platform for agent-generated)
  owner_type VARCHAR(10) NOT NULL DEFAULT 'platform',
  visibility VARCHAR(20) NOT NULL DEFAULT 'public',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tutorial_files_node ON tutorial_files(syllabus_node_id)
  WHERE is_current = true;
CREATE INDEX idx_tutorial_files_syllabus ON tutorial_files(syllabus_id);
CREATE INDEX idx_tutorial_files_exam ON tutorial_files(exam_id);
```

### 3.2 New Table: `user_generated_exams`

User-requested exams that are completely separate from admin/platform exams.

```sql
CREATE TABLE user_generated_exams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  exam_id UUID NOT NULL REFERENCES exams(id),
  syllabus_node_id UUID REFERENCES syllabus_nodes(id),  -- topic the exam is about

  title VARCHAR(500) NOT NULL,                -- "Pharmacology — Drug Metabolism Practice"
  description TEXT,

  -- Question storage (JSONB — these are personal, not shared)
  questions JSONB NOT NULL,
    -- Array of full question objects:
    -- [{ question, options, answer, explanation, difficulty, subject, questionNumber }]
  question_count INTEGER NOT NULL,
  difficulty_distribution JSONB DEFAULT '{}',
    -- { easy: 5, medium: 10, hard: 5 }
  time_limit_minutes INTEGER,

  -- Generation info
  ai_provider VARCHAR(50),
  ai_tokens_used INTEGER DEFAULT 0,
  ai_cost_usd REAL DEFAULT 0,
  source_tutorial_id UUID REFERENCES tutorial_files(id),

  -- Usage
  times_attempted INTEGER DEFAULT 0,
  best_score REAL,
  last_attempted_at TIMESTAMPTZ,

  -- Ownership (ALWAYS user-owned, never collides with platform)
  owner_type VARCHAR(10) NOT NULL DEFAULT 'user',
  owner_id UUID NOT NULL REFERENCES users(id),
  visibility VARCHAR(20) NOT NULL DEFAULT 'private',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_exams_gen_user ON user_generated_exams(user_id);
CREATE INDEX idx_user_exams_gen_exam ON user_generated_exams(exam_id);
CREATE INDEX idx_user_exams_gen_node ON user_generated_exams(syllabus_node_id);
```

### 3.3 New Table: `tutorial_generation_jobs`

Tracks the agent's progress across an entire syllabus.

```sql
CREATE TABLE tutorial_generation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  syllabus_id UUID NOT NULL REFERENCES syllabi(id),
  exam_id UUID NOT NULL REFERENCES exams(id),

  status VARCHAR(20) NOT NULL DEFAULT 'queued',
    -- queued | running | paused | completed | error
  total_nodes INTEGER NOT NULL,             -- total topics to generate
  completed_nodes INTEGER DEFAULT 0,
  failed_nodes INTEGER DEFAULT 0,
  current_node_id UUID REFERENCES syllabus_nodes(id),
  current_node_title VARCHAR(500),

  -- Config
  ai_providers JSONB NOT NULL DEFAULT '["claude"]',
  generate_previews BOOLEAN DEFAULT true,
  preview_percentage INTEGER DEFAULT 30,
  include_diagrams BOOLEAN DEFAULT true,
  include_mnemonics BOOLEAN DEFAULT true,
  include_references BOOLEAN DEFAULT true,

  -- Cost tracking
  total_tokens INTEGER DEFAULT 0,
  total_cost_usd REAL DEFAULT 0,

  -- Progress
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_log JSONB DEFAULT '[]',
  progress_log JSONB DEFAULT '[]',
    -- [{ nodeId, title, status, startedAt, completedAt, wordCount }]

  created_by UUID REFERENCES users(id),     -- admin who triggered it
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

---

## 4. HTML Tutorial Template

The agent generates each tutorial as a standalone HTML file with inline
CSS and inline SVG/Mermaid diagrams. No external dependencies.

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>{{topic_title}} — {{exam_name}} | ExamForge</title>
    <style>
      /* Embedded CSS — dark theme matching ExamForge brand */
      :root {
        --bg: #0a0e17;
        --surface: #111827;
        --border: #1e293b;
        --text: #e2e8f0;
        --muted: #94a3b8;
        --accent: #6366f1;
        --success: #10b981;
        --warning: #f59e0b;
        --danger: #ef4444;
      }
      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }
      body {
        font-family: "Segoe UI", system-ui, sans-serif;
        background: var(--bg);
        color: var(--text);
        line-height: 1.7;
        padding: 2rem;
        max-width: 860px;
        margin: 0 auto;
      }
      h1 {
        font-size: 1.8rem;
        font-weight: 700;
        margin-bottom: 0.5rem;
        color: #f1f5f9;
      }
      h2 {
        font-size: 1.3rem;
        font-weight: 600;
        margin: 2rem 0 0.75rem;
        color: var(--accent);
        border-bottom: 2px solid var(--border);
        padding-bottom: 0.4rem;
      }
      h3 {
        font-size: 1.1rem;
        font-weight: 600;
        margin: 1.5rem 0 0.5rem;
        color: #f1f5f9;
      }
      p {
        margin-bottom: 1rem;
      }
      /* Definition box */
      .definition {
        background: #6366f110;
        border-left: 4px solid var(--accent);
        padding: 1rem 1.2rem;
        border-radius: 0 8px 8px 0;
        margin: 1rem 0;
      }
      .definition strong {
        color: var(--accent);
      }
      /* Formula box */
      .formula {
        background: #10b98110;
        border: 1px solid #10b98130;
        padding: 1rem 1.2rem;
        border-radius: 8px;
        margin: 1rem 0;
        font-family: "Courier New", monospace;
        font-size: 1.05rem;
        text-align: center;
      }
      /* Mnemonic box */
      .mnemonic {
        background: #f59e0b10;
        border-left: 4px solid var(--warning);
        padding: 1rem 1.2rem;
        border-radius: 0 8px 8px 0;
        margin: 1rem 0;
      }
      .mnemonic::before {
        content: "💡 Mnemonic: ";
        font-weight: 700;
        color: var(--warning);
      }
      /* Exam tip box */
      .exam-tip {
        background: #ef444410;
        border: 1px solid #ef444430;
        padding: 1rem 1.2rem;
        border-radius: 8px;
        margin: 1rem 0;
      }
      .exam-tip::before {
        content: "🎯 Exam Tip: ";
        font-weight: 700;
        color: var(--danger);
      }
      /* Table */
      table {
        width: 100%;
        border-collapse: collapse;
        margin: 1rem 0;
      }
      th {
        background: var(--surface);
        color: var(--accent);
        text-align: left;
        padding: 0.6rem 1rem;
        font-size: 0.85rem;
        border-bottom: 2px solid var(--border);
      }
      td {
        padding: 0.6rem 1rem;
        border-bottom: 1px solid var(--border);
        font-size: 0.9rem;
      }
      tr:nth-child(even) td {
        background: #ffffff05;
      }
      /* Diagram container */
      .diagram {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 1.5rem;
        margin: 1.5rem 0;
        text-align: center;
      }
      .diagram svg {
        max-width: 100%;
      }
      /* References */
      .references {
        background: var(--surface);
        border-radius: 8px;
        padding: 1rem 1.2rem;
        margin: 2rem 0;
        font-size: 0.85rem;
      }
      .references h3 {
        margin-top: 0;
        font-size: 0.95rem;
      }
      .references a {
        color: var(--accent);
        text-decoration: none;
      }
      .references a:hover {
        text-decoration: underline;
      }
      /* Learning objectives */
      .objectives {
        background: var(--surface);
        border-radius: 8px;
        padding: 1rem 1.2rem;
        margin: 1rem 0;
      }
      .objectives li {
        margin-bottom: 0.4rem;
        padding-left: 0.5rem;
      }
      .objectives li::marker {
        color: var(--accent);
      }
      /* Key points summary */
      .key-points {
        background: linear-gradient(135deg, #6366f108, #8b5cf608);
        border: 1px solid #6366f130;
        border-radius: 8px;
        padding: 1.2rem 1.5rem;
        margin: 2rem 0;
      }
      .key-points h3 {
        color: var(--accent);
        margin-top: 0;
      }
      /* Free preview cutoff */
      .preview-cutoff {
        text-align: center;
        padding: 3rem 1rem;
        margin-top: 2rem;
        border-top: 2px dashed var(--border);
      }
      .preview-cutoff h3 {
        color: var(--muted);
      }
      .upgrade-btn {
        display: inline-block;
        background: var(--accent);
        color: white;
        padding: 0.75rem 2rem;
        border-radius: 8px;
        text-decoration: none;
        font-weight: 600;
        margin-top: 1rem;
      }
      /* Responsive */
      @media (max-width: 640px) {
        body {
          padding: 1rem;
        }
        h1 {
          font-size: 1.4rem;
        }
      }
    </style>
  </head>
  <body>
    <nav style="font-size: 0.8rem; color: var(--muted); margin-bottom: 1rem;">
      {{exam_name}} › {{unit_name}} › {{topic_title}}
    </nav>

    <h1>{{topic_title}}</h1>
    <p style="color: var(--muted); font-size: 0.9rem; margin-bottom: 2rem;">
      {{estimated_read_minutes}} min read • {{word_count}} words • Last updated: {{date}}
    </p>

    <!-- Learning Objectives -->
    <div class="objectives">
      <h3>🎯 Learning Objectives</h3>
      <ul>
        <li>Understand the concept of ...</li>
        <li>Differentiate between ...</li>
        <li>Apply knowledge of ... to clinical scenarios</li>
      </ul>
    </div>

    <!-- Main Content Sections (AI generates these) -->
    <h2>1. Introduction</h2>
    <p>...</p>

    <h2>2. Detailed Explanation</h2>
    <p>...</p>

    <div class="definition">
      <strong>Bioavailability:</strong> The fraction of an administered dose of unchanged drug that
      reaches the systemic circulation.
    </div>

    <div class="formula">
      F = (AUC<sub>oral</sub> × Dose<sub>IV</sub>) / (AUC<sub>IV</sub> × Dose<sub>oral</sub>)
    </div>

    <!-- Comparison Table -->
    <table>
      <thead>
        <tr>
          <th>Parameter</th>
          <th>Oral Route</th>
          <th>IV Route</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Bioavailability</td>
          <td>Variable (20-90%)</td>
          <td>100%</td>
        </tr>
        <tr>
          <td>Onset</td>
          <td>30-60 min</td>
          <td>Immediate</td>
        </tr>
      </tbody>
    </table>

    <!-- Inline SVG Diagram -->
    <div class="diagram">
      <h3>Drug Absorption Pathway</h3>
      <svg viewBox="0 0 600 200" xmlns="http://www.w3.org/2000/svg">
        <!-- Agent generates inline SVG diagrams -->
      </svg>
    </div>

    <div class="mnemonic">
      Remember absorption factors with "SALAD": Solubility, Area of absorption, Local blood flow,
      Acid stability, Dosage form.
    </div>

    <div class="exam-tip">
      Kerala PSC frequently asks about first-pass metabolism. Remember: drugs absorbed from the GI
      tract pass through the liver BEFORE reaching systemic circulation. This is why oral
      bioavailability < 100% for most drugs.
    </div>

    <!-- Key Points Summary -->
    <div class="key-points">
      <h3>📋 Key Points for Exam</h3>
      <ul>
        <li>Bioavailability (F) ranges from 0 to 1 (or 0-100%)</li>
        <li>IV administration has F = 1 (100%) by definition</li>
        <li>First-pass metabolism reduces oral bioavailability</li>
      </ul>
    </div>

    <!-- References -->
    <div class="references">
      <h3>📚 References</h3>
      <ul>
        <li><a href="#">Brahmankar & Jaiswal — Biopharmaceutics & Pharmacokinetics, Ch. 3</a></li>
        <li><a href="#">Leon Shargel — Applied Biopharmaceutics, 7th Ed, pp. 45-78</a></li>
        <li><a href="https://www.ncbi.nlm.nih.gov/books/NBK557852/">NCBI — Bioavailability</a></li>
      </ul>
    </div>

    <!-- FREE PREVIEW CUTOFF (only in preview version) -->
    <!--
  <div class="preview-cutoff">
    <h3>🔒 This is a preview. Upgrade to read the full tutorial.</h3>
    <p style="color: var(--muted);">The full tutorial includes 3 more sections,
    2 diagrams, clinical case studies, and 15 practice questions.</p>
    <a href="/pricing" class="upgrade-btn">Upgrade to Pro — ₹299/month</a>
  </div>
  --></body>
</html>
```

---

## 5. AI Agent Architecture

### 5.1 The Tutorial Agent Worker

```
BullMQ Job: generate-tutorials
    │
    ├── Input: { syllabusId, examId, config }
    │
    ├── 1. Load syllabus tree from DB
    │      (all syllabus_nodes ordered by depth + sort_order)
    │
    ├── 2. Load syllabus raw text (from syllabi.raw_text or S3 PDF)
    │
    ├── 3. For each leaf node (topics, not units):
    │   │
    │   ├── a. Build context window:
    │   │      - Exam name, pattern, conducting body
    │   │      - Unit title (parent node)
    │   │      - Topic title + description + key terms
    │   │      - Relevant section of raw syllabus text
    │   │      - Previous topic summary (for continuity)
    │   │
    │   ├── b. Call AI via ai-router (Claude primary):
    │   │      Prompt: "Generate a comprehensive HTML tutorial..."
    │   │      (see section 6 for full prompt)
    │   │
    │   ├── c. Validate: ensure HTML is well-formed
    │   │      - Check for required sections (objectives, content, key points)
    │   │      - Check word count (min 500, target 1500-3000)
    │   │      - Verify no broken HTML tags
    │   │
    │   ├── d. Generate preview version:
    │   │      - Take first 30% of content
    │   │      - Add preview cutoff banner
    │   │      - Save as separate file
    │   │
    │   ├── e. Upload to S3:
    │   │      - Full: {examId}/{syllabusId}/unit-N/topic-N-M.html
    │   │      - Preview: {examId}/{syllabusId}/unit-N/topic-N-M-preview.html
    │   │
    │   ├── f. Create/update tutorial_files record in DB
    │   │
    │   └── g. Update job progress
    │
    ├── 4. Generate syllabus index page (_index.html)
    │      - Table of contents linking all generated tutorials
    │      - Per-unit overview pages
    │
    └── 5. Update tutorial_generation_jobs: completed
```

### 5.2 User Exam Generation (On-Demand)

```
User on tutorial page clicks "Generate Practice Exam"
    │
    ▼
Modal: configure exam
    ├── Topic: "Drug Metabolism" (pre-filled from current topic)
    ├── Questions: [10] (slider 5-50)
    ├── Difficulty: [Mixed / Easy / Medium / Hard]
    ├── Time limit: [15 min] (auto-calculated or custom)
    └── [Generate — costs 5 credits]
    │
    ▼
API: POST /trpc/tutorialAgent.generateUserExam
    │
    ├── 1. Check credits (5 credits for exam generation)
    ├── 2. Load tutorial content (from S3 HTML → strip tags → plain text)
    ├── 3. Send to AI with MCQ generation prompt
    │      Context: tutorial text + syllabus node + exam pattern
    ├── 4. Validate each question via Instructor.js
    ├── 5. Save to user_generated_exams with:
    │      - owner_type = 'user'
    │      - owner_id = requesting user's ID
    │      - questions stored as JSONB (self-contained)
    │      - source_tutorial_id = the tutorial it was generated from
    ├── 6. Deduct credits
    └── 7. Return exam ID → redirect to exam-taking interface
    │
    ▼
User takes exam using EXISTING exam-taking interface
    │
    (The exam interface reads from user_generated_exams.questions
     instead of the questions table. Same UI, different data source.)
    │
    ▼
Results saved to exam_sessions with:
    - source_type = 'user_generated'
    - user_exam_id = user_generated_exams.id
    - NEVER mixed with platform exam sessions in analytics
```

### 5.3 Content Isolation — User vs Platform

```
PLATFORM EXAMS (admin-created)          USER EXAMS (user-generated)
─────────────────────────               ─────────────────────────
Stored in: questions table              Stored in: user_generated_exams.questions JSONB
owner_type: 'platform'                  owner_type: 'user'
Visible to: all users                   Visible to: ONLY the generating user
Created by: admin / scraper / agent     Created by: user clicking "Generate Exam"
Exam sessions: exam_sessions table      Exam sessions: exam_sessions with source_type='user_generated'
Analytics: platform-wide stats          Analytics: user's personal stats only
Can be sold: no (always free/credit)    Can be sold: yes (post-MVP marketplace)
```

---

## 6. AI Prompts

### 6.1 Tutorial Generation Prompt

```
SYSTEM:
You are an expert educational content creator building interactive HTML
tutorials for Indian competitive exam preparation. You produce rich,
visually structured HTML content with embedded CSS, diagrams, tables,
and exam-focused study aids.

OUTPUT FORMAT: Complete HTML document following the ExamForge tutorial
template. Include inline CSS. Use these CSS classes:
- .definition — for key term definitions (blue left border)
- .formula — for mathematical/chemical formulas (green border)
- .mnemonic — for memory aids (yellow left border, auto-prefixed with 💡)
- .exam-tip — for exam-specific tips (red border, auto-prefixed with 🎯)
- .diagram — for SVG diagram containers
- .key-points — for summary box at end
- .objectives — for learning objectives at start
- .references — for textbook/web references at end
- table — for comparison tables (styled automatically)

USER:
Generate a comprehensive tutorial on the following topic.

Exam: {exam_name}
Conducting Body: {conducting_body}
Unit: {unit_title}
Topic: {topic_title}
Description from syllabus: {node_description}
Key terms to cover: {key_terms}

Syllabus context (surrounding topics for continuity):
Previous topic: {previous_topic_title}
Next topic: {next_topic_title}

Relevant syllabus text:
{relevant_raw_text_section}

Requirements:
1. Start with Learning Objectives (3-5 bullet points)
2. Introduction: why this topic matters, brief historical context if relevant
3. Detailed explanation: break into logical sub-sections with h2/h3 headings
4. Include ALL key terms as .definition boxes with clear explanations
5. Include relevant formulas as .formula boxes with explanation
6. Add at least 1 comparison table if the topic has classifiable content
7. Add at least 1 inline SVG diagram showing a process, pathway, or structure
   (use simple shapes: rect, circle, line, text, path — keep it clean)
8. Add 1-2 .mnemonic boxes for complex lists or classifications
9. Add 1-2 .exam-tip boxes with exam-specific insights:
   - What {conducting_body} typically asks about this topic
   - Common mistakes students make
   - Frequently confused concepts
10. Clinical/practical applications section
11. Key Points summary box at the end (bulleted, concise)
12. References section: standard textbooks + 2-3 web links

For Pharmacy exams reference: Remington's, Lachman's, Rang & Dale, KD Tripathi, IP
For Medical exams: Harrison's, Robbins, Guyton, NCERT
For UPSC: Laxmikanth, Spectrum, NCERTs

Word count target: 1500-3000 words.
The HTML must be self-contained (inline CSS in <style> tag).
Do NOT use external JavaScript or CDN links.
SVG diagrams must be inline (not image links).
```

### 6.2 Preview Generation (Post-Processing — not AI)

The preview is generated by code, not AI:

```typescript
function generatePreview(fullHtml: string, percentage: number = 30): string {
  // 1. Parse HTML
  // 2. Count total content sections (h2 tags)
  // 3. Keep first N sections (30% of total)
  // 4. After the cutoff point, inject the preview banner:
  //    <div class="preview-cutoff">
  //      <h3>🔒 Upgrade to read the full tutorial</h3>
  //      <p>The full tutorial includes {remaining} more sections...</p>
  //      <a href="/pricing" class="upgrade-btn">Upgrade to Pro</a>
  //    </div>
  // 5. Return truncated HTML
}
```

### 6.3 User Exam Generation Prompt

```
SYSTEM:
You generate practice exam questions from tutorial content for Indian
competitive examinations. Every question MUST be answerable from the
provided tutorial text.

USER:
Generate {count} MCQ questions from this tutorial.

Exam: {exam_name}
Topic: {topic_title}
Difficulty: {difficulty_distribution}

=== TUTORIAL CONTENT ===
{tutorial_plain_text}
=== END ===

Rules:
1. EVERY question must be answerable from the tutorial above
2. 4 options each, only 1 correct
3. Explanation must reference specific content from the tutorial
4. Difficulty: {easy}% easy, {medium}% medium, {hard}% hard
5. Cover different sections — don't cluster all Qs from one paragraph
6. Include 1-2 assertion-reason questions if count > 10
7. Distractors must be plausible concepts from related topics

OUTPUT: JSON array of QuestionSchema (via Instructor.js)
```

---

## 7. tRPC Endpoints

```typescript
tutorialAgentRouter = router({
  // ─── ADMIN: Trigger generation ───
  startGeneration: adminProcedure
    .input(
      z.object({
        syllabusId: z.string().uuid(),
        examId: z.string().uuid(),
        providers: z.array(z.string()).default(["claude"]),
        includeImages: z.boolean().default(true),
        includeMnemonics: z.boolean().default(true),
        previewPercentage: z.number().min(10).max(50).default(30),
      }),
    )
    .mutation(),
  // Creates tutorial_generation_jobs record, queues BullMQ job

  pauseGeneration: adminProcedure.input(z.object({ jobId: z.string().uuid() })).mutation(),

  resumeGeneration: adminProcedure.input(z.object({ jobId: z.string().uuid() })).mutation(),

  getGenerationStatus: adminProcedure.input(z.object({ jobId: z.string().uuid() })).query(),
  // Returns job progress, current node, completed/failed counts

  regenerateTopic: adminProcedure.input(z.object({ tutorialFileId: z.string().uuid() })).mutation(),
  // Re-generates a single topic tutorial (new version)

  // ─── USER: Read tutorials ───
  getTutorialForNode: protectedProcedure
    .input(
      z.object({
        syllabusNodeId: z.string().uuid(),
      }),
    )
    .query(),
  // Returns: { html, isPreview, isLocked, tutorialMeta }
  // Logic:
  // 1. Find tutorial_files WHERE syllabus_node_id AND is_current
  // 2. Check user's plan + free quota
  // 3. If free user beyond quota: return preview HTML + locked=true
  // 4. If paid user: return full HTML
  // 5. Deduct credit if applicable
  // 6. Increment view count

  getTutorialMeta: protectedProcedure
    .input(z.object({ syllabusNodeId: z.string().uuid() }))
    .query(),
  // Returns metadata only (no HTML): title, wordCount, readMinutes, sections, etc.
  // Used for the syllabus tree to show status without loading full content

  listTutorialsForSyllabus: protectedProcedure
    .input(z.object({ syllabusId: z.string().uuid() }))
    .query(),
  // Returns all tutorial_files for a syllabus with metadata + access status per node

  // ─── USER: Generate personal exams ───
  generateUserExam: protectedProcedure
    .input(
      z.object({
        syllabusNodeId: z.string().uuid(),
        tutorialFileId: z.string().uuid(),
        questionCount: z.number().min(5).max(50).default(10),
        difficulty: z.enum(["mixed", "easy", "medium", "hard"]).default("mixed"),
        timeLimitMinutes: z.number().min(5).max(120).optional(),
      }),
    )
    .mutation(),
  // 1. Check credits (5 per exam generation)
  // 2. Load tutorial HTML from S3, strip to plain text
  // 3. Send to AI for question generation
  // 4. Save to user_generated_exams (owner_type='user')
  // 5. Deduct credits
  // 6. Return { examId } for redirect to exam interface

  listUserExams: protectedProcedure
    .input(
      z.object({
        examId: z.string().uuid().optional(),
        syllabusNodeId: z.string().uuid().optional(),
      }),
    )
    .query(),
  // Returns user's personal generated exams

  getUserExamById: protectedProcedure.input(z.object({ id: z.string().uuid() })).query(),
  // Returns full exam with questions (only if owner)

  deleteUserExam: protectedProcedure.input(z.object({ id: z.string().uuid() })).mutation(),
  // Delete only own exams
});
```

---

## 8. File Locations

| What              | Where                                                                             |
| ----------------- | --------------------------------------------------------------------------------- |
| Schemas           | `tutorial-files.ts`, `user-generated-exams.ts`, `tutorial-generation-jobs.ts`     |
| Validators        | `packages/shared/src/validators/tutorial-agent.ts`                                |
| Agent Worker      | `apps/api/src/workers/tutorial-agent-worker.ts`                                   |
| HTML Generator    | `apps/api/src/services/tutorial-html-generator.ts`                                |
| Preview Generator | `apps/api/src/services/tutorial-preview-generator.ts`                             |
| S3 Manager        | `apps/api/src/services/tutorial-s3-manager.ts`                                    |
| AI Prompts        | `apps/api/src/ai/prompts/tutorial-html-prompt.ts`                                 |
| tRPC Router       | `apps/api/src/routers/tutorial-agent.ts`                                          |
| Tutorial Viewer   | `apps/web/src/app/(dashboard)/dashboard/exam/[examId]/syllabus/[nodeId]/page.tsx` |
| User Exams List   | `apps/web/src/app/(dashboard)/dashboard/my-exams/page.tsx`                        |
| Admin Generation  | `apps/web/src/app/(dashboard)/admin/tutorials/page.tsx`                           |

---

## 9. Claude Code Implementation Order

Execute in order. Each step = one commit.

### STEP 1: Database

`commit: feat: add tutorial files, user generated exams, and generation jobs tables`

- Create 3 tables + validators + migration + seed

### STEP 2: S3 Manager + HTML Generator

`commit: feat: add tutorial S3 storage and HTML generation services`

- S3 upload/download/presigned URL helpers
- Preview generator (truncate HTML at percentage, inject upgrade banner)
- HTML sanitization + validation

### STEP 3: Tutorial Agent Worker

`commit: feat: add AI tutorial agent BullMQ worker`

- Walks syllabus tree, generates HTML per topic
- Uploads to S3, creates tutorial_files records
- Progress tracking in tutorial_generation_jobs
- Error handling: skip failed nodes, continue

### STEP 4: tRPC Router

`commit: feat: add tutorial agent router with access control`

- Admin: start/pause/resume generation, regenerate topic
- User: read tutorials (plan-gated), generate personal exams
- Access control: free quota, credit deduction, preview serving

### STEP 5: Tutorial Viewer Page

`commit: feat: add tutorial viewer with plan-gated access`

- Renders HTML from API (dangerouslySetInnerHTML with sanitization)
- Shows preview with upgrade banner for free users
- "Generate Practice Exam" button for paid users
- "Ask AI about this topic" chat integration

### STEP 6: User Generated Exams

`commit: feat: add user-generated exam flow separate from platform exams`

- Exam generation modal on tutorial page
- Store in user_generated_exams (isolated from platform)
- List in "My Practice Exams" page
- Existing exam-taking interface reads from user_generated_exams when source_type='user_generated'

### STEP 7: Admin Generation Dashboard

`commit: feat: add admin tutorial generation management page`

- Select syllabus → configure → start generation
- Real-time progress: current topic, completed/failed counts
- Regenerate individual topics
- View all generated tutorials with status

### STEP 8: Post-implementation

`commit: chore: update docs for tutorial agent feature`

- Update CLAUDE.md, BACKLOG.md, TASKS_COMPLETED.md
- Test: admin generates tutorials → user reads (free preview + paid full) → user generates personal exam → takes it → results show (separate from platform stats)
