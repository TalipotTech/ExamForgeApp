ALTER TABLE "questions" ADD COLUMN "syllabus_id" bigint;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "syllabus_name" varchar(500);--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "syllabus_node_id" bigint;--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "topic_name" varchar(500);--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_syllabus_id_syllabi_id_fk" FOREIGN KEY ("syllabus_id") REFERENCES "public"."syllabi"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_syllabus_node_id_syllabus_nodes_id_fk" FOREIGN KEY ("syllabus_node_id") REFERENCES "public"."syllabus_nodes"("id") ON DELETE no action ON UPDATE no action;