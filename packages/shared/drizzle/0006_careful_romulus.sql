CREATE TABLE "portal_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"portal_name" varchar(255) NOT NULL,
	"portal_url" varchar(2000) NOT NULL,
	"source_page_type" varchar(30) NOT NULL,
	"document_type" varchar(30) NOT NULL,
	"title" varchar(1000) NOT NULL,
	"exam_name" varchar(500),
	"exam_year" integer,
	"exam_category" varchar(255),
	"original_url" varchar(2000) NOT NULL,
	"file_key" varchar(500),
	"file_url" varchar(1000),
	"file_size_bytes" integer,
	"page_count" integer,
	"processing_status" varchar(20) DEFAULT 'discovered' NOT NULL,
	"raw_text" text,
	"extraction_method" varchar(50),
	"questions_extracted" integer DEFAULT 0,
	"answers_matched" integer DEFAULT 0,
	"exam_id" uuid,
	"syllabus_id" uuid,
	"error_message" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "portal_document_id" uuid;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "paper_year" integer;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "paper_number" varchar(50);--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "question_number" integer;--> statement-breakpoint
ALTER TABLE "portal_documents" ADD CONSTRAINT "portal_documents_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_portal_docs_portal" ON "portal_documents" USING btree ("portal_name");--> statement-breakpoint
CREATE INDEX "idx_portal_docs_type" ON "portal_documents" USING btree ("document_type");--> statement-breakpoint
CREATE INDEX "idx_portal_docs_exam" ON "portal_documents" USING btree ("exam_id");--> statement-breakpoint
CREATE INDEX "idx_portal_docs_status" ON "portal_documents" USING btree ("processing_status");--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_portal_document_id_portal_documents_id_fk" FOREIGN KEY ("portal_document_id") REFERENCES "public"."portal_documents"("id") ON DELETE no action ON UPDATE no action;