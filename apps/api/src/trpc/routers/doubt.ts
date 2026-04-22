import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { doubts } from "@examforge/shared/db/schema";
import { router, protectedProcedure } from "../trpc.js";
import { assertCreatorsFeature } from "../../services/creators-gate.js";

export const doubtRouter = router({
  myDoubts: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(50) }).optional())
    .query(async ({ ctx, input }) => {
      await assertCreatorsFeature(ctx.db, "creators.doubts_enabled");
      return ctx.db
        .select()
        .from(doubts)
        .where(eq(doubts.studentId, ctx.userId))
        .orderBy(desc(doubts.createdAt))
        .limit(input?.limit ?? 50);
    }),

  ask: protectedProcedure
    .input(
      z.object({
        questionText: z.string().min(5).max(4000),
        creatorId: z.string().uuid().optional(),
        contentId: z.string().uuid().optional(),
        classroomId: z.string().uuid().optional(),
        syllabusNodeId: z.number().int().positive().optional(),
        isPublic: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertCreatorsFeature(ctx.db, "creators.doubts_enabled");
      const [created] = await ctx.db
        .insert(doubts)
        .values({
          studentId: ctx.userId,
          questionText: input.questionText,
          creatorId: input.creatorId,
          contentId: input.contentId,
          classroomId: input.classroomId,
          syllabusNodeId: input.syllabusNodeId,
          isPublic: input.isPublic,
        })
        .returning({ id: doubts.id });
      if (!created) {
        throw new Error("Failed to create doubt");
      }
      return { id: created.id };
    }),

  inbox: protectedProcedure.query(async ({ ctx }) => {
    await assertCreatorsFeature(ctx.db, "creators.doubts_enabled");
    return ctx.db
      .select()
      .from(doubts)
      .where(and(eq(doubts.creatorId, ctx.userId), eq(doubts.status, "open")))
      .orderBy(desc(doubts.createdAt))
      .limit(50);
  }),
});
