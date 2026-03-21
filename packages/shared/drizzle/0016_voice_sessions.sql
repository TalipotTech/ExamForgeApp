CREATE TABLE IF NOT EXISTS "voice_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id"),
  "exam_id" uuid NOT NULL REFERENCES "exams"("id"),
  "mode" varchar(20) NOT NULL,
  "source_session_id" uuid REFERENCES "exam_sessions"("id"),
  "source_user_exam_id" varchar(255),
  "subject" varchar(255),
  "topic" varchar(255),
  "question_count" integer,
  "difficulty" varchar(20),
  "questions" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "total_questions" integer DEFAULT 0,
  "answered_count" integer DEFAULT 0,
  "correct_count" integer DEFAULT 0,
  "skipped_count" integer DEFAULT 0,
  "score_percent" real,
  "duration_seconds" integer,
  "conversation" jsonb DEFAULT '[]'::jsonb,
  "ai_tokens_used" integer DEFAULT 0,
  "ai_cost_usd" real DEFAULT 0,
  "tts_provider" varchar(30) DEFAULT 'browser',
  "stt_provider" varchar(30) DEFAULT 'browser',
  "tts_chars_used" integer DEFAULT 0,
  "status" varchar(20) NOT NULL DEFAULT 'active',
  "started_at" timestamp DEFAULT now() NOT NULL,
  "completed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_voice_sessions_user" ON "voice_sessions" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_voice_sessions_exam" ON "voice_sessions" ("exam_id");
