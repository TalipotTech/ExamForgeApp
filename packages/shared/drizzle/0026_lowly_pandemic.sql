CREATE TABLE "ai_tutor_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"classroom_id" uuid NOT NULL,
	"title" varchar(500) NOT NULL,
	"message_count" integer DEFAULT 0 NOT NULL,
	"total_input_tokens" integer DEFAULT 0 NOT NULL,
	"total_output_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer DEFAULT 0 NOT NULL,
	"estimated_cost_usd" real DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_tutor_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" varchar(20) NOT NULL,
	"content" text NOT NULL,
	"citations" jsonb DEFAULT '[]'::jsonb,
	"tokens_used" integer DEFAULT 0 NOT NULL,
	"cached" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_embeddings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_id" uuid NOT NULL,
	"syllabus_node_id" bigint,
	"chunk_index" integer NOT NULL,
	"source_text" text NOT NULL,
	"embedding" vector(1536),
	"token_count" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_tutor_conversations" ADD CONSTRAINT "ai_tutor_conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_tutor_conversations" ADD CONSTRAINT "ai_tutor_conversations_classroom_id_classrooms_id_fk" FOREIGN KEY ("classroom_id") REFERENCES "public"."classrooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_tutor_messages" ADD CONSTRAINT "ai_tutor_messages_conversation_id_ai_tutor_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_tutor_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_embeddings" ADD CONSTRAINT "content_embeddings_content_id_creator_content_id_fk" FOREIGN KEY ("content_id") REFERENCES "public"."creator_content"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_embeddings" ADD CONSTRAINT "content_embeddings_syllabus_node_id_syllabus_nodes_id_fk" FOREIGN KEY ("syllabus_node_id") REFERENCES "public"."syllabus_nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_tutor_conv_user_idx" ON "ai_tutor_conversations" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_tutor_conv_classroom_idx" ON "ai_tutor_conversations" USING btree ("classroom_id");--> statement-breakpoint
CREATE INDEX "ai_tutor_conv_user_updated_idx" ON "ai_tutor_conversations" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "ai_tutor_msgs_conv_idx" ON "ai_tutor_messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "content_embeddings_content_idx" ON "content_embeddings" USING btree ("content_id");--> statement-breakpoint
CREATE INDEX "content_embeddings_hnsw_idx" ON "content_embeddings" USING hnsw ("embedding" vector_cosine_ops);