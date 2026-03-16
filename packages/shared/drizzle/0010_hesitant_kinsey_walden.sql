CREATE TABLE "tutorial_progress" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"tutorial_file_id" bigint NOT NULL,
	"syllabus_id" bigint NOT NULL,
	"syllabus_node_id" bigint NOT NULL,
	"sections_read" jsonb DEFAULT '[]'::jsonb,
	"completion_percent" integer DEFAULT 0 NOT NULL,
	"last_read_at" timestamp DEFAULT now() NOT NULL,
	"total_read_time_seconds" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tutorial_files" ADD COLUMN "sections" jsonb;--> statement-breakpoint
ALTER TABLE "tutorial_files" ADD COLUMN "plain_text" text;--> statement-breakpoint
ALTER TABLE "tutorial_progress" ADD CONSTRAINT "tutorial_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutorial_progress" ADD CONSTRAINT "tutorial_progress_tutorial_file_id_tutorial_files_id_fk" FOREIGN KEY ("tutorial_file_id") REFERENCES "public"."tutorial_files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutorial_progress" ADD CONSTRAINT "tutorial_progress_syllabus_id_syllabi_id_fk" FOREIGN KEY ("syllabus_id") REFERENCES "public"."syllabi"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutorial_progress" ADD CONSTRAINT "tutorial_progress_syllabus_node_id_syllabus_nodes_id_fk" FOREIGN KEY ("syllabus_node_id") REFERENCES "public"."syllabus_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tutorial_progress_user_file_idx" ON "tutorial_progress" USING btree ("user_id","tutorial_file_id");--> statement-breakpoint
CREATE INDEX "tutorial_progress_user_syllabus_idx" ON "tutorial_progress" USING btree ("user_id","syllabus_id");