import { router } from "./trpc.js";
import { healthRouter } from "./routers/health.js";
import { questionRouter } from "./routers/question.js";
import { examSessionRouter } from "./routers/exam-session.js";
import { scrapeRouter } from "./routers/scrape.js";
import { examRouter } from "./routers/exam.js";
import { scrapeSourceRouter } from "./routers/scrape-source.js";
import { syllabusRouter } from "./routers/syllabus.js";
import { contentFinderRouter } from "./routers/content-finder.js";
import { portalIngestionRouter } from "./routers/portal-ingestion.js";
import { authRouter } from "./routers/auth.js";
import { paymentRouter } from "./routers/payment.js";
import { adminUsersRouter } from "./routers/admin-users.js";
import { adminSettingsRouter } from "./routers/admin-settings.js";
import { tutorialAgentRouter } from "./routers/tutorial-agent.js";

export const appRouter = router({
  health: healthRouter,
  question: questionRouter,
  examSession: examSessionRouter,
  scrape: scrapeRouter,
  exam: examRouter,
  scrapeSource: scrapeSourceRouter,
  syllabus: syllabusRouter,
  contentFinder: contentFinderRouter,
  portalIngestion: portalIngestionRouter,
  auth: authRouter,
  payment: paymentRouter,
  adminUsers: adminUsersRouter,
  adminSettings: adminSettingsRouter,
  tutorialAgent: tutorialAgentRouter,
});

export type AppRouter = typeof appRouter;
