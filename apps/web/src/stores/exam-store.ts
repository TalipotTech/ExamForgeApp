import { create } from "zustand";

export type ExamQuestion = {
  id: string;
  type: string;
  content: Record<string, unknown>;
  subject: string;
  topic: string | null;
  // Trust/source metadata (Question Acquisition Strategy §1.2)
  // Optional — older sessions won't have these populated.
  sourceType?: string | null;
  sourceDetail?: Record<string, unknown> | null;
  answerSource?: string | null;
  verificationStatus?: string | null;
  paperYear?: number | null;
  originalExam?: string | null;
  source?: string | null;
};

export type SessionData = {
  sessionId: string;
  examName: string;
  questions: ExamQuestion[];
  answers: Record<string, number>;
  durationMinutes: number;
  startedAt: string;
};

type ExamState = {
  sessionId: string | null;
  examName: string;
  questions: ExamQuestion[];
  currentIndex: number;
  answers: Record<string, number>;
  flagged: Set<string>;
  durationMinutes: number;
  timeRemaining: number;
  startedAt: Date | null;
  isSubmitting: boolean;
  isSubmitted: boolean;

  setSession: (data: SessionData) => void;
  selectAnswer: (questionId: string, optionIndex: number) => void;
  clearAnswer: (questionId: string) => void;
  toggleFlag: (questionId: string) => void;
  goToQuestion: (index: number) => void;
  goNext: () => void;
  goPrev: () => void;
  tick: () => void;
  setSubmitting: (v: boolean) => void;
  setSubmitted: () => void;
  reset: () => void;
};

export const useExamStore = create<ExamState>((set, get) => ({
  sessionId: null,
  examName: "",
  questions: [],
  currentIndex: 0,
  answers: {},
  flagged: new Set<string>(),
  durationMinutes: 0,
  timeRemaining: 0,
  startedAt: null,
  isSubmitting: false,
  isSubmitted: false,

  setSession: (data) => {
    const elapsed = Math.floor((Date.now() - new Date(data.startedAt).getTime()) / 1000);
    const totalSeconds = data.durationMinutes * 60;
    const remaining = Math.max(0, totalSeconds - elapsed);

    set({
      sessionId: data.sessionId,
      examName: data.examName,
      questions: data.questions,
      answers: data.answers,
      durationMinutes: data.durationMinutes,
      timeRemaining: remaining,
      startedAt: new Date(data.startedAt),
      currentIndex: 0,
      flagged: new Set<string>(),
      isSubmitting: false,
      isSubmitted: false,
    });
  },

  selectAnswer: (questionId, optionIndex) => {
    set((state) => ({
      answers: { ...state.answers, [questionId]: optionIndex },
    }));
  },

  clearAnswer: (questionId) => {
    set((state) => {
      const newAnswers = { ...state.answers };
      delete newAnswers[questionId];
      return { answers: newAnswers };
    });
  },

  toggleFlag: (questionId) => {
    set((state) => {
      const next = new Set(state.flagged);
      if (next.has(questionId)) {
        next.delete(questionId);
      } else {
        next.add(questionId);
      }
      return { flagged: next };
    });
  },

  goToQuestion: (index) => {
    const { questions } = get();
    if (index >= 0 && index < questions.length) {
      set({ currentIndex: index });
    }
  },

  goNext: () => {
    const { currentIndex, questions } = get();
    if (currentIndex < questions.length - 1) {
      set({ currentIndex: currentIndex + 1 });
    }
  },

  goPrev: () => {
    const { currentIndex } = get();
    if (currentIndex > 0) {
      set({ currentIndex: currentIndex - 1 });
    }
  },

  tick: () => {
    set((state) => ({
      timeRemaining: Math.max(0, state.timeRemaining - 1),
    }));
  },

  setSubmitting: (v) => set({ isSubmitting: v }),

  setSubmitted: () => set({ isSubmitted: true }),

  reset: () =>
    set({
      sessionId: null,
      examName: "",
      questions: [],
      currentIndex: 0,
      answers: {},
      flagged: new Set<string>(),
      durationMinutes: 0,
      timeRemaining: 0,
      startedAt: null,
      isSubmitting: false,
      isSubmitted: false,
    }),
}));
