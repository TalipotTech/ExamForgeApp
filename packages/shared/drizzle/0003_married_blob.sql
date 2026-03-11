ALTER TABLE "discovery_runs" ADD COLUMN "crawler_type" varchar(20);--> statement-breakpoint
ALTER TABLE "discovery_runs" ADD COLUMN "max_pages_per_portal" integer;--> statement-breakpoint
ALTER TABLE "exams" ADD COLUMN "date_confidence" varchar(20);