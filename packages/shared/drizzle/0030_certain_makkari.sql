CREATE TABLE "content_demand_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"syllabus_node_id" bigint NOT NULL,
	"exam_id" uuid,
	"org_id" uuid,
	"signal_type" varchar(30) NOT NULL,
	"user_id" uuid,
	"weight" numeric(4, 1) DEFAULT '1.0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learning_path_assessments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"org_id" uuid,
	"exam_id" uuid NOT NULL,
	"subject" varchar(255),
	"signals_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"summary" text,
	"strengths_json" jsonb DEFAULT '[]'::jsonb,
	"improvements_json" jsonb DEFAULT '[]'::jsonb,
	"overall_score" numeric(4, 2),
	"generation_model" varchar(50),
	"generation_cost" numeric(8, 4),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "node_understanding" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"org_id" uuid,
	"exam_id" uuid,
	"syllabus_node_id" bigint NOT NULL,
	"level" varchar(10) DEFAULT 'green' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topic_search_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"org_id" uuid,
	"exam_id" uuid,
	"query" varchar(500) NOT NULL,
	"matched_node_id" bigint,
	"result_count" integer DEFAULT 0,
	"was_rejected" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_demand_signals" ADD CONSTRAINT "content_demand_signals_syllabus_node_id_syllabus_nodes_id_fk" FOREIGN KEY ("syllabus_node_id") REFERENCES "public"."syllabus_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_demand_signals" ADD CONSTRAINT "content_demand_signals_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_demand_signals" ADD CONSTRAINT "content_demand_signals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_path_assessments" ADD CONSTRAINT "learning_path_assessments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learning_path_assessments" ADD CONSTRAINT "learning_path_assessments_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node_understanding" ADD CONSTRAINT "node_understanding_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node_understanding" ADD CONSTRAINT "node_understanding_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "node_understanding" ADD CONSTRAINT "node_understanding_syllabus_node_id_syllabus_nodes_id_fk" FOREIGN KEY ("syllabus_node_id") REFERENCES "public"."syllabus_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_search_history" ADD CONSTRAINT "topic_search_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_search_history" ADD CONSTRAINT "topic_search_history_exam_id_exams_id_fk" FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_search_history" ADD CONSTRAINT "topic_search_history_matched_node_id_syllabus_nodes_id_fk" FOREIGN KEY ("matched_node_id") REFERENCES "public"."syllabus_nodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_demand_signals_node_idx" ON "content_demand_signals" USING btree ("syllabus_node_id");--> statement-breakpoint
CREATE INDEX "content_demand_signals_created_idx" ON "content_demand_signals" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "learning_path_assessments_lookup_idx" ON "learning_path_assessments" USING btree ("user_id","exam_id","subject","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "node_understanding_user_node_idx" ON "node_understanding" USING btree ("user_id","syllabus_node_id");--> statement-breakpoint
CREATE INDEX "node_understanding_user_idx" ON "node_understanding" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "node_understanding_node_idx" ON "node_understanding" USING btree ("syllabus_node_id");--> statement-breakpoint
CREATE INDEX "topic_search_history_user_created_idx" ON "topic_search_history" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "topic_search_history_matched_node_idx" ON "topic_search_history" USING btree ("matched_node_id");