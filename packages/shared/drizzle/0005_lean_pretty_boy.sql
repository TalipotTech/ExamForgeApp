CREATE TABLE "content_searches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"query_text" text NOT NULL,
	"parsed_query" jsonb NOT NULL,
	"results_count" integer DEFAULT 0,
	"search_strategies_used" jsonb DEFAULT '[]'::jsonb,
	"ai_provider" varchar(50),
	"ai_tokens_used" integer DEFAULT 0,
	"ai_cost_usd" real DEFAULT 0,
	"cache_key" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"search_id" uuid NOT NULL,
	"title" varchar(1000) NOT NULL,
	"source_url" varchar(2000) NOT NULL,
	"source_name" varchar(255),
	"source_domain" varchar(255),
	"content_type" varchar(30) NOT NULL,
	"snippet" text,
	"match_quality" varchar(10) NOT NULL,
	"relevance_score" real DEFAULT 0,
	"source_quality" varchar(20) DEFAULT 'unknown',
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"is_saved" boolean DEFAULT false,
	"is_extracted" boolean DEFAULT false,
	"extraction_count" integer DEFAULT 0,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_saved_content" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"search_result_id" uuid,
	"title" varchar(1000) NOT NULL,
	"source_url" varchar(2000),
	"source_name" varchar(255),
	"content_type" varchar(30) NOT NULL,
	"saved_type" varchar(20) NOT NULL,
	"file_key" varchar(500),
	"file_url" varchar(1000),
	"raw_text" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"exam_id" uuid,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"questions_extracted" integer DEFAULT 0,
	"owner_type" varchar(10) DEFAULT 'user',
	"owner_id" uuid,
	"visibility" varchar(20) DEFAULT 'private',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_searches" ADD CONSTRAINT "content_searches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_results" ADD CONSTRAINT "search_results_search_id_content_searches_id_fk" FOREIGN KEY ("search_id") REFERENCES "public"."content_searches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_saved_content" ADD CONSTRAINT "user_saved_content_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_saved_content" ADD CONSTRAINT "user_saved_content_search_result_id_search_results_id_fk" FOREIGN KEY ("search_result_id") REFERENCES "public"."search_results"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_saved_content" ADD CONSTRAINT "user_saved_content_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_saved_content" ADD CONSTRAINT "user_saved_content_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_searches_user_id_idx" ON "content_searches" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "content_searches_cache_key_idx" ON "content_searches" USING btree ("cache_key");--> statement-breakpoint
CREATE INDEX "search_results_search_id_idx" ON "search_results" USING btree ("search_id");--> statement-breakpoint
CREATE INDEX "search_results_saved_idx" ON "search_results" USING btree ("search_id","is_saved") WHERE "search_results"."is_saved" = true;--> statement-breakpoint
CREATE INDEX "user_saved_content_user_id_idx" ON "user_saved_content" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_saved_content_exam_id_idx" ON "user_saved_content" USING btree ("exam_id");--> statement-breakpoint
CREATE INDEX "user_saved_content_user_type_idx" ON "user_saved_content" USING btree ("user_id","content_type");