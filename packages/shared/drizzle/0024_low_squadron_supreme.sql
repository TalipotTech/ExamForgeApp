CREATE TABLE "creator_zoom_integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"zoom_user_id" varchar(50) NOT NULL,
	"zoom_account_email" varchar(255),
	"zoom_account_type" varchar(20),
	"access_token_encrypted" text NOT NULL,
	"refresh_token_encrypted" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"scopes" text NOT NULL,
	"connected_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp,
	CONSTRAINT "creator_zoom_unique" UNIQUE("creator_id")
);
--> statement-breakpoint
ALTER TABLE "assignment_submissions" ADD COLUMN "submission_text" text;--> statement-breakpoint
ALTER TABLE "assignment_submissions" ADD COLUMN "submission_url" text;--> statement-breakpoint
ALTER TABLE "assignment_submissions" ADD COLUMN "submission_file_name" varchar(500);--> statement-breakpoint
ALTER TABLE "assignment_submissions" ADD COLUMN "submission_mime_type" varchar(100);--> statement-breakpoint
ALTER TABLE "classroom_assignments" ADD COLUMN "attachment_url" text;--> statement-breakpoint
ALTER TABLE "classroom_assignments" ADD COLUMN "attachment_file_name" varchar(500);--> statement-breakpoint
ALTER TABLE "classroom_assignments" ADD COLUMN "attachment_mime_type" varchar(100);--> statement-breakpoint
ALTER TABLE "live_sessions" ADD COLUMN "meeting_provider" varchar(20) DEFAULT 'manual';--> statement-breakpoint
ALTER TABLE "creator_zoom_integrations" ADD CONSTRAINT "creator_zoom_integrations_creator_id_creator_profiles_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "creator_zoom_user_idx" ON "creator_zoom_integrations" USING btree ("zoom_user_id");