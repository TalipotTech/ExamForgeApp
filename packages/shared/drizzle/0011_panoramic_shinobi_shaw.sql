CREATE TABLE "topic_note_summaries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"syllabus_node_id" bigint NOT NULL,
	"syllabus_id" bigint NOT NULL,
	"exam_id" uuid,
	"summary_text" text NOT NULL,
	"summary_html" text,
	"note_count" integer DEFAULT 0 NOT NULL,
	"last_generated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "topic_note_summaries_node_unique" UNIQUE("syllabus_node_id")
);
--> statement-breakpoint
CREATE TABLE "topic_notes" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"conversation_id" uuid,
	"syllabus_id" bigint NOT NULL,
	"syllabus_node_id" bigint NOT NULL,
	"tutorial_file_id" bigint,
	"keyword" varchar(200),
	"note_content" text NOT NULL,
	"note_html" text,
	"is_public" boolean DEFAULT false,
	"upvotes" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "syllabus_nodes" ADD COLUMN "slug" varchar(200);--> statement-breakpoint
ALTER TABLE "syllabus_nodes" ADD COLUMN "public_summary_available" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "topic_conversations" ADD COLUMN "syllabus_id" bigint;--> statement-breakpoint
ALTER TABLE "topic_conversations" ADD COLUMN "syllabus_node_id" bigint;--> statement-breakpoint
ALTER TABLE "topic_conversations" ADD COLUMN "tutorial_file_id" bigint;--> statement-breakpoint
ALTER TABLE "topic_conversations" ADD COLUMN "keyword" varchar(200);--> statement-breakpoint
ALTER TABLE "topic_conversations" ADD COLUMN "saved_as_note" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "user_generated_exams" ADD COLUMN "source_node_ids" jsonb;--> statement-breakpoint
ALTER TABLE "user_generated_exams" ADD COLUMN "question_hashes" jsonb;--> statement-breakpoint
ALTER TABLE "user_generated_exams" ADD COLUMN "last_attempt_answers" jsonb;--> statement-breakpoint
ALTER TABLE "topic_notes" ADD CONSTRAINT "topic_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_notes" ADD CONSTRAINT "topic_notes_conversation_id_topic_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."topic_conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_topic_note_summaries_syllabus" ON "topic_note_summaries" USING btree ("syllabus_id");--> statement-breakpoint
CREATE INDEX "idx_topic_notes_syllabus_node" ON "topic_notes" USING btree ("syllabus_node_id");--> statement-breakpoint
CREATE INDEX "idx_topic_notes_user_node" ON "topic_notes" USING btree ("user_id","syllabus_node_id");--> statement-breakpoint
CREATE INDEX "idx_topic_conv_syllabus_node" ON "topic_conversations" USING btree ("syllabus_node_id");