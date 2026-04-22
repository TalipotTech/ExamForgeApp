import { z } from "zod";
import { and, asc, eq, gt } from "drizzle-orm";
import { liveSessions } from "@examforge/shared/db/schema";
import { router, protectedProcedure } from "../trpc.js";
import { assertCreatorsFeature } from "../../services/creators-gate.js";

export const liveSessionRouter = router({
  upcoming: protectedProcedure
    .input(
      z
        .object({
          classroomId: z.string().uuid().optional(),
          limit: z.number().int().min(1).max(50).default(10),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      await assertCreatorsFeature(ctx.db, "creators.live_sessions_enabled");
      const conds = [
        eq(liveSessions.status, "scheduled"),
        gt(liveSessions.scheduledAt, new Date()),
      ];
      if (input?.classroomId) {
        conds.push(eq(liveSessions.classroomId, input.classroomId));
      }
      return ctx.db
        .select()
        .from(liveSessions)
        .where(and(...conds))
        .orderBy(asc(liveSessions.scheduledAt))
        .limit(input?.limit ?? 10);
    }),
});
