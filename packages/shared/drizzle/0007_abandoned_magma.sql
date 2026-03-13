CREATE TABLE "staged_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portal_document_id" uuid NOT NULL,
	"exam_id" uuid,
	"suggested_exam_name" varchar(500),
	"type" varchar(20) DEFAULT 'mcq' NOT NULL,
	"content" jsonb NOT NULL,
	"subject" varchar(255),
	"topic" varchar(255),
	"difficulty" varchar(20) DEFAULT 'medium',
	"source" varchar(500),
	"paper_year" integer,
	"paper_number" varchar(50),
	"question_number" integer,
	"review_status" varchar(20) DEFAULT 'pending' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp,
	"rejection_reason" text,
	"approved_question_id" uuid,
	"org_id" uuid NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "portal_documents" ADD COLUMN "source_page_number" integer;--> statement-breakpoint
ALTER TABLE "staged_questions" ADD CONSTRAINT "staged_questions_portal_document_id_portal_documents_id_fk" FOREIGN KEY ("portal_document_id") REFERENCES "public"."portal_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staged_questions" ADD CONSTRAINT "staged_questions_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staged_questions" ADD CONSTRAINT "staged_questions_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staged_questions" ADD CONSTRAINT "staged_questions_approved_question_id_questions_id_fk" FOREIGN KEY ("approved_question_id") REFERENCES "public"."questions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staged_questions" ADD CONSTRAINT "staged_questions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_staged_q_portal_doc" ON "staged_questions" USING btree ("portal_document_id");--> statement-breakpoint
CREATE INDEX "idx_staged_q_review_status" ON "staged_questions" USING btree ("review_status");--> statement-breakpoint
CREATE INDEX "idx_staged_q_exam" ON "staged_questions" USING btree ("exam_id");--> statement-breakpoint
CREATE INDEX "idx_staged_q_org" ON "staged_questions" USING btree ("org_id");