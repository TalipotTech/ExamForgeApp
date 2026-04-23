export {
  mcqContentSchema,
  trueFalseContentSchema,
  fillBlankContentSchema,
  matchContentSchema,
  assertionContentSchema,
  questionContentSchema,
  createQuestionSchema,
} from "./question";
export type {
  McqContent,
  TrueFalseContent,
  FillBlankContent,
  MatchContent,
  AssertionContent,
  QuestionContent,
  CreateQuestion,
} from "./question";

export {
  createExamSchema,
  updateExamSchema,
  examSessionStartSchema,
  examSessionSaveSchema,
  examSessionSubmitSchema,
} from "./exam";
export type {
  CreateExam,
  UpdateExam,
  ExamSessionStart,
  ExamSessionSave,
  ExamSessionSubmit,
} from "./exam";

export {
  generateQuestionsInputSchema,
  generatedQuestionSchema,
  generatedQuestionsResponseSchema,
} from "./ai-generate";
export type {
  GenerateQuestionsInput,
  GeneratedQuestion,
  GeneratedQuestionsResponse,
} from "./ai-generate";

export {
  scrapeJobDataSchema,
  extractedQuestionSchema,
  extractedQuestionsResponseSchema,
  scrapeProgressSchema,
} from "./scrape";
export type {
  ScrapeJobData,
  ExtractedQuestion,
  ExtractedQuestionsResponse,
  ScrapeProgress,
} from "./scrape";

export {
  createScrapeSourceSchema,
  updateScrapeSourceSchema,
  scrapeSourceFilterSchema,
} from "./scrape-source";
export type { CreateScrapeSource, UpdateScrapeSource, ScrapeSourceFilter } from "./scrape-source";

export {
  examListingFilterSchema,
  updateExamAdminSchema,
  examNotificationSchema,
  discoveredExamSchema,
  discoveredNotificationSchema,
  discoveryAgentResponseSchema,
  sourceAnalysisResponseSchema,
  runDiscoveryInputSchema,
} from "./exam-listing";
export type {
  ExamListingFilter,
  UpdateExamAdmin,
  ExamNotification,
  DiscoveredExam,
  DiscoveredNotification,
  DiscoveryAgentResponse,
  SourceAnalysisResponse,
  RunDiscoveryInput,
} from "./exam-listing";

export {
  aiProviderIdSchema,
  syllabusNodeTypeSchema,
  syllabusNodeSchema,
  syllabusTreeSchema,
  createSyllabusSchema,
  processSyllabusSchema,
  generateTutorialInputSchema,
  generateMCQsInputSchema,
  createExamFromNodesSchema,
  syllabusJobDataSchema,
} from "./syllabus";
export type {
  AIProviderId,
  SyllabusNodeType,
  SyllabusNodeInput,
  SyllabusTree,
  CreateSyllabus,
  ProcessSyllabus,
  GenerateTutorialInput,
  GenerateMCQsInput,
  CreateExamFromNodes,
  SyllabusJobData,
} from "./syllabus";

export {
  tutorialSectionTypeSchema,
  tutorialSectionSchema,
  keyDefinitionSchema,
  formulaSchema,
  mnemonicSchema,
  tutorialContentSchema,
} from "./tutorial";
export type {
  TutorialSectionType,
  TutorialSection as TutorialSectionValidator,
  KeyDefinition,
  Formula,
  Mnemonic,
  TutorialContentValidator,
} from "./tutorial";

export {
  ingestPortalSchema,
  ingestDirectPdfSchema,
  portalPageEntrySchema,
  answerKeySchema,
  descriptiveQuestionSchema,
  portalMCQSchema,
  portalDocumentFilterSchema,
  processDocumentsSchema,
  approveQuestionsSchema,
  rejectQuestionsSchema,
  mapExamSchema,
  stagedQuestionFilterSchema,
} from "./portal-ingestion";
export type {
  IngestPortal,
  IngestDirectPdf,
  PortalPageEntry,
  AnswerKey,
  DescriptiveQuestion,
  PortalMCQ,
  PortalDocumentFilter,
  ProcessDocuments,
  ApproveQuestions,
  RejectQuestions,
  MapExam,
  StagedQuestionFilter,
} from "./portal-ingestion";

export {
  searchQuerySchema,
  parsedQuerySchema,
  searchResultItemSchema,
  saveResultSchema,
  extractQuestionsSchema,
  extractSyllabusSchema,
} from "./content-finder";
export type {
  SearchQuery,
  ParsedQuery,
  SearchResultItem,
  SaveResult,
  ExtractQuestions,
  ExtractSyllabus,
} from "./content-finder";

export {
  startTutorialGenerationSchema,
  tutorialJobIdSchema,
  regenerateTopicSchema,
  getTutorialForNodeSchema,
  listTutorialsForSyllabusSchema,
  generateUserExamSchema,
  listUserExamsSchema,
  getUserExamByIdSchema,
  deleteUserExamSchema,
  generateMultiTopicExamSchema,
  generateBatchExamsSchema,
  generateExamFromNotesSchema,
  startUserExamSchema,
  submitUserExamSchema,
  tutorialAgentJobDataSchema,
} from "./tutorial-agent";
export type {
  StartTutorialGeneration,
  TutorialJobId,
  RegenerateTopic,
  GetTutorialForNode,
  ListTutorialsForSyllabus,
  GenerateUserExam,
  GenerateMultiTopicExam,
  GenerateBatchExams,
  GenerateExamFromNotes,
  ListUserExams,
  GetUserExamById,
  DeleteUserExam,
  StartUserExam,
  SubmitUserExam,
  TutorialAgentJobData,
} from "./tutorial-agent";

export {
  getSyllabusLearningTreeSchema,
  getTutorialContentSchema,
  markSectionReadSchema,
  markTopicCompleteSchema,
  searchTutorialsSchema,
  getNavigationOrderSchema,
  sendChatMessageSchema,
  getConversationsForNodeSchema,
  saveNoteFromChatSchema,
  getNotesForNodeSchema,
  getUserProfileStatsSchema,
  getUserKeywordsSchema,
  getUserNotesSchema,
  getUserTopicsWithContentSchema,
} from "./learn";
export type {
  GetSyllabusLearningTree,
  GetTutorialContent,
  MarkSectionRead,
  MarkTopicComplete,
  SearchTutorials,
  GetNavigationOrder,
  SendChatMessage,
  GetConversationsForNode,
  SaveNoteFromChat,
  GetNotesForNode,
  GetUserProfileStats,
  GetUserKeywords,
  GetUserNotes,
  GetUserTopicsWithContent,
} from "./learn";

export {
  registerSchema,
  loginSchema,
  loginWithOtpRequestSchema,
  loginWithOtpVerifySchema,
  loginWithPinSchema,
  setPinSchema,
  removePinSchema,
  verifyOtpSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  resendOtpSchema,
  updateUserAdminSchema,
} from "./auth";
export type {
  RegisterInput,
  LoginInput,
  LoginWithOtpRequestInput,
  LoginWithOtpVerifyInput,
  LoginWithPinInput,
  SetPinInput,
  RemovePinInput,
  VerifyOtpInput,
  ForgotPasswordInput,
  ResetPasswordInput,
  ResendOtpInput,
  UpdateUserAdminInput,
} from "./auth";

export { saveSelectedExamsSchema, getOnboardingStatusSchema } from "./onboarding";
export type { SaveSelectedExams, GetOnboardingStatus } from "./onboarding";

export {
  aiChatProviderEnum,
  sendAiChatMessageSchema,
  listAiConversationsSchema,
  getAiConversationSchema,
  deleteAiConversationSchema,
} from "./ai-chat";
export type {
  SendAiChatMessage,
  ListAiConversations,
  GetAiConversation,
  DeleteAiConversation,
} from "./ai-chat";

export {
  voiceTutorModeSchema,
  startVoiceSessionSchema,
  submitVoiceAnswerSchema,
  teacherRespondSchema,
  completeVoiceSessionSchema,
  listVoiceSessionsSchema,
  getVoiceSessionSchema,
  teacherResponseSchema,
} from "./voice-tutor";
export type {
  VoiceTutorMode,
  StartVoiceSession,
  SubmitVoiceAnswer,
  TeacherRespond,
  CompleteVoiceSession,
  ListVoiceSessions,
  GetVoiceSession,
  TeacherResponse,
} from "./voice-tutor";

export {
  questionStyleEnum,
  classifiedQuestionSchema,
  classifiedQuestionsResponseSchema,
  subjectWeightageSchema,
  topicFrequencySchema,
  difficultyDistributionSchema,
  styleDistributionSchema,
  repeatAnalysisSchema,
  languagePatternsSchema,
  sectionStructureSchema,
  examFingerprintSchema,
  classifyPaperInputSchema,
  analyzePatternInputSchema,
  getPatternInputSchema,
  getPaperAnalysisInputSchema,
  generatePatternExamInputSchema,
  getTopicPredictionsInputSchema,
  getRepeatCandidatesInputSchema,
  getClassificationStatusInputSchema,
  patternGeneratedQuestionSchema,
  patternGeneratedExamSchema,
} from "./exam-pattern";
export type {
  QuestionStyle,
  ClassifiedQuestion,
  ClassifiedQuestionsResponse,
  ExamFingerprintInput,
  PatternGeneratedExam,
} from "./exam-pattern";

// ─── Universal Discovery Agent v2 ───────────────────────

export {
  discoveryItemCategorySchema,
  discoveryLinkTypeSchema,
  discoveryLinkFormatSchema,
  discoveryLinkLanguageSchema,
  discoveryItemStatusSchema,
  pageTypeSchema,
  discoveryDatesSchema,
  discoveryLinkSchema,
  discoveredItemSchema,
  discoveryPaginationSchema,
  discoveryPageMetadataSchema,
  discoveryPageResultSchema,
  examContentCompletenessSchema,
  runUniversalDiscoveryInputSchema,
  runDeepDiscoveryInputSchema,
  runExamValidationInputSchema,
} from "./discovery";
export type {
  DiscoveryItemCategory,
  DiscoveryLinkType,
  DiscoveryLinkFormat,
  DiscoveryLinkLanguage,
  DiscoveryItemStatus,
  DiscoveryPageType,
  DiscoveryDates,
  DiscoveryLink,
  DiscoveredItem,
  DiscoveryPagination,
  DiscoveryPageMetadata,
  DiscoveryPageResult,
  ExamContentCompleteness,
  RunUniversalDiscoveryInput,
  RunDeepDiscoveryInput,
  RunExamValidationInput,
} from "./discovery";

// ─── Creators Ecosystem — Content ───────────────────────

export {
  creatorContentTypeSchema,
  mediaItemTypeSchema,
  mediaItemSchema,
  contentIdInputSchema,
  updateContentSchema,
  removeMediaSchema,
  myContentListSchema,
} from "./creator-content";
export type {
  CreatorContentType,
  MediaItemType,
  MediaItem,
  ContentIdInput,
  UpdateContentInput,
  RemoveMediaInput,
  MyContentListInput,
} from "./creator-content";

// ─── Creators Ecosystem — Classrooms ────────────────────

export {
  billingCycleSchema,
  classroomSettingsSchema,
  classroomScheduleSchema,
  createClassroomSchema,
  updateClassroomSchema,
  classroomIdInputSchema,
  joinClassroomByCodeSchema,
  assignContentToClassroomSchema,
  removeMemberSchema,
} from "./classroom";
export type {
  BillingCycle,
  ClassroomSettingsInput,
  ClassroomScheduleInput,
  CreateClassroomInput,
  UpdateClassroomInput,
  ClassroomIdInput,
  JoinClassroomByCodeInput,
  AssignContentToClassroomInput,
  RemoveMemberInput,
} from "./classroom";

// ─── Creators Ecosystem — Doubts ────────────────────────

export {
  doubtStatusSchema,
  askDoubtSchema,
  respondToDoubtSchema,
  doubtIdInputSchema,
  classroomDoubtsInputSchema,
  myDoubtsInputSchema,
} from "./doubt";
export type {
  DoubtStatus,
  AskDoubtInput,
  RespondToDoubtInput,
  DoubtIdInput,
  ClassroomDoubtsInput,
  MyDoubtsInput,
} from "./doubt";

// ─── Creators Ecosystem — Marketplace ───────────────────

export {
  marketplaceListingTypeSchema,
  marketplaceListingStatusSchema,
  createMarketplaceListingSchema,
  updateMarketplaceListingSchema,
  marketplaceBrowseFilterSchema,
  createPurchaseOrderSchema,
  verifyPurchaseSchema,
  rateListingSchema,
  requestPayoutSchema,
} from "./marketplace";
export type {
  MarketplaceListingType,
  MarketplaceListingStatus,
  CreateMarketplaceListing,
  UpdateMarketplaceListing,
  MarketplaceBrowseFilter,
  CreatePurchaseOrderInput,
  VerifyPurchaseInput,
  RateListingInput,
  RequestPayoutInput,
} from "./marketplace";

// ─── Question verification pipeline ─────────────────────

export {
  sourceTypeEnum,
  answerSourceEnum,
  verificationStatusEnum,
  verificationLayerEnum,
  verificationResultEnum,
  realPaperSourceDetailSchema,
  textbookSourceDetailSchema,
  aiSourceDetailSchema,
  sourceDetailSchema,
  verifierQualityEnum,
  factualVerifierResponseSchema,
  difficultyAppropriatenessEnum,
  syllabusAlignmentResponseSchema,
  compositeScoreBreakdownSchema,
  topicSeededQuestionSchema,
  topicSeededGenerationResponseSchema,
  topicSeededGenerationInputSchema,
  listVerificationQueueInputSchema,
  reviewQuestionInputSchema,
} from "./question-verification";
export type {
  SourceType,
  AnswerSource,
  VerificationStatus,
  VerificationLayer,
  VerificationResult,
  SourceDetail,
  FactualVerifierResponse,
  SyllabusAlignmentResponse,
  CompositeScoreBreakdown,
  TopicSeededQuestion,
  TopicSeededGenerationResponse,
  TopicSeededGenerationInput,
  ListVerificationQueueInput,
  ReviewQuestionInput,
} from "./question-verification";
