ALTER TABLE "live_sessions" ADD COLUMN IF NOT EXISTS "provider_room_id" varchar(100);--> statement-breakpoint
ALTER TABLE "live_sessions" ADD COLUMN IF NOT EXISTS "provider_template_id" varchar(100);
