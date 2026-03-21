import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  integer,
  real,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { exams } from "./exams";
import { examSessions } from "./exam-sessions";

export type VoiceSessionQuestion = {
  questionId: string;
  question: string;
  options: string[];
  correctAnswer: number;
  userAnswer?: number;
  isCorrect?: boolean;
  answeredAt?: string;
  spokenTranscript?: string;
  responseTimeMs?: number;
  explanation?: string;
  subject?: string;
};

export type VoiceConversationEntry = {
  role: "tutor" | "user";
  text: string;
  timestamp: string;
  questionContext?: string;
};

export const voiceSessions = pgTable(
  "voice_sessions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    examId: uuid("exam_id")
      .notNull()
      .references(() => exams.id),

    mode: varchar("mode", { length: 20 }).notNull(),
    // recap | fresh_exam | teacher
    sourceSessionId: uuid("source_session_id").references(() => examSessions.id),
    sourceUserExamId: varchar("source_user_exam_id", { length: 255 }),

    // Config
    subject: varchar("subject", { length: 255 }),
    topic: varchar("topic", { length: 255 }),
    questionCount: integer("question_count"),
    difficulty: varchar("difficulty", { length: 20 }),

    // Questions (ordered list for this voice session)
    questions: jsonb("questions").$type<VoiceSessionQuestion[]>().notNull().default([]),

    // Results
    totalQuestions: integer("total_questions").default(0),
    answeredCount: integer("answered_count").default(0),
    correctCount: integer("correct_count").default(0),
    skippedCount: integer("skipped_count").default(0),
    scorePercent: real("score_percent"),
    durationSeconds: integer("duration_seconds"),

    // Teacher mode conversation
    conversation: jsonb("conversation").$type<VoiceConversationEntry[]>().default([]),
    aiTokensUsed: integer("ai_tokens_used").default(0),
    aiCostUsd: real("ai_cost_usd").default(0),

    // TTS/STT tracking
    ttsProvider: varchar("tts_provider", { length: 30 }).default("browser"),
    sttProvider: varchar("stt_provider", { length: 30 }).default("browser"),
    ttsCharsUsed: integer("tts_chars_used").default(0),

    status: varchar("status", { length: 20 }).notNull().default("active"),
    // active | paused | completed | abandoned
    startedAt: timestamp("started_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_voice_sessions_user").on(table.userId),
    index("idx_voice_sessions_exam").on(table.examId),
  ],
);
