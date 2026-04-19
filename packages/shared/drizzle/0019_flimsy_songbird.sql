CREATE TABLE "exam_patterns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_id" uuid NOT NULL,
	"fingerprint" jsonb NOT NULL,
	"papers_analyzed" integer NOT NULL,
	"paper_years" jsonb NOT NULL,
	"confidence" real NOT NULL,
	"total_questions" integer,
	"total_marks" integer,
	"duration_minutes" integer,
	"negative_marking" boolean,
	"subject_weightage" jsonb NOT NULL,
	"difficulty_distribution" jsonb NOT NULL,
	"top_topics" jsonb DEFAULT '[]'::jsonb,
	"ai_provider" varchar(50),
	"ai_tokens_used" integer DEFAULT 0,
	"ai_cost_usd" real DEFAULT 0,
	"version" integer DEFAULT 1,
	"is_current" boolean DEFAULT true,
	"status" varchar(20) DEFAULT 'draft',
	"created_by" uuid,
	"org_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "paper_analysis" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"exam_id" uuid NOT NULL,
	"exam_pattern_id" uuid,
	"year" integer NOT NULL,
	"paper_number" varchar(50),
	"source" varchar(255),
	"portal_document_id" uuid,
	"total_questions" integer NOT NULL,
	"questions_with_answers" integer,
	"subject_distribution" jsonb NOT NULL,
	"topic_distribution" jsonb NOT NULL,
	"difficulty_distribution" jsonb NOT NULL,
	"style_distribution" jsonb NOT NULL,
	"repeated_questions" integer DEFAULT 0,
	"repeated_from" jsonb DEFAULT '[]'::jsonb,
	"analysis_json" jsonb NOT NULL,
	"ai_provider" varchar(50),
	"ai_tokens_used" integer DEFAULT 0,
	"status" varchar(20) DEFAULT 'pending',
	"error_message" text,
	"org_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "analyzed_subject" varchar(255);--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "analyzed_topic" varchar(255);--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "analyzed_subtopic" varchar(255);--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "analyzed_style" varchar(50);--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "is_repeated" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "repeated_from" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "pattern_tags" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "exam_patterns" ADD CONSTRAINT "exam_patterns_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_patterns" ADD CONSTRAINT "exam_patterns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exam_patterns" ADD CONSTRAINT "exam_patterns_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_analysis" ADD CONSTRAINT "paper_analysis_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_analysis" ADD CONSTRAINT "paper_analysis_exam_pattern_id_exam_patterns_id_fk" FOREIGN KEY ("exam_pattern_id") REFERENCES "public"."exam_patterns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_analysis" ADD CONSTRAINT "paper_analysis_portal_document_id_portal_documents_id_fk" FOREIGN KEY ("portal_document_id") REFERENCES "public"."portal_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "paper_analysis" ADD CONSTRAINT "paper_analysis_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_exam_patterns_exam_current" ON "exam_patterns" USING btree ("exam_id");--> statement-breakpoint
CREATE INDEX "idx_paper_analysis_exam" ON "paper_analysis" USING btree ("exam_id");--> statement-breakpoint
CREATE INDEX "idx_paper_analysis_portal_doc" ON "paper_analysis" USING btree ("portal_document_id");--> statement-breakpoint
CREATE INDEX "questions_analyzed_subject_idx" ON "questions" USING btree ("analyzed_subject");--> statement-breakpoint
CREATE INDEX "questions_is_repeated_idx" ON "questions" USING btree ("is_repeated");