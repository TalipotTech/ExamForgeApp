CREATE TABLE IF NOT EXISTS "tts_usage_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" varchar(30) NOT NULL,
	"voice_id" varchar(100) NOT NULL,
	"char_count" integer NOT NULL,
	"estimated_cost_usd" real DEFAULT 0,
	"session_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "voice_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"exam_id" uuid NOT NULL,
	"mode" varchar(20) NOT NULL,
	"source_session_id" uuid,
	"source_user_exam_id" varchar(255),
	"subject" varchar(255),
	"topic" varchar(255),
	"question_count" integer,
	"difficulty" varchar(20),
	"questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
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
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "tts_usage_logs" ADD CONSTRAINT "tts_usage_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "tts_usage_logs" ADD CONSTRAINT "tts_usage_logs_session_id_voice_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."voice_sessions"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "voice_sessions" ADD CONSTRAINT "voice_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "voice_sessions" ADD CONSTRAINT "voice_sessions_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN ALTER TABLE "voice_sessions" ADD CONSTRAINT "voice_sessions_source_session_id_exam_sessions_id_fk" FOREIGN KEY ("source_session_id") REFERENCES "public"."exam_sessions"("id") ON DELETE no action ON UPDATE no action; EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tts_usage_user_month" ON "tts_usage_logs" USING btree ("user_id","provider","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_voice_sessions_user" ON "voice_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_voice_sessions_exam" ON "voice_sessions" USING btree ("exam_id");
