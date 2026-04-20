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
import { learnRouter } from "./routers/learn.js";
import { publicContentRouter } from "./routers/public-content.js";
import { onboardingRouter } from "./routers/onboarding.js";
import { aiChatRouter } from "./routers/ai-chat.js";
import { voiceTutorRouter } from "./routers/voice-tutor.js";
import { examPatternRouter } from "./routers/exam-pattern.js";
import { questionVerificationRouter } from "./routers/question-verification.js";
import { topicGenerationRouter } from "./routers/topic-generation.js";

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
  learn: learnRouter,
  publicContent: publicContentRouter,
  onboarding: onboardingRouter,
  aiChat: aiChatRouter,
  voiceTutor: voiceTutorRouter,
  examPattern: examPatternRouter,
  questionVerification: questionVerificationRouter,
  topicGeneration: topicGenerationRouter,
});

export type AppRouter = typeof appRouter;
