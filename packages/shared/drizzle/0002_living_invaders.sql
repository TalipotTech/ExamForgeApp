CREATE TABLE "discovery_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_type" varchar(30) NOT NULL,
	"portals_checked" jsonb NOT NULL,
	"exams_found" integer DEFAULT 0,
	"exams_new" integer DEFAULT 0,
	"exams_updated" integer DEFAULT 0,
	"notifications_created" integer DEFAULT 0,
	"ai_provider" varchar(50),
	"ai_tokens_used" integer DEFAULT 0,
	"ai_cost_usd" real DEFAULT 0,
	"status" varchar(20) DEFAULT 'running' NOT NULL,
	"error_log" jsonb DEFAULT '[]'::jsonb,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exam_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_id" uuid NOT NULL,
	"type" varchar(30) NOT NULL,
	"title" varchar(500) NOT NULL,
	"description" text,
	"source_url" varchar(1000),
	"is_read" boolean DEFAULT false,
	"is_important" boolean DEFAULT false,
	"detected_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scrape_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'running' NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"pages_visited" integer DEFAULT 0,
	"pages_failed" integer DEFAULT 0,
	"questions_found" integer DEFAULT 0,
	"questions_new" integer DEFAULT 0,
	"questions_duplicate" integer DEFAULT 0,
	"ai_provider" varchar(50),
	"ai_tokens_used" integer DEFAULT 0,
	"ai_cost_usd" real DEFAULT 0,
	"error_log" jsonb DEFAULT '[]'::jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "status" varchar(20) DEFAULT 'active';--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "exam_date" timestamp;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "registration_start" timestamp;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "registration_end" timestamp;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "result_date" timestamp;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "official_url" varchar(1000);--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "application_url" varchar(1000);--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "syllabus_url" varchar(1000);--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "conducting_body" varchar(255);--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "level" varchar(20) DEFAULT 'national';--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "eligibility" text;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "total_marks" integer;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "duration_minutes" integer;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "negative_marking" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "negative_marking_scheme" varchar(100);--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "exam_pattern" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "tags" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "question_count" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "is_featured" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "is_auto_discovered" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "discovery_source" varchar(255);--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "last_checked_at" timestamp;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "popularity_score" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "scrape_sources" ADD COLUMN "source_type" varchar(30) DEFAULT 'question_bank';--> statement-breakpoint
ALTER TABLE "scrape_sources" ADD COLUMN "scrape_frequency" varchar(20) DEFAULT 'manual';--> statement-breakpoint
ALTER TABLE "scrape_sources" ADD COLUMN "scrape_depth" integer DEFAULT 1;--> statement-breakpoint
ALTER TABLE "scrape_sources" ADD COLUMN "content_format" varchar(20) DEFAULT 'html';--> statement-breakpoint
ALTER TABLE "scrape_sources" ADD COLUMN "ai_provider" varchar(50) DEFAULT 'auto';--> statement-breakpoint
ALTER TABLE "scrape_sources" ADD COLUMN "total_runs" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "scrape_sources" ADD COLUMN "successful_runs" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "scrape_sources" ADD COLUMN "total_questions_scraped" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "scrape_sources" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "scrape_sources" ADD COLUMN "next_run_at" timestamp;--> statement-breakpoint
ALTER TABLE "scrape_sources" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "scrape_sources" ADD COLUMN "tags" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "exam_notifications" ADD CONSTRAINT "exam_notifications_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scrape_runs" ADD CONSTRAINT "scrape_runs_source_id_scrape_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."scrape_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exam_notifications_exam_id_idx" ON "exam_notifications" USING btree ("exam_id");--> statement-breakpoint
CREATE INDEX "exam_notifications_type_idx" ON "exam_notifications" USING btree ("type");--> statement-breakpoint
CREATE INDEX "scrape_runs_source_id_idx" ON "scrape_runs" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "scrape_runs_status_idx" ON "scrape_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "exams_status_idx" ON "exams" USING btree ("status");--> statement-breakpoint
CREATE INDEX "exams_exam_date_idx" ON "exams" USING btree ("exam_date");--> statement-breakpoint
CREATE INDEX "exams_conducting_body_idx" ON "exams" USING btree ("conducting_body");--> statement-breakpoint
CREATE INDEX "exams_is_featured_idx" ON "exams" USING btree ("is_featured");