ALTER TABLE "image_generations" ADD COLUMN "syllabus_node_id" bigint;--> statement-breakpoint
ALTER TABLE "syllabus_nodes" ADD COLUMN "image_url" varchar(1000);--> statement-breakpoint
ALTER TABLE "syllabus_nodes" ADD COLUMN "image_key" varchar(500);--> statement-breakpoint
ALTER TABLE "syllabus_nodes" ADD COLUMN "image_status" varchar(20) DEFAULT 'none';--> statement-breakpoint
ALTER TABLE "syllabus_nodes" ADD COLUMN "image_content_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "image_generations" ADD CONSTRAINT "image_generations_syllabus_node_id_syllabus_nodes_id_fk" FOREIGN KEY ("syllabus_node_id") REFERENCES "public"."syllabus_nodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_image_gen_syllabus_node" ON "image_generations" USING btree ("syllabus_node_id");