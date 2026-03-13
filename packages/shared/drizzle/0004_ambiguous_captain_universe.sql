CREATE TABLE "syllabi" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"exam_id" uuid NOT NULL,
	"org_id" uuid,
	"name" varchar(255) NOT NULL,
	"file_key" varchar(500) NOT NULL,
	"file_url" varchar(1000),
	"file_size_bytes" integer,
	"mime_type" varchar(100) DEFAULT 'application/pdf',
	"status" varchar(20) DEFAULT 'uploading' NOT NULL,
	"error_message" text,
	"raw_text" text,
	"page_count" integer,
	"extraction_method" varchar(50),
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "syllabus_nodes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"syllabus_id" bigint NOT NULL,
	"parent_id" bigint,
	"node_type" varchar(20) NOT NULL,
	"title" varchar(500) NOT NULL,
	"description" text,
	"content" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"depth" integer DEFAULT 0 NOT NULL,
	"key_terms" jsonb DEFAULT '[]'::jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"tutorial_status" varchar(20) DEFAULT 'none',
	"mcq_status" varchar(20) DEFAULT 'none',
	"mcq_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tutorial_questions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"tutorial_id" bigint NOT NULL,
	"question_id" uuid NOT NULL,
	"syllabus_node_id" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tutorials" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"syllabus_node_id" bigint NOT NULL,
	"exam_id" uuid NOT NULL,
	"org_id" uuid,
	"version" integer DEFAULT 1 NOT NULL,
	"title" varchar(500) NOT NULL,
	"content" jsonb NOT NULL,
	"content_text" text NOT NULL,
	"providers_used" jsonb NOT NULL,
	"generation_config" jsonb DEFAULT '{}'::jsonb,
	"word_count" integer,
	"estimated_read_minutes" integer,
	"quality_score" real,
	"is_current" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" uuid
);
--> statement-breakpoint
ALTER TABLE "syllabi" ADD CONSTRAINT "syllabi_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "syllabi" ADD CONSTRAINT "syllabi_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "syllabi" ADD CONSTRAINT "syllabi_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "syllabus_nodes" ADD CONSTRAINT "syllabus_nodes_syllabus_id_syllabi_id_fk" FOREIGN KEY ("syllabus_id") REFERENCES "public"."syllabi"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "syllabus_nodes" ADD CONSTRAINT "syllabus_nodes_parent_id_syllabus_nodes_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."syllabus_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutorial_questions" ADD CONSTRAINT "tutorial_questions_tutorial_id_tutorials_id_fk" FOREIGN KEY ("tutorial_id") REFERENCES "public"."tutorials"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutorial_questions" ADD CONSTRAINT "tutorial_questions_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutorial_questions" ADD CONSTRAINT "tutorial_questions_syllabus_node_id_syllabus_nodes_id_fk" FOREIGN KEY ("syllabus_node_id") REFERENCES "public"."syllabus_nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutorials" ADD CONSTRAINT "tutorials_syllabus_node_id_syllabus_nodes_id_fk" FOREIGN KEY ("syllabus_node_id") REFERENCES "public"."syllabus_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutorials" ADD CONSTRAINT "tutorials_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutorials" ADD CONSTRAINT "tutorials_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutorials" ADD CONSTRAINT "tutorials_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "syllabi_exam_id_idx" ON "syllabi" USING btree ("exam_id");--> statement-breakpoint
CREATE INDEX "syllabi_status_idx" ON "syllabi" USING btree ("status");--> statement-breakpoint
CREATE INDEX "syllabus_nodes_syllabus_idx" ON "syllabus_nodes" USING btree ("syllabus_id");--> statement-breakpoint
CREATE INDEX "syllabus_nodes_parent_idx" ON "syllabus_nodes" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "syllabus_nodes_type_idx" ON "syllabus_nodes" USING btree ("node_type");--> statement-breakpoint
CREATE INDEX "tutorial_questions_tutorial_idx" ON "tutorial_questions" USING btree ("tutorial_id");--> statement-breakpoint
CREATE INDEX "tutorial_questions_node_idx" ON "tutorial_questions" USING btree ("syllabus_node_id");--> statement-breakpoint
CREATE INDEX "tutorials_node_idx" ON "tutorials" USING btree ("syllabus_node_id");--> statement-breakpoint
CREATE INDEX "tutorials_current_idx" ON "tutorials" USING btree ("syllabus_node_id","is_current") WHERE "tutorials"."is_current" = true;