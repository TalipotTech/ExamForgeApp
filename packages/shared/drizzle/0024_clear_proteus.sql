ALTER TABLE "assignment_submissions" ADD COLUMN "submission_text" text;--> statement-breakpoint
ALTER TABLE "assignment_submissions" ADD COLUMN "submission_url" text;--> statement-breakpoint
ALTER TABLE "assignment_submissions" ADD COLUMN "submission_file_name" varchar(500);--> statement-breakpoint
ALTER TABLE "assignment_submissions" ADD COLUMN "submission_mime_type" varchar(100);--> statement-breakpoint
ALTER TABLE "classroom_assignments" ADD COLUMN "attachment_url" text;--> statement-breakpoint
ALTER TABLE "classroom_assignments" ADD COLUMN "attachment_file_name" varchar(500);--> statement-breakpoint
ALTER TABLE "classroom_assignments" ADD COLUMN "attachment_mime_type" varchar(100);--> statement-breakpoint
ALTER TABLE "creator_profiles" ADD COLUMN "slug" varchar(280);--> statement-breakpoint
ALTER TABLE "creator_profiles" ADD CONSTRAINT "creator_profiles_slug_unique" UNIQUE("slug");