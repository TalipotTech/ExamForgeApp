CREATE TABLE "question_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" uuid NOT NULL,
	"layer" varchar(30) NOT NULL,
	"result" varchar(20) NOT NULL,
	"score" double precision,
	"details" jsonb NOT NULL,
	"ai_provider" varchar(50),
	"ai_tokens_used" integer DEFAULT 0,
	"reviewed_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "source_type" varchar(30);--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "source_detail" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "answer_source" varchar(30);--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "verification_status" varchar(20) DEFAULT 'unverified';--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "verification_score" double precision;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "factual_confidence" double precision;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "syllabus_alignment_score" double precision;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "pattern_match_score" double precision;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "verification_details" jsonb DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "verified_by" uuid;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "verified_at" timestamp;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "mapped_syllabus_node_id" bigint;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "historically_tested" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "original_exam" varchar(255);--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "relevance_to_target" double precision DEFAULT 1;--> statement-breakpoint
ALTER TABLE "question_verifications" ADD CONSTRAINT "question_verifications_question_id_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_verifications" ADD CONSTRAINT "question_verifications_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "question_verifications_question_idx" ON "question_verifications" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "question_verifications_layer_idx" ON "question_verifications" USING btree ("layer");--> statement-breakpoint
CREATE INDEX "question_verifications_result_idx" ON "question_verifications" USING btree ("result");--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_mapped_syllabus_node_id_syllabus_nodes_id_fk" FOREIGN KEY ("mapped_syllabus_node_id") REFERENCES "public"."syllabus_nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "questions_verification_status_idx" ON "questions" USING btree ("verification_status");--> statement-breakpoint
CREATE INDEX "questions_mapped_syllabus_node_idx" ON "questions" USING btree ("mapped_syllabus_node_id");--> statement-breakpoint
CREATE INDEX "questions_source_type_idx" ON "questions" USING btree ("source_type");