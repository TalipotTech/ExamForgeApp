/**
 * Per-category verification references.
 *
 * The Layer-2 factual verifier (apps/api/src/ai/prompts/question-verifier.ts)
 * is a subject-matter expert role — it needs to know WHICH textbooks to
 * cite for a given exam category. This map provides that per-category
 * context so the same prompt can verify pharmacy, medical, engineering,
 * civil services, and banking/SSC questions without blurring domains.
 *
 * Each category provides:
 *  - primaryTexts: the canonical textbook list the verifier cites
 *  - factCheckPromptAddition: category-specific instructions injected
 *    into the system prompt (e.g. "For NEET UG, NCERT is authoritative")
 *  - commonErrors: patterns the verifier should actively look for
 *  - branchReferences (engineering only): per-branch textbook lists
 *
 * Source of truth: docs/features/CLAUDE_CODE_UNIVERSAL_STRATEGY_PROMPT.md §3.
 */

export type VerificationCategory =
  | "pharmacy"
  | "medical_ug"
  | "engineering"
  | "civil_services"
  | "banking_ssc";

export interface VerificationReference {
  primaryTexts: string[];
  factCheckPromptAddition: string;
  commonErrors: string[];
  /** Engineering only — per-branch textbook override. */
  branchReferences?: Record<string, string[]>;
}

export const VERIFICATION_REFERENCES: Record<VerificationCategory, VerificationReference> = {
  // ── Pharmacy (launch category — matches existing DEFAULT_PHARMACY_TEXTBOOKS) ──
  pharmacy: {
    primaryTexts: [
      "KD Tripathi — Essentials of Medical Pharmacology",
      "Rang & Dale — Pharmacology",
      "Remington — The Science and Practice of Pharmacy",
      "Lachman — Theory and Practice of Industrial Pharmacy",
      "Indian Pharmacopoeia (current edition)",
      "Goodman & Gilman — Pharmacological Basis of Therapeutics",
    ],
    factCheckPromptAddition: `
      For pharmacy questions: verify drug mechanisms against KD Tripathi first,
      then Rang & Dale. Verify dosage forms against Lachman/Remington.
      Verify pharmacopoeial monographs against the Indian Pharmacopoeia
      (current edition) — USP/BP values may differ.
      For pharmacology at Assistant Professor level: trace the mechanism,
      don't rely on trade-name recognition.
    `.trim(),
    commonErrors: [
      "Dose values copied from a different edition of the pharmacopoeia",
      "Receptor-mechanism questions where two answers are partially correct",
      "Dosage-form manufacturing questions with dated/obsolete process steps",
      "Drug-interaction questions that ignore the latest FDA/CDSCO advisory",
    ],
  },

  // ── Medical UG (NEET UG) — NCERT is the single source of truth ──
  medical_ug: {
    primaryTexts: [
      "NCERT Biology Class 11 & 12 (PRIMARY — ~95% of NEET questions)",
      "NCERT Physics Class 11 & 12",
      "NCERT Chemistry Class 11 & 12",
      "Trueman Biology Vol 1 & 2",
      "HC Verma — Concepts of Physics",
      "Morrison & Boyd — Organic Chemistry",
      "Guyton — Textbook of Medical Physiology",
      "Robbins — Pathologic Basis of Disease",
    ],
    factCheckPromptAddition: `
      CRITICAL: For NEET UG, ~95% of questions are from NCERT.
      Verify ALL biology facts against NCERT first.
      If NCERT and a higher textbook disagree, NCERT is authoritative for THIS exam.
      Verify physics formulas and numerical constants.
      Verify organic chemistry reactions and stereochemistry carefully.
      For anatomy: use standard Gray's Anatomy terminology.
    `.trim(),
    commonErrors: [
      "Facts that contradict NCERT (even if technically correct at higher level)",
      "Numerical values that differ between textbook editions",
      "Organic chemistry stereochemistry mistakes",
      "Confusing homologous vs analogous structures",
      "Physics unit conversion errors",
    ],
  },

  // ── Engineering (GATE, ESE) — branch-specific references ──
  engineering: {
    primaryTexts: ["Reference depends on branch — set dynamically per GATE paper."],
    branchReferences: {
      CS: [
        "Cormen — Introduction to Algorithms",
        "Galvin — Operating System Concepts",
        "Tanenbaum — Computer Networks",
        "Navathe — Fundamentals of Database Systems",
        "Mano — Digital Logic and Computer Design",
      ],
      EC: [
        "Haykin — Communication Systems",
        "Sedra & Smith — Microelectronic Circuits",
        "Oppenheim — Signals & Systems",
      ],
      ME: [
        "Shigley — Mechanical Engineering Design",
        "Incropera — Fundamentals of Heat and Mass Transfer",
        "Cengel — Thermodynamics: An Engineering Approach",
      ],
      EE: [
        "Nagrath & Gopal — Control Systems Engineering",
        "Hayt — Engineering Electromagnetics",
        "Stevenson — Power System Analysis",
      ],
      CE: [
        "Pillai & Menon — Reinforced Concrete Design",
        "Arora — Soil Mechanics and Foundation Engineering",
        "Subramanya — Open Channel Hydraulics / Fluid Mechanics",
      ],
    },
    factCheckPromptAddition: `
      For engineering questions: verify formulas, units, and dimensional analysis.
      Check numerical constants against the branch-specific references.
      For CS: verify algorithm time complexities against Cormen.
      For circuit analysis: verify using standard methods (KVL, KCL, Thevenin, Norton).
      GATE questions often test edge cases — explicitly verify boundary conditions
      and sign conventions.
    `.trim(),
    commonErrors: [
      "Wrong units or dimensional analysis",
      "Formulas from conflicting conventions (SI vs CGS)",
      "Off-by-one errors in algorithm complexity",
      "Rounded values that differ between textbook editions",
      "Sign convention errors in physics/electronics",
    ],
  },

  // ── Civil Services (UPSC CSE, state PSCs) — latest edition matters ──
  civil_services: {
    primaryTexts: [
      "Laxmikanth — Indian Polity (latest edition)",
      "Spectrum — A Brief History of Modern India",
      "Bipan Chandra — India After Independence",
      "Ramesh Singh — Indian Economy (latest edition)",
      "Shankar IAS — Environment",
      "Goh Cheng Leong — Certificate Physical Geography",
      "NCERT History, Geography, Economics (Class 6-12)",
      "India Year Book (latest)",
    ],
    factCheckPromptAddition: `
      For UPSC/state PSCs: verify facts against the LATEST edition of reference books.
      Constitutional amendments: verify the amendment NUMBER and the YEAR enacted.
      Economic data: always note the year of data — GDP, population, CPI figures change.
      Current affairs: flag if the fact may have changed since the reference book.
      Geography: verify map-based facts (rivers, mountains, boundaries).
      History dates: cross-check with NCERT for commonly tested dates.
      CRITICAL: UPSC loves "All EXCEPT" and "which is NOT correct" — verify
      EVERY option individually, not just the marked one.
    `.trim(),
    commonErrors: [
      "Constitutional amendment numbers wrong",
      "Outdated economic data presented as current",
      "State-reorganization details incorrect",
      "International organization HQ / founding years wrong",
      "Mixing up similar historical events or figures",
    ],
  },

  // ── Banking + SSC (quant + reasoning + GA) ──
  banking_ssc: {
    primaryTexts: [
      "RS Aggarwal — Quantitative Aptitude",
      "Arun Sharma — Quantitative Aptitude for CAT / Banking",
      "SP Bakshi — Objective General English",
      "Lucent — General Knowledge",
      "Arihant — Logical Reasoning & Analytical Ability",
      "MK Pandey — Analytical Reasoning",
    ],
    factCheckPromptAddition: `
      For quantitative aptitude: verify the solution step-by-step — both the
      long method and any published shortcut. Flag if they disagree.
      For GK: verify that facts are CURRENT (country capitals rarely change
      but CMs, Governors, bank chiefs rotate — flag any time-sensitive fact).
      For English: verify grammar rules against standard references.
      Flag any question where the rule is debatable.
      For reasoning: verify the logical pattern is UNAMBIGUOUS — if a second
      valid interpretation exists, the question is flawed.
      For DI: verify calculations with exact numbers, not rounded ones.
    `.trim(),
    commonErrors: [
      "Quant questions where shortcut gives a different answer than long method",
      "GK facts that have since changed (political positions, rates)",
      "English grammar questions with debatable prescriptive rules",
      "Reasoning questions admitting multiple valid patterns",
      "Data interpretation rounding errors",
    ],
  },
};

// ─── Category inference ─────────────────────────────────

const PHARMACY_KEYWORDS = ["pharm", "drug inspector", "gpat", "niper"];
const MEDICAL_KEYWORDS = ["neet", "fmge", "aipmt", "medical"];
const ENGINEERING_KEYWORDS = ["gate", "jee ", "iit ", "ies", "ese", "engineering services"];
const CIVIL_SERVICES_KEYWORDS = [
  "upsc",
  "civil services",
  "ias",
  "ifs",
  "cds",
  "nda",
  "capf",
  "psc",
  "kas",
  "pcs",
  "tnpsc",
  "appsc",
  "kpsc",
  "mpsc",
  "uppsc",
  "assistant professor",
];
const BANKING_SSC_KEYWORDS = ["ibps", "sbi", "rbi", "bank", "ssc", "cgl", "chsl", "mts", "cpo"];

/**
 * Map an exam name (and optionally a subject) to the most appropriate
 * verification category. Used by the worker to pick the right textbook
 * list per question.
 *
 * Order of checks: pharmacy → medical → engineering → civil services →
 * banking/SSC. Falls back to "pharmacy" because that's the launch
 * category and the safest default for our current question mix.
 */
export function inferVerificationCategory(
  examName: string,
  subject?: string | null,
): VerificationCategory {
  const haystack = `${examName} ${subject ?? ""}`.toLowerCase();
  if (PHARMACY_KEYWORDS.some((k) => haystack.includes(k))) return "pharmacy";
  if (MEDICAL_KEYWORDS.some((k) => haystack.includes(k))) return "medical_ug";
  if (ENGINEERING_KEYWORDS.some((k) => haystack.includes(k))) return "engineering";
  if (CIVIL_SERVICES_KEYWORDS.some((k) => haystack.includes(k))) return "civil_services";
  if (BANKING_SSC_KEYWORDS.some((k) => haystack.includes(k))) return "banking_ssc";
  return "pharmacy";
}

/**
 * Resolve the textbook list for a category. For `engineering`, picks
 * a branch-specific list if the branch hint matches a known key
 * (CS / EC / ME / EE / CE), otherwise falls back to all branches combined.
 */
export function getReferencesForCategory(
  category: VerificationCategory,
  branchHint?: string | null,
): string[] {
  const ref = VERIFICATION_REFERENCES[category];
  if (category === "engineering" && ref.branchReferences && branchHint) {
    const key = branchHint.toUpperCase().trim();
    const branch = ref.branchReferences[key];
    if (branch && branch.length > 0) return branch;
  }
  // Engineering fallback: combine all branches.
  if (category === "engineering" && ref.branchReferences) {
    return Object.values(ref.branchReferences).flat();
  }
  return ref.primaryTexts;
}
