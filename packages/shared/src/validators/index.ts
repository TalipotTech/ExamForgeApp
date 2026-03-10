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
