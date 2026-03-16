import { create } from "zustand";

export type PracticeQuestion = {
  id: string;
  question: string;
  options: string[];
  difficulty: string;
  subject: string;
  questionNumber: number;
};

export type ExamStatus = "loading" | "ready" | "running" | "stopped";

type PracticeExamState = {
  examId: number | null;
  examTitle: string;
  questions: PracticeQuestion[];
  currentIndex: number;
  answers: Record<string, number>;
  flagged: Set<string>;
  durationMinutes: number;
  timeRemaining: number;
  startedAt: Date | null;
  isSubmitting: boolean;
  isSubmitted: boolean;
  examStatus: ExamStatus;

  setSession: (data: {
    examId: number;
    examTitle: string;
    questions: PracticeQuestion[];
    durationMinutes: number;
    startedAt: string;
  }) => void;
  startExam: () => void;
  stopExam: () => void;
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

export const usePracticeExamStore = create<PracticeExamState>((set, get) => ({
  examId: null,
  examTitle: "",
  questions: [],
  currentIndex: 0,
  answers: {},
  flagged: new Set<string>(),
  durationMinutes: 0,
  timeRemaining: 0,
  startedAt: null,
  isSubmitting: false,
  isSubmitted: false,
  examStatus: "loading" as ExamStatus,

  setSession: (data) => {
    const totalSeconds = data.durationMinutes * 60;

    set({
      examId: data.examId,
      examTitle: data.examTitle,
      questions: data.questions,
      durationMinutes: data.durationMinutes,
      timeRemaining: totalSeconds,
      startedAt: null,
      currentIndex: 0,
      answers: {},
      flagged: new Set<string>(),
      isSubmitting: false,
      isSubmitted: false,
      examStatus: "ready",
    });
  },

  startExam: () => {
    set({
      startedAt: new Date(),
      examStatus: "running",
    });
  },

  stopExam: () => {
    set({
      examStatus: "stopped",
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
      examId: null,
      examTitle: "",
      questions: [],
      currentIndex: 0,
      answers: {},
      flagged: new Set<string>(),
      durationMinutes: 0,
      timeRemaining: 0,
      startedAt: null,
      isSubmitting: false,
      isSubmitted: false,
      examStatus: "loading",
    }),
}));
