CREATE TABLE "tutorial_files" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"syllabus_node_id" bigint NOT NULL,
	"syllabus_id" bigint NOT NULL,
	"exam_id" uuid NOT NULL,
	"file_key" varchar(500) NOT NULL,
	"file_url" varchar(1000),
	"preview_file_key" varchar(500),
	"preview_file_url" varchar(1000),
	"file_size_bytes" integer,
	"title" varchar(500) NOT NULL,
	"word_count" integer,
	"estimated_read_minutes" integer,
	"sections_count" integer,
	"has_diagrams" boolean DEFAULT false,
	"has_formulas" boolean DEFAULT false,
	"has_tables" boolean DEFAULT false,
	"has_mnemonics" boolean DEFAULT false,
	"key_terms" jsonb DEFAULT '[]'::jsonb,
	"reference_links" jsonb DEFAULT '[]'::jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"is_current" boolean DEFAULT true,
	"generated_by" varchar(50) NOT NULL,
	"ai_providers_used" jsonb DEFAULT '[]'::jsonb,
	"ai_tokens_used" integer DEFAULT 0,
	"ai_cost_usd" real DEFAULT 0,
	"generation_config" jsonb DEFAULT '{}'::jsonb,
	"is_free_preview" boolean DEFAULT false,
	"free_preview_percentage" integer DEFAULT 30,
	"total_views" integer DEFAULT 0,
	"unique_viewers" integer DEFAULT 0,
	"owner_type" varchar(10) DEFAULT 'platform' NOT NULL,
	"visibility" varchar(20) DEFAULT 'public' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tutorial_generation_jobs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"syllabus_id" bigint NOT NULL,
	"exam_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'queued' NOT NULL,
	"total_nodes" integer NOT NULL,
	"completed_nodes" integer DEFAULT 0,
	"failed_nodes" integer DEFAULT 0,
	"current_node_id" bigint,
	"current_node_title" varchar(500),
	"ai_providers" jsonb DEFAULT '["claude"]'::jsonb NOT NULL,
	"generate_previews" boolean DEFAULT true,
	"preview_percentage" integer DEFAULT 30,
	"include_diagrams" boolean DEFAULT true,
	"include_mnemonics" boolean DEFAULT true,
	"include_references" boolean DEFAULT true,
	"total_tokens" integer DEFAULT 0,
	"total_cost_usd" real DEFAULT 0,
	"started_at" timestamp,
	"completed_at" timestamp,
	"error_log" jsonb DEFAULT '[]'::jsonb,
	"progress_log" jsonb DEFAULT '[]'::jsonb,
	"created_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_generated_exams" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"exam_id" uuid NOT NULL,
	"syllabus_node_id" bigint,
	"title" varchar(500) NOT NULL,
	"description" text,
	"questions" jsonb NOT NULL,
	"question_count" integer NOT NULL,
	"difficulty_distribution" jsonb DEFAULT '{"easy":0,"medium":0,"hard":0}'::jsonb,
	"time_limit_minutes" integer,
	"ai_provider" varchar(50),
	"ai_tokens_used" integer DEFAULT 0,
	"ai_cost_usd" real DEFAULT 0,
	"source_tutorial_id" bigint,
	"times_attempted" integer DEFAULT 0,
	"best_score" real,
	"last_attempted_at" timestamp,
	"owner_type" varchar(10) DEFAULT 'user' NOT NULL,
	"owner_id" uuid NOT NULL,
	"visibility" varchar(20) DEFAULT 'private' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tutorial_files" ADD CONSTRAINT "tutorial_files_syllabus_node_id_syllabus_nodes_id_fk" FOREIGN KEY ("syllabus_node_id") REFERENCES "public"."syllabus_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutorial_files" ADD CONSTRAINT "tutorial_files_syllabus_id_syllabi_id_fk" FOREIGN KEY ("syllabus_id") REFERENCES "public"."syllabi"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutorial_files" ADD CONSTRAINT "tutorial_files_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutorial_generation_jobs" ADD CONSTRAINT "tutorial_generation_jobs_syllabus_id_syllabi_id_fk" FOREIGN KEY ("syllabus_id") REFERENCES "public"."syllabi"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutorial_generation_jobs" ADD CONSTRAINT "tutorial_generation_jobs_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutorial_generation_jobs" ADD CONSTRAINT "tutorial_generation_jobs_current_node_id_syllabus_nodes_id_fk" FOREIGN KEY ("current_node_id") REFERENCES "public"."syllabus_nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutorial_generation_jobs" ADD CONSTRAINT "tutorial_generation_jobs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_generated_exams" ADD CONSTRAINT "user_generated_exams_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_generated_exams" ADD CONSTRAINT "user_generated_exams_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_generated_exams" ADD CONSTRAINT "user_generated_exams_syllabus_node_id_syllabus_nodes_id_fk" FOREIGN KEY ("syllabus_node_id") REFERENCES "public"."syllabus_nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_generated_exams" ADD CONSTRAINT "user_generated_exams_source_tutorial_id_tutorial_files_id_fk" FOREIGN KEY ("source_tutorial_id") REFERENCES "public"."tutorial_files"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_generated_exams" ADD CONSTRAINT "user_generated_exams_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tutorial_files_node_idx" ON "tutorial_files" USING btree ("syllabus_node_id") WHERE "tutorial_files"."is_current" = true;--> statement-breakpoint
CREATE INDEX "tutorial_files_syllabus_idx" ON "tutorial_files" USING btree ("syllabus_id");--> statement-breakpoint
CREATE INDEX "tutorial_files_exam_idx" ON "tutorial_files" USING btree ("exam_id");--> statement-breakpoint
CREATE INDEX "tutorial_gen_jobs_syllabus_idx" ON "tutorial_generation_jobs" USING btree ("syllabus_id");--> statement-breakpoint
CREATE INDEX "tutorial_gen_jobs_status_idx" ON "tutorial_generation_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "user_generated_exams_user_idx" ON "user_generated_exams" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_generated_exams_exam_idx" ON "user_generated_exams" USING btree ("exam_id");--> statement-breakpoint
CREATE INDEX "user_generated_exams_node_idx" ON "user_generated_exams" USING btree ("syllabus_node_id");