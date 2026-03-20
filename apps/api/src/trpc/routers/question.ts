import { z } from "zod";
import { eq, ilike, sql, and, count } from "drizzle-orm";
import { questions, exams } from "@examforge/shared/db/schema";
import { createQuestionSchema } from "@examforge/shared/validators";
import { router, publicProcedure, protectedProcedure } from "../trpc.js";

const listInputSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  subject: z.string().optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
  examId: z.string().uuid().optional(),
  type: z.enum(["mcq", "true_false", "fill_blank", "match", "assertion"]).optional(),
  source: z.string().optional(),
});

export const questionRouter = router({
  list: publicProcedure.input(listInputSchema).query(
    async ({
      ctx,
      input,
    }): Promise<{
      items: Array<{
        id: string;
        examId: string;
        examName: string;
        type: string;
        content: Record<string, unknown>;
        subject: string;
        topic: string | null;
        difficulty: string;
        source: string | null;
        createdAt: Date;
        updatedAt: Date;
      }>;
      total: number;
      page: number;
      totalPages: number;
    }> => {
      const { page, limit, search, subject, difficulty, examId, type, source } = input;
      const offset = (page - 1) * limit;

      const conditions = [];

      if (examId) {
        conditions.push(eq(questions.examId, examId));
      }
      if (difficulty) {
        conditions.push(eq(questions.difficulty, difficulty));
      }
      if (type) {
        conditions.push(eq(questions.type, type));
      }
      if (subject) {
        conditions.push(ilike(questions.subject, `%${subject}%`));
      }
      if (source) {
        conditions.push(ilike(questions.source, `%${source}%`));
      }
      if (search) {
        conditions.push(
          sql`(${questions.content}->>'question' ILIKE ${`%${search}%`} OR ${questions.subject} ILIKE ${`%${search}%`})`,
        );
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [items, totalResult] = await Promise.all([
        ctx.db
          .select({
            id: questions.id,
            examId: questions.examId,
            examName: exams.name,
            type: questions.type,
            content: questions.content,
            subject: questions.subject,
            topic: questions.topic,
            difficulty: questions.difficulty,
            source: questions.source,
            createdAt: questions.createdAt,
            updatedAt: questions.updatedAt,
          })
          .from(questions)
          .innerJoin(exams, eq(questions.examId, exams.id))
          .where(whereClause)
          .orderBy(questions.createdAt)
          .limit(limit)
          .offset(offset),
        ctx.db
          .select({ count: count() })
          .from(questions)
          .innerJoin(exams, eq(questions.examId, exams.id))
          .where(whereClause),
      ]);

      const total = totalResult[0]?.count ?? 0;

      return {
        items,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      };
    },
  ),

  delete: publicProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }): Promise<{ success: true }> => {
      await ctx.db.delete(questions).where(eq(questions.id, input.id));
      return { success: true };
    }),

  bulkCreate: protectedProcedure
    .input(
      z.object({
        questions: z.array(createQuestionSchema).min(1).max(50),
      }),
    )
    .mutation(async ({ ctx, input }): Promise<{ success: true; count: number }> => {
      const inserted = await ctx.db
        .insert(questions)
        .values(
          input.questions.map((q) => ({
            examId: q.examId,
            type: q.content.type,
            content: q.content as Record<string, unknown>,
            subject: q.subject,
            topic: q.topic,
            difficulty: q.difficulty,
            source: q.source ?? "ai-generated",
            syllabusId: q.syllabusId ?? null,
            syllabusName: q.syllabusName ?? null,
            syllabusNodeId: q.syllabusNodeId ?? null,
            topicName: q.topicName ?? null,
            orgId: ctx.orgId,
          })),
        )
        .returning({ id: questions.id });
      return { success: true, count: inserted.length };
    }),

  /** Get existing question texts for dedup during generation */
  getExistingForTopic: protectedProcedure
    .input(
      z.object({
        examId: z.string().uuid(),
        topic: z.string().min(1),
      }),
    )
    .query(async ({ ctx, input }): Promise<string[]> => {
      const rows = await ctx.db
        .select({
          content: questions.content,
        })
        .from(questions)
        .where(and(eq(questions.examId, input.examId), ilike(questions.topic, `%${input.topic}%`)))
        .orderBy(sql`${questions.createdAt} DESC`)
        .limit(50);

      return rows
        .map((r) => {
          const c = r.content as Record<string, unknown>;
          const text = (c.question as string) ?? "";
          return text.length > 150 ? text.substring(0, 150) + "..." : text;
        })
        .filter((t) => t.length > 0);
    }),

  filters: publicProcedure.query(
    async ({
      ctx,
    }): Promise<{
      subjects: string[];
      sources: string[];
      exams: Array<{ id: string; name: string }>;
    }> => {
      const [subjectRows, sourceRows, examRows] = await Promise.all([
        ctx.db
          .selectDistinct({ subject: questions.subject })
          .from(questions)
          .orderBy(questions.subject),
        ctx.db
          .selectDistinct({ source: questions.source })
          .from(questions)
          .where(sql`${questions.source} IS NOT NULL`),
        ctx.db
          .select({ id: exams.id, name: exams.name })
          .from(exams)
          .where(eq(exams.isActive, true))
          .orderBy(exams.name),
      ]);

      return {
        subjects: subjectRows.map((r) => r.subject),
        sources: sourceRows.map((r) => r.source).filter((s): s is string => s !== null),
        exams: examRows,
      };
    },
  ),
});
