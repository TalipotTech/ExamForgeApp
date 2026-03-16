import { Worker } from "bullmq";
import { eq, sql, and } from "drizzle-orm";
import { createDatabase } from "@examforge/shared/db";
import { getBullMQConnection } from "../lib/bullmq-connection.js";
import { NOTE_SUMMARY_QUEUE_NAME } from "../queues/note-summary-queue.js";
import { topicNotes, topicNoteSummaries, syllabusNodes } from "@examforge/shared/db/schema";
import { routeTextRequest } from "../ai/ai-router.js";

const MIN_NOTES_FOR_SUMMARY = 3;

export function createNoteSummaryWorker(): Worker {
  const db = createDatabase(process.env.DATABASE_URL!);

  const worker = new Worker(
    NOTE_SUMMARY_QUEUE_NAME,
    async (job) => {
      console.log(`[note-summary] Starting summary generation (${job.data.trigger})`);

      // Find syllabus nodes with enough public notes
      const nodesWithNotes = await db
        .select({
          syllabusNodeId: topicNotes.syllabusNodeId,
          syllabusId: topicNotes.syllabusId,
          noteCount: sql<number>`count(*)::int`,
        })
        .from(topicNotes)
        .where(eq(topicNotes.isPublic, true))
        .groupBy(topicNotes.syllabusNodeId, topicNotes.syllabusId)
        .having(sql`count(*) >= ${MIN_NOTES_FOR_SUMMARY}`);

      console.log(
        `[note-summary] Found ${nodesWithNotes.length} nodes with ${MIN_NOTES_FOR_SUMMARY}+ public notes`,
      );

      let generated = 0;

      for (const nodeInfo of nodesWithNotes) {
        try {
          // Get the node title
          const [node] = await db
            .select({ title: syllabusNodes.title })
            .from(syllabusNodes)
            .where(eq(syllabusNodes.id, nodeInfo.syllabusNodeId))
            .limit(1);

          if (!node) continue;

          // Get public notes for this node
          const notes = await db
            .select({ noteContent: topicNotes.noteContent })
            .from(topicNotes)
            .where(
              and(
                eq(topicNotes.syllabusNodeId, nodeInfo.syllabusNodeId),
                eq(topicNotes.isPublic, true),
              ),
            )
            .limit(20);

          const notesText = notes.map((n) => n.noteContent).join("\n\n---\n\n");

          // Generate summary using AI
          const result = await routeTextRequest(
            {
              task: "topic_chat",
              prompt: `Summarize the following student notes about "${node.title}" into a concise, informative paragraph (150-200 words) that would help someone understand this topic. Focus on key concepts and important points.\n\nNotes:\n${notesText.substring(0, 8000)}`,
              systemPrompt:
                "You are a concise academic summarizer. Create brief, accurate summaries from student notes. Write in clear, professional language suitable for exam preparation material.",
              userId: "system",
              temperature: 0.3,
              maxTokens: 500,
            },
            db,
          );

          // Upsert summary
          const [existing] = await db
            .select({ id: topicNoteSummaries.id })
            .from(topicNoteSummaries)
            .where(eq(topicNoteSummaries.syllabusNodeId, nodeInfo.syllabusNodeId))
            .limit(1);

          const now = new Date();

          if (existing) {
            await db
              .update(topicNoteSummaries)
              .set({
                summaryText: result.data,
                noteCount: nodeInfo.noteCount,
                lastGeneratedAt: now,
                updatedAt: now,
              })
              .where(eq(topicNoteSummaries.id, existing.id));
          } else {
            await db.insert(topicNoteSummaries).values({
              syllabusNodeId: nodeInfo.syllabusNodeId,
              syllabusId: nodeInfo.syllabusId,
              summaryText: result.data,
              noteCount: nodeInfo.noteCount,
              lastGeneratedAt: now,
            });
          }

          // Mark node as having public summary
          await db
            .update(syllabusNodes)
            .set({ publicSummaryAvailable: true, updatedAt: now })
            .where(eq(syllabusNodes.id, nodeInfo.syllabusNodeId));

          generated++;
        } catch (err) {
          console.error(`[note-summary] Failed for node ${nodeInfo.syllabusNodeId}:`, err);
        }
      }

      console.log(`[note-summary] Generated ${generated} summaries`);
      return { generated, total: nodesWithNotes.length };
    },
    {
      connection: getBullMQConnection(),
      concurrency: 1,
    },
  );

  worker.on("completed", (job) => {
    console.log(`[note-summary] Job ${job?.id} completed:`, job?.returnvalue);
  });

  worker.on("failed", (job, err) => {
    console.error(`[note-summary] Job ${job?.id} failed:`, err);
  });

  return worker;
}
