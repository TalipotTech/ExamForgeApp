CREATE TABLE "assignment_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"score" real,
	"time_spent_seconds" integer,
	"submitted_at" timestamp,
	"exam_session_id" uuid,
	"feedback" text,
	"graded_by" uuid,
	"graded_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "assignment_submissions_assignment_student_unique" UNIQUE("assignment_id","student_id")
);
--> statement-breakpoint
CREATE TABLE "classroom_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"classroom_id" uuid NOT NULL,
	"assignment_type" varchar(30) NOT NULL,
	"content_id" uuid,
	"exam_session_config" jsonb,
	"title" varchar(500) NOT NULL,
	"instructions" text,
	"assigned_at" timestamp DEFAULT now() NOT NULL,
	"due_at" timestamp,
	"total_students" integer DEFAULT 0,
	"completed_count" integer DEFAULT 0,
	"average_score" real,
	"created_by" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "classroom_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"classroom_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"role" varchar(20) DEFAULT 'student' NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"subscription_status" varchar(20),
	"subscription_expires_at" timestamp,
	"payment_order_id" uuid,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	"removed_at" timestamp,
	CONSTRAINT "classroom_members_classroom_student_unique" UNIQUE("classroom_id","student_id")
);
--> statement-breakpoint
CREATE TABLE "classrooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_id" uuid NOT NULL,
	"creator_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"exam_id" uuid,
	"subject" varchar(255),
	"join_code" varchar(10) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"max_students" integer DEFAULT 100 NOT NULL,
	"student_count" integer DEFAULT 0 NOT NULL,
	"is_paid" boolean DEFAULT false,
	"fee_inr" integer,
	"billing_cycle" varchar(10),
	"settings" jsonb DEFAULT '{}'::jsonb,
	"academic_year" varchar(10),
	"schedule" jsonb DEFAULT '{}'::jsonb,
	"next_live_session" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "classrooms_join_code_unique" UNIQUE("join_code")
);
--> statement-breakpoint
CREATE TABLE "content_ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_id" uuid,
	"listing_id" uuid,
	"user_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"review_text" text,
	"review_title" varchar(255),
	"is_verified_purchase" varchar(5) DEFAULT 'false',
	"helpful_count" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "content_ratings_content_user_unique" UNIQUE("content_id","user_id"),
	CONSTRAINT "content_ratings_listing_user_unique" UNIQUE("listing_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "content_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_id" uuid NOT NULL,
	"user_id" uuid,
	"creator_id" uuid,
	"classroom_id" uuid,
	"watched_seconds" integer DEFAULT 0 NOT NULL,
	"completed" boolean DEFAULT false,
	"credit_cost" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creator_content" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"content_type" varchar(30) NOT NULL,
	"title" varchar(500) NOT NULL,
	"description" text,
	"body" text,
	"slug" varchar(600),
	"file_upload_id" uuid,
	"original_file_name" varchar(500),
	"original_file_type" varchar(100),
	"original_file_size_bytes" integer,
	"media_url" text,
	"processed_url" text,
	"thumbnail_url" text,
	"duration_seconds" integer,
	"exam_id" uuid,
	"syllabus_id" uuid,
	"syllabus_node_id" uuid,
	"subject" varchar(255),
	"topic" varchar(255),
	"is_premium" boolean DEFAULT false NOT NULL,
	"price_inr" integer,
	"is_promotional" boolean DEFAULT false,
	"promotional_expires_at" timestamp,
	"ai_summary" text,
	"ai_tags" jsonb DEFAULT '[]'::jsonb,
	"ai_transcript" text,
	"ai_quality_score" real,
	"ai_language" varchar(10),
	"upload_status" varchar(20) DEFAULT 'pending' NOT NULL,
	"verification_status" varchar(20) DEFAULT 'unverified',
	"verification_score" real,
	"review_status" varchar(20) DEFAULT 'pending' NOT NULL,
	"review_notes" text,
	"view_count" integer DEFAULT 0,
	"like_count" integer DEFAULT 0,
	"share_count" integer DEFAULT 0,
	"doubt_count" integer DEFAULT 0,
	"total_watch_minutes" integer DEFAULT 0,
	"avg_rating" real DEFAULT 0,
	"assigned_classrooms" jsonb DEFAULT '[]'::jsonb,
	"is_published" boolean DEFAULT false NOT NULL,
	"published_at" timestamp,
	"language" varchar(10) DEFAULT 'en' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "creator_content_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "creator_earnings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"earning_type" varchar(30) NOT NULL,
	"amount_inr" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"source_purchase_id" uuid,
	"source_type" varchar(30),
	"source_id" uuid,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"available_at" timestamp,
	"paid_out_at" timestamp,
	"payout_reference" varchar(100),
	"description" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creator_followers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"followed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "creator_followers_creator_student_unique" UNIQUE("creator_id","student_id")
);
--> statement-breakpoint
CREATE TABLE "creator_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"display_name" varchar(255) NOT NULL,
	"bio" text,
	"avatar_url" varchar(1000),
	"cover_image_url" varchar(1000),
	"institution" varchar(255),
	"institution_type" varchar(30),
	"qualification" varchar(255),
	"specializations" jsonb DEFAULT '[]'::jsonb,
	"exams_covered" jsonb DEFAULT '[]'::jsonb,
	"verification_status" varchar(20) DEFAULT 'unverified' NOT NULL,
	"kyc_status" varchar(20) DEFAULT 'pending',
	"kyc_details" jsonb DEFAULT '{}'::jsonb,
	"creator_tier" varchar(20) DEFAULT 'free' NOT NULL,
	"creator_plan_expires_at" timestamp,
	"payout_upi" varchar(100),
	"payout_bank" jsonb,
	"pan_number" varchar(10),
	"gst_number" varchar(15),
	"follower_count" integer DEFAULT 0,
	"content_count" integer DEFAULT 0,
	"total_views" integer DEFAULT 0,
	"total_students" integer DEFAULT 0,
	"total_sales" integer DEFAULT 0,
	"total_revenue_earned" integer DEFAULT 0,
	"average_rating" real DEFAULT 0,
	"total_ratings" integer DEFAULT 0,
	"website_url" varchar(500),
	"youtube_url" varchar(500),
	"social_links" jsonb DEFAULT '{}'::jsonb,
	"promotional_banner_url" varchar(1000),
	"promotional_text" text,
	"is_promoted" boolean DEFAULT false,
	"promoted_until" timestamp,
	"is_featured" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "creator_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "creator_wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"balance_inr" integer DEFAULT 0 NOT NULL,
	"pending_inr" integer DEFAULT 0 NOT NULL,
	"lifetime_earned_inr" integer DEFAULT 0 NOT NULL,
	"lifetime_paid_out_inr" integer DEFAULT 0 NOT NULL,
	"last_payout_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "creator_wallets_creator_id_unique" UNIQUE("creator_id")
);
--> statement-breakpoint
CREATE TABLE "doubt_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"doubt_id" uuid NOT NULL,
	"responder_id" uuid NOT NULL,
	"response_text" text NOT NULL,
	"response_type" varchar(20) DEFAULT 'text' NOT NULL,
	"media_url" text,
	"is_ai" boolean DEFAULT false,
	"is_accepted" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "doubts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"creator_id" uuid,
	"content_id" uuid,
	"syllabus_node_id" uuid,
	"classroom_id" uuid,
	"question_text" text NOT NULL,
	"question_images" jsonb DEFAULT '[]'::jsonb,
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"upvote_count" integer DEFAULT 0,
	"is_public" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "file_uploads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"storage_key" varchar(500) NOT NULL,
	"original_name" varchar(500),
	"mime_type" varchar(100) NOT NULL,
	"size_bytes" integer NOT NULL,
	"public_url" text,
	"cdn_url" text,
	"processing_status" varchar(20) DEFAULT 'uploaded',
	"processed_variants" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "live_session_attendees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	"left_at" timestamp,
	"watch_seconds" integer DEFAULT 0,
	CONSTRAINT "live_session_attendees_session_user_unique" UNIQUE("session_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "live_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"classroom_id" uuid,
	"title" varchar(500) NOT NULL,
	"description" text,
	"scheduled_at" timestamp NOT NULL,
	"duration_minutes" integer DEFAULT 60,
	"status" varchar(20) DEFAULT 'scheduled' NOT NULL,
	"meeting_type" varchar(20) DEFAULT 'embedded' NOT NULL,
	"meeting_url" text,
	"meeting_id" varchar(100),
	"is_recorded" boolean DEFAULT false,
	"recording_url" text,
	"recording_upload_id" uuid,
	"exam_id" uuid,
	"subject" varchar(255),
	"topic" varchar(255),
	"max_attendees" integer DEFAULT 0,
	"peak_concurrent" integer DEFAULT 0,
	"total_watch_minutes" integer DEFAULT 0,
	"is_free" boolean DEFAULT true,
	"price_inr" integer,
	"started_at" timestamp,
	"ended_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marketplace_listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"content_id" uuid,
	"title" varchar(500) NOT NULL,
	"description" text,
	"slug" varchar(600),
	"cover_image_url" varchar(1000),
	"listing_type" varchar(30) NOT NULL,
	"price_inr" integer NOT NULL,
	"compare_at_price_inr" integer,
	"currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"exam_id" uuid,
	"subject" varchar(255),
	"tags" jsonb DEFAULT '[]'::jsonb,
	"preview_content" text,
	"preview_url" text,
	"is_published" boolean DEFAULT false NOT NULL,
	"published_at" timestamp,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"purchase_count" integer DEFAULT 0,
	"view_count" integer DEFAULT 0,
	"avg_rating" real DEFAULT 0,
	"total_ratings" integer DEFAULT 0,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "marketplace_listings_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "marketplace_purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"creator_id" uuid NOT NULL,
	"amount_inr" integer NOT NULL,
	"platform_fee_inr" integer NOT NULL,
	"creator_earning_inr" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"payment_order_id" uuid,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"purchased_at" timestamp,
	"refunded_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promotions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"promotion_type" varchar(30) NOT NULL,
	"content_id" uuid,
	"listing_id" uuid,
	"classroom_id" uuid,
	"banner_image_url" varchar(1000),
	"headline" varchar(255),
	"description" text,
	"cta_text" varchar(100),
	"cta_url" varchar(500),
	"target_exams" jsonb DEFAULT '[]'::jsonb,
	"target_subjects" jsonb DEFAULT '[]'::jsonb,
	"budget_type" varchar(20) NOT NULL,
	"budget_amount_inr" integer,
	"spent_amount_inr" integer DEFAULT 0,
	"impressions" integer DEFAULT 0,
	"clicks" integer DEFAULT 0,
	"conversions" integer DEFAULT 0,
	"starts_at" timestamp NOT NULL,
	"ends_at" timestamp NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"approved_by" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_pool" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"period_month" varchar(7) NOT NULL,
	"free_view_count" integer DEFAULT 0 NOT NULL,
	"total_watch_minutes" integer DEFAULT 0 NOT NULL,
	"weighted_score" real DEFAULT 0 NOT NULL,
	"pool_share_inr" integer DEFAULT 0 NOT NULL,
	"total_pool_inr" integer DEFAULT 0 NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"distributed_at" timestamp,
	"breakdown" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_pool_creator_period_unique" UNIQUE("creator_id","period_month")
);
--> statement-breakpoint
ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_assignment_id_classroom_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."classroom_assignments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_exam_session_id_exam_sessions_id_fk" FOREIGN KEY ("exam_session_id") REFERENCES "public"."exam_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assignment_submissions" ADD CONSTRAINT "assignment_submissions_graded_by_users_id_fk" FOREIGN KEY ("graded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classroom_assignments" ADD CONSTRAINT "classroom_assignments_classroom_id_classrooms_id_fk" FOREIGN KEY ("classroom_id") REFERENCES "public"."classrooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classroom_assignments" ADD CONSTRAINT "classroom_assignments_content_id_creator_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."creator_content"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classroom_assignments" ADD CONSTRAINT "classroom_assignments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classroom_members" ADD CONSTRAINT "classroom_members_classroom_id_classrooms_id_fk" FOREIGN KEY ("classroom_id") REFERENCES "public"."classrooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classroom_members" ADD CONSTRAINT "classroom_members_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classroom_members" ADD CONSTRAINT "classroom_members_payment_order_id_payment_orders_id_fk" FOREIGN KEY ("payment_order_id") REFERENCES "public"."payment_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classrooms" ADD CONSTRAINT "classrooms_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classrooms" ADD CONSTRAINT "classrooms_creator_id_creator_profiles_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creator_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classrooms" ADD CONSTRAINT "classrooms_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_ratings" ADD CONSTRAINT "content_ratings_content_id_creator_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."creator_content"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_ratings" ADD CONSTRAINT "content_ratings_listing_id_marketplace_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."marketplace_listings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_ratings" ADD CONSTRAINT "content_ratings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_views" ADD CONSTRAINT "content_views_content_id_creator_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."creator_content"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_views" ADD CONSTRAINT "content_views_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_views" ADD CONSTRAINT "content_views_creator_id_creator_profiles_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creator_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_views" ADD CONSTRAINT "content_views_classroom_id_classrooms_id_fk" FOREIGN KEY ("classroom_id") REFERENCES "public"."classrooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_content" ADD CONSTRAINT "creator_content_creator_id_creator_profiles_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_content" ADD CONSTRAINT "creator_content_file_upload_id_file_uploads_id_fk" FOREIGN KEY ("file_upload_id") REFERENCES "public"."file_uploads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_content" ADD CONSTRAINT "creator_content_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_content" ADD CONSTRAINT "creator_content_syllabus_id_syllabi_id_fk" FOREIGN KEY ("syllabus_id") REFERENCES "public"."syllabi"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_content" ADD CONSTRAINT "creator_content_syllabus_node_id_syllabus_nodes_id_fk" FOREIGN KEY ("syllabus_node_id") REFERENCES "public"."syllabus_nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_earnings" ADD CONSTRAINT "creator_earnings_creator_id_creator_profiles_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_earnings" ADD CONSTRAINT "creator_earnings_source_purchase_id_marketplace_purchases_id_fk" FOREIGN KEY ("source_purchase_id") REFERENCES "public"."marketplace_purchases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_followers" ADD CONSTRAINT "creator_followers_creator_id_creator_profiles_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_followers" ADD CONSTRAINT "creator_followers_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_profiles" ADD CONSTRAINT "creator_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_wallets" ADD CONSTRAINT "creator_wallets_creator_id_creator_profiles_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doubt_responses" ADD CONSTRAINT "doubt_responses_doubt_id_doubts_id_fk" FOREIGN KEY ("doubt_id") REFERENCES "public"."doubts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doubt_responses" ADD CONSTRAINT "doubt_responses_responder_id_users_id_fk" FOREIGN KEY ("responder_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doubts" ADD CONSTRAINT "doubts_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doubts" ADD CONSTRAINT "doubts_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doubts" ADD CONSTRAINT "doubts_content_id_creator_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."creator_content"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doubts" ADD CONSTRAINT "doubts_syllabus_node_id_syllabus_nodes_id_fk" FOREIGN KEY ("syllabus_node_id") REFERENCES "public"."syllabus_nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doubts" ADD CONSTRAINT "doubts_classroom_id_classrooms_id_fk" FOREIGN KEY ("classroom_id") REFERENCES "public"."classrooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_uploads" ADD CONSTRAINT "file_uploads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_session_attendees" ADD CONSTRAINT "live_session_attendees_session_id_live_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."live_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_session_attendees" ADD CONSTRAINT "live_session_attendees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_creator_id_creator_profiles_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creator_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_classroom_id_classrooms_id_fk" FOREIGN KEY ("classroom_id") REFERENCES "public"."classrooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_recording_upload_id_file_uploads_id_fk" FOREIGN KEY ("recording_upload_id") REFERENCES "public"."file_uploads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_listings" ADD CONSTRAINT "marketplace_listings_creator_id_creator_profiles_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_listings" ADD CONSTRAINT "marketplace_listings_content_id_creator_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."creator_content"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_listings" ADD CONSTRAINT "marketplace_listings_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_purchases" ADD CONSTRAINT "marketplace_purchases_listing_id_marketplace_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."marketplace_listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_purchases" ADD CONSTRAINT "marketplace_purchases_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_purchases" ADD CONSTRAINT "marketplace_purchases_creator_id_creator_profiles_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creator_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketplace_purchases" ADD CONSTRAINT "marketplace_purchases_payment_order_id_payment_orders_id_fk" FOREIGN KEY ("payment_order_id") REFERENCES "public"."payment_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_creator_id_creator_profiles_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creator_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_content_id_creator_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."creator_content"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_listing_id_marketplace_listings_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."marketplace_listings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_classroom_id_classrooms_id_fk" FOREIGN KEY ("classroom_id") REFERENCES "public"."classrooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_pool" ADD CONSTRAINT "subscription_pool_creator_id_creator_profiles_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creator_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assignment_submissions_assignment_idx" ON "assignment_submissions" USING btree ("assignment_id");--> statement-breakpoint
CREATE INDEX "assignment_submissions_student_idx" ON "assignment_submissions" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "assignment_submissions_status_idx" ON "assignment_submissions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "classroom_assignments_classroom_idx" ON "classroom_assignments" USING btree ("classroom_id");--> statement-breakpoint
CREATE INDEX "classroom_assignments_content_idx" ON "classroom_assignments" USING btree ("content_id");--> statement-breakpoint
CREATE INDEX "classroom_assignments_due_idx" ON "classroom_assignments" USING btree ("due_at");--> statement-breakpoint
CREATE INDEX "classroom_members_classroom_idx" ON "classroom_members" USING btree ("classroom_id");--> statement-breakpoint
CREATE INDEX "classroom_members_student_idx" ON "classroom_members" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "classrooms_teacher_idx" ON "classrooms" USING btree ("teacher_id");--> statement-breakpoint
CREATE INDEX "classrooms_creator_idx" ON "classrooms" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "classrooms_exam_idx" ON "classrooms" USING btree ("exam_id");--> statement-breakpoint
CREATE INDEX "classrooms_join_code_idx" ON "classrooms" USING btree ("join_code");--> statement-breakpoint
CREATE INDEX "content_ratings_content_idx" ON "content_ratings" USING btree ("content_id");--> statement-breakpoint
CREATE INDEX "content_ratings_listing_idx" ON "content_ratings" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "content_ratings_user_idx" ON "content_ratings" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "content_views_content_idx" ON "content_views" USING btree ("content_id");--> statement-breakpoint
CREATE INDEX "content_views_user_idx" ON "content_views" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "content_views_creator_idx" ON "content_views" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "content_views_classroom_idx" ON "content_views" USING btree ("classroom_id");--> statement-breakpoint
CREATE INDEX "creator_content_creator_idx" ON "creator_content" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "creator_content_type_idx" ON "creator_content" USING btree ("content_type");--> statement-breakpoint
CREATE INDEX "creator_content_exam_idx" ON "creator_content" USING btree ("exam_id");--> statement-breakpoint
CREATE INDEX "creator_content_syllabus_node_idx" ON "creator_content" USING btree ("syllabus_node_id");--> statement-breakpoint
CREATE INDEX "creator_content_published_idx" ON "creator_content" USING btree ("is_published");--> statement-breakpoint
CREATE INDEX "creator_content_review_idx" ON "creator_content" USING btree ("review_status");--> statement-breakpoint
CREATE INDEX "creator_content_premium_idx" ON "creator_content" USING btree ("is_premium");--> statement-breakpoint
CREATE INDEX "creator_earnings_creator_idx" ON "creator_earnings" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "creator_earnings_status_idx" ON "creator_earnings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "creator_earnings_type_idx" ON "creator_earnings" USING btree ("earning_type");--> statement-breakpoint
CREATE INDEX "creator_followers_creator_idx" ON "creator_followers" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "creator_followers_student_idx" ON "creator_followers" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "creator_profiles_user_idx" ON "creator_profiles" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "creator_profiles_tier_idx" ON "creator_profiles" USING btree ("creator_tier");--> statement-breakpoint
CREATE INDEX "creator_profiles_verification_idx" ON "creator_profiles" USING btree ("verification_status");--> statement-breakpoint
CREATE INDEX "creator_profiles_featured_idx" ON "creator_profiles" USING btree ("is_featured");--> statement-breakpoint
CREATE INDEX "creator_wallets_creator_idx" ON "creator_wallets" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "doubt_responses_doubt_idx" ON "doubt_responses" USING btree ("doubt_id");--> statement-breakpoint
CREATE INDEX "doubt_responses_responder_idx" ON "doubt_responses" USING btree ("responder_id");--> statement-breakpoint
CREATE INDEX "doubts_student_idx" ON "doubts" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "doubts_creator_idx" ON "doubts" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "doubts_content_idx" ON "doubts" USING btree ("content_id");--> statement-breakpoint
CREATE INDEX "doubts_classroom_idx" ON "doubts" USING btree ("classroom_id");--> statement-breakpoint
CREATE INDEX "doubts_status_idx" ON "doubts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "file_uploads_user_idx" ON "file_uploads" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "file_uploads_status_idx" ON "file_uploads" USING btree ("processing_status");--> statement-breakpoint
CREATE INDEX "live_session_attendees_session_idx" ON "live_session_attendees" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "live_session_attendees_user_idx" ON "live_session_attendees" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "live_sessions_creator_idx" ON "live_sessions" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "live_sessions_classroom_idx" ON "live_sessions" USING btree ("classroom_id");--> statement-breakpoint
CREATE INDEX "live_sessions_scheduled_idx" ON "live_sessions" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "live_sessions_status_idx" ON "live_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "marketplace_listings_creator_idx" ON "marketplace_listings" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "marketplace_listings_exam_idx" ON "marketplace_listings" USING btree ("exam_id");--> statement-breakpoint
CREATE INDEX "marketplace_listings_status_idx" ON "marketplace_listings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "marketplace_listings_published_idx" ON "marketplace_listings" USING btree ("is_published");--> statement-breakpoint
CREATE INDEX "marketplace_purchases_listing_idx" ON "marketplace_purchases" USING btree ("listing_id");--> statement-breakpoint
CREATE INDEX "marketplace_purchases_buyer_idx" ON "marketplace_purchases" USING btree ("buyer_id");--> statement-breakpoint
CREATE INDEX "marketplace_purchases_creator_idx" ON "marketplace_purchases" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "marketplace_purchases_status_idx" ON "marketplace_purchases" USING btree ("status");--> statement-breakpoint
CREATE INDEX "promotions_creator_idx" ON "promotions" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "promotions_status_idx" ON "promotions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "promotions_type_idx" ON "promotions" USING btree ("promotion_type");--> statement-breakpoint
CREATE INDEX "promotions_window_idx" ON "promotions" USING btree ("starts_at","ends_at");--> statement-breakpoint
CREATE INDEX "subscription_pool_creator_idx" ON "subscription_pool" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "subscription_pool_period_idx" ON "subscription_pool" USING btree ("period_month");--> statement-breakpoint
CREATE INDEX "subscription_pool_status_idx" ON "subscription_pool" USING btree ("status");