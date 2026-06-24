CREATE TABLE "image_generations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" varchar(20) NOT NULL,
	"purpose" varchar(50) NOT NULL,
	"model" varchar(50) NOT NULL,
	"prompt" text NOT NULL,
	"enhanced_prompt" text,
	"negative_prompt" text,
	"s3_key" varchar(500) NOT NULL,
	"cdn_url" varchar(1000),
	"width" integer,
	"height" integer,
	"cost_usd" real NOT NULL,
	"generation_time_ms" integer,
	"user_id" uuid,
	"content_id" uuid,
	"content_type" varchar(50),
	"was_fallback" boolean DEFAULT false,
	"fallback_model" varchar(50),
	"user_rating" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "image_generations" ADD CONSTRAINT "image_generations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_image_gen_platform" ON "image_generations" USING btree ("platform");--> statement-breakpoint
CREATE INDEX "idx_image_gen_purpose" ON "image_generations" USING btree ("purpose");--> statement-breakpoint
CREATE INDEX "idx_image_gen_content" ON "image_generations" USING btree ("content_id");