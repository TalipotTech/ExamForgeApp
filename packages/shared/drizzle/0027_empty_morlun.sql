ALTER TABLE "creator_profiles" ADD COLUMN "slug" varchar(280);--> statement-breakpoint
ALTER TABLE "creator_profiles" ADD CONSTRAINT "creator_profiles_slug_unique" UNIQUE("slug");