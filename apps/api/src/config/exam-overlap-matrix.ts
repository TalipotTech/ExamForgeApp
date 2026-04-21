/**
 * Exam Overlap Matrix
 *
 * Defines syllabus overlap percentages between exams so that questions
 * from a related exam (e.g. GPAT) can be used to prep for a different
 * exam (e.g. Kerala PSC Assistant Professor Pharmacy) with a
 * relevance-weighted trust score.
 *
 * These values are estimates based on syllabus comparison. They are
 * consumed by:
 *  - Verification pipeline — sets `questions.relevanceToTarget` when
 *    `originalExam` differs from the target exam.
 *  - Content Finder — ranks cross-exam questions lower than exam-native.
 *  - Pattern analysis — weights cross-exam pattern evidence.
 *
 * Source: docs/features/CLAUDE_CODE_UNIVERSAL_STRATEGY_PROMPT.md §4
 * plus the cross-exam table in QUESTION_ACQUISITION_STRATEGY.md §5.
 */

export interface ExamOverlap {
  /** Exam the question comes from. */
  sourceExam: string;
  /** Exam the student is preparing for. */
  targetExam: string;
  /** 0-100 — proportion of the source exam's syllabus relevant to target. */
  overlapPercent: number;
  /** Subject strands that actually overlap. */
  relevantSubjects: string[];
  notes?: string;
}

export const EXAM_OVERLAP_MATRIX: ExamOverlap[] = [
  // ─── Pharmacy Cluster ───
  {
    sourceExam: "GPAT",
    targetExam: "Kerala PSC Assistant Professor Pharmacy",
    overlapPercent: 75,
    relevantSubjects: [
      "Pharmacology",
      "Pharmaceutics",
      "Pharmaceutical Chemistry",
      "Pharmacognosy",
      "Biopharmaceutics",
    ],
  },
  {
    sourceExam: "UGC NET",
    targetExam: "Kerala PSC Assistant Professor Pharmacy",
    overlapPercent: 65,
    relevantSubjects: [
      "Pharmacology",
      "Pharmaceutics",
      "Pharmaceutical Chemistry",
      "Research Methodology",
    ],
    notes: "UGC NET Pharmaceutical Sciences paper.",
  },
  {
    sourceExam: "Drug Inspector",
    targetExam: "Kerala PSC Assistant Professor Pharmacy",
    overlapPercent: 60,
    relevantSubjects: ["Pharmacology", "Pharmaceutical Chemistry", "Drug Laws"],
  },
  {
    sourceExam: "Kerala Drug Inspector",
    targetExam: "Kerala PSC Assistant Professor Pharmacy",
    overlapPercent: 62,
    relevantSubjects: ["Pharmacology", "Pharmaceutical Chemistry", "Drug Laws"],
  },
  {
    sourceExam: "NIPER JEE",
    targetExam: "Kerala PSC Assistant Professor Pharmacy",
    overlapPercent: 55,
    relevantSubjects: ["Pharmacology", "Pharmaceutics", "Pharmaceutical Chemistry"],
  },
  {
    sourceExam: "GPAT",
    targetExam: "Drug Inspector",
    overlapPercent: 70,
    relevantSubjects: ["Pharmacology", "Pharmaceutical Chemistry", "Pharmaceutics"],
  },
  {
    sourceExam: "Kerala PSC Pharmacist",
    targetExam: "Kerala PSC Assistant Professor Pharmacy",
    overlapPercent: 50,
    relevantSubjects: ["Pharmacology", "Pharmaceutics"],
    notes: "Pharmacist is undergraduate level — use as foundation practice.",
  },

  // ─── Medical Cluster ───
  {
    sourceExam: "NEET UG",
    targetExam: "AIIMS (Old)",
    overlapPercent: 80,
    relevantSubjects: ["Physics", "Chemistry", "Biology"],
  },
  {
    sourceExam: "NEET UG",
    targetExam: "JIPMER (Old)",
    overlapPercent: 75,
    relevantSubjects: ["Physics", "Chemistry", "Biology"],
  },
  {
    sourceExam: "NEET PG",
    targetExam: "FMGE",
    overlapPercent: 70,
    relevantSubjects: ["Medicine", "Surgery", "Pharmacology", "Pathology", "Physiology"],
  },

  // ─── Engineering Cluster ───
  {
    sourceExam: "JEE Main",
    targetExam: "JEE Advanced",
    overlapPercent: 40,
    relevantSubjects: ["Physics", "Chemistry", "Mathematics"],
    notes: "JEE Main is the easier subset — foundation, not advanced prep.",
  },
  {
    sourceExam: "GATE CS",
    targetExam: "IES/ESE",
    overlapPercent: 45,
    relevantSubjects: ["Engineering Aptitude", "Technical Core"],
  },

  // ─── Civil Services Cluster ───
  {
    sourceExam: "UPSC CSE",
    targetExam: "KPSC KAS",
    overlapPercent: 55,
    relevantSubjects: [
      "Indian Polity",
      "Indian History",
      "Geography",
      "Economics",
      "Current Affairs",
    ],
    notes: "KAS adds Karnataka-specific content.",
  },
  {
    sourceExam: "UPSC CSE",
    targetExam: "TNPSC Group 1",
    overlapPercent: 50,
    relevantSubjects: ["Indian Polity", "Indian History", "Geography", "Economics"],
  },
  {
    sourceExam: "UPSC CSE",
    targetExam: "UPPSC PCS",
    overlapPercent: 55,
    relevantSubjects: ["Indian Polity", "Indian History", "Geography", "Economics"],
  },
  {
    sourceExam: "UPSC CSE",
    targetExam: "MPSC State Services",
    overlapPercent: 55,
    relevantSubjects: ["Indian Polity", "Indian History", "Geography", "Economics"],
  },
  {
    sourceExam: "Kerala PSC LDC",
    targetExam: "Kerala PSC Secretariat Assistant",
    overlapPercent: 65,
    relevantSubjects: ["GK", "Current Affairs", "English", "Mathematics"],
  },

  // ─── Banking / SSC Cluster ───
  {
    sourceExam: "SBI PO",
    targetExam: "IBPS PO",
    overlapPercent: 80,
    relevantSubjects: ["Quantitative Aptitude", "Reasoning", "English", "General Awareness"],
  },
  {
    sourceExam: "IBPS PO",
    targetExam: "IBPS Clerk",
    overlapPercent: 75,
    relevantSubjects: ["Quantitative Aptitude", "Reasoning", "English"],
    notes: "Clerk is easier — use PO questions as advanced practice.",
  },
  {
    sourceExam: "SSC CGL",
    targetExam: "SSC CHSL",
    overlapPercent: 70,
    relevantSubjects: ["Quantitative Aptitude", "Reasoning", "English", "GK"],
  },
  {
    sourceExam: "SBI PO",
    targetExam: "SSC CGL",
    overlapPercent: 55,
    relevantSubjects: ["Quantitative Aptitude", "Reasoning"],
  },
];

/**
 * Overlap score between two exams as a 0-1 fraction.
 *
 * Returns 1.0 if the same exam. Returns 0 if no overlap defined
 * (safest default — assume unrelated). Treats the matrix as
 * symmetric: (A→B) == (B→A).
 */
export function getOverlapScore(sourceExam: string, targetExam: string): number {
  if (!sourceExam || !targetExam) return 0;
  if (sourceExam === targetExam) return 1.0;

  const sourceLower = sourceExam.toLowerCase();
  const targetLower = targetExam.toLowerCase();

  const overlap =
    EXAM_OVERLAP_MATRIX.find(
      (o) =>
        o.sourceExam.toLowerCase() === sourceLower && o.targetExam.toLowerCase() === targetLower,
    ) ??
    EXAM_OVERLAP_MATRIX.find(
      (o) =>
        o.sourceExam.toLowerCase() === targetLower && o.targetExam.toLowerCase() === sourceLower,
    );

  return overlap ? overlap.overlapPercent / 100 : 0;
}

/**
 * All exams related to a target exam, sorted by relevance (highest first).
 * Each result's `sourceExam` is the related exam; `targetExam` is
 * normalised to the query.
 */
export function getRelatedExams(targetExam: string): ExamOverlap[] {
  const targetLower = targetExam.toLowerCase();
  return EXAM_OVERLAP_MATRIX.filter(
    (o) => o.targetExam.toLowerCase() === targetLower || o.sourceExam.toLowerCase() === targetLower,
  )
    .map((o) =>
      o.targetExam.toLowerCase() === targetLower
        ? o
        : { ...o, sourceExam: o.targetExam, targetExam },
    )
    .sort((a, b) => b.overlapPercent - a.overlapPercent);
}
