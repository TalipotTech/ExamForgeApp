import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  bigint,
  index,
  vector,
} from "drizzle-orm/pg-core";
import { creatorContent } from "./creator-content";
import { syllabusNodes } from "./syllabus-nodes";

export const contentEmbeddings = pgTable(
  "content_embeddings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    contentId: uuid("content_id")
      .notNull()
      .references(() => creatorContent.id, { onDelete: "cascade" }),
    syllabusNodeId: bigint("syllabus_node_id", { mode: "number" }).references(
      () => syllabusNodes.id,
    ),
    chunkIndex: integer("chunk_index").notNull(),
    sourceText: text("source_text").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }),
    tokenCount: integer("token_count").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("content_embeddings_content_idx").on(table.contentId),
    index("content_embeddings_hnsw_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops"),
    ),
  ],
);
