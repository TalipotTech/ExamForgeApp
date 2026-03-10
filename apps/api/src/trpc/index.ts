import { router } from "./trpc.js";
import { healthRouter } from "./routers/health.js";
import { questionRouter } from "./routers/question.js";
import { examSessionRouter } from "./routers/exam-session.js";

export const appRouter = router({
  health: healthRouter,
  question: questionRouter,
  examSession: examSessionRouter,
});

export type AppRouter = typeof appRouter;
