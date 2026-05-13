export { organizations } from "./organizations";
export { users, userRoleEnum } from "./users";
export { exams } from "./exams";
export type { ExamPattern } from "./exams";
export { questions, difficultyEnum, questionTypeEnum } from "./questions";
export type { TranslationContent, Translations } from "./questions";
export { examSessions } from "./exam-sessions";
export { aiUsageLogs } from "./ai-usage-logs";
export { scrapeSources, scrapeStatusEnum } from "./scrape-sources";
export type { ScrapeSourceConfig } from "./scrape-sources";
export { questionVersions, changeTypeEnum } from "./question-versions";
export { questionVerifications } from "./question-verifications";
export { examNotifications } from "./exam-notifications";
export { scrapeRuns } from "./scrape-runs";
export { discoveryRuns } from "./discovery-runs";
export { syllabi } from "./syllabi";
export { syllabusNodes } from "./syllabus-nodes";
export { tutorials } from "./tutorials";
export type { TutorialContent, TutorialSection } from "./tutorials";
export { tutorialQuestions } from "./tutorial-questions";
export { portalDocuments } from "./portal-documents";
export { stagedQuestions } from "./staged-questions";
export { contentSearches } from "./content-searches";
export { searchResults } from "./search-results";
export { userSavedContent } from "./user-saved-content";

// Auth, Payments & Admin
export { otpVerifications } from "./otp-verifications";
export { authSessions } from "./auth-sessions";
export { adminFeatureFlags } from "./admin-feature-flags";
export { paymentOrders } from "./payment-orders";
export { adminAuditLog } from "./admin-audit-log";
export { subscriptionPlans } from "./subscription-plans";
export { userSubscriptions } from "./user-subscriptions";
export { userCredits } from "./user-credits";
export { userExams } from "./user-exams";
export { userProgress } from "./user-progress";
export { topicConversations } from "./topic-conversations";
export { aiConversations } from "./ai-conversations";
export { topicNotes } from "./topic-notes";
export { topicNoteSummaries } from "./topic-note-summaries";

// Tutorial Agent (HTML-based)
export { tutorialFiles } from "./tutorial-files";
export type { TutorialFileSection } from "./tutorial-files";
export { tutorialProgress } from "./tutorial-progress";
export { userGeneratedExams } from "./user-generated-exams";
export type { UserGeneratedQuestion } from "./user-generated-exams";
export { tutorialGenerationJobs } from "./tutorial-generation-jobs";
export type { GenerationProgressEntry } from "./tutorial-generation-jobs";

// Voice Tutor
export { voiceSessions } from "./voice-sessions";
export type { VoiceSessionQuestion, VoiceConversationEntry } from "./voice-sessions";
export { ttsUsageLogs } from "./tts-usage-logs";

// Exam Pattern Intelligence
export { examPatterns } from "./exam-patterns";
export type {
  ExamFingerprint,
  SubjectWeightage,
  TopicFrequency,
  DifficultyDistribution,
  StyleDistribution,
  RepeatAnalysis,
  LanguagePatterns,
  SectionStructure,
} from "./exam-patterns";
export { paperAnalysis } from "./paper-analysis";
export type { RepeatedFromEntry } from "./paper-analysis";

// Creators Ecosystem (Phase A foundation — gated by creators.enabled flag)
export { creatorProfiles } from "./creator-profiles";
export type { CreatorKycDetails, CreatorBankDetails, CreatorSocialLinks } from "./creator-profiles";
export { fileUploads } from "./file-uploads";
export type { ProcessedVariants } from "./file-uploads";
export { creatorContent } from "./creator-content";
export { classrooms } from "./classrooms";
export type { ClassroomSettings, ClassroomSchedule } from "./classrooms";
export { classroomMembers } from "./classroom-members";
export { classroomAssignments } from "./classroom-assignments";
export type { ExamSessionConfig } from "./classroom-assignments";
export { assignmentSubmissions } from "./assignment-submissions";
export { doubts } from "./doubts";
export type { DoubtImage } from "./doubts";
export { doubtResponses } from "./doubt-responses";
export { liveSessions } from "./live-sessions";
export { liveSessionAttendees } from "./live-session-attendees";
export { creatorZoomIntegrations } from "./creator-zoom-integrations";
export { creatorFollowers } from "./creator-followers";
export { contentViews } from "./content-views";
export { marketplaceListings } from "./marketplace-listings";
export { marketplacePurchases } from "./marketplace-purchases";
export { creatorWallets } from "./creator-wallets";
export { creatorEarnings } from "./creator-earnings";
export { contentRatings } from "./content-ratings";
export { subscriptionPool } from "./subscription-pool";
export { promotions } from "./promotions";
