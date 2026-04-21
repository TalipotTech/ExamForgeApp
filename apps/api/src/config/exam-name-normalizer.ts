/**
 * Exam Name Normalizer — Universal Discovery Agent v2
 *
 * Indian exam portals refer to the same exam by different names
 * ("NEET", "NEET UG", "National Eligibility cum Entrance Test", "NEET (UG)" ...).
 * This map canonicalizes raw strings found on portal pages into the names
 * used in our `exams` table, so duplicate-detection and cross-portal matching
 * actually work.
 *
 * Keys MUST be lowercased. `normalizeExamName()` handles the lowering.
 * Values are the canonical names.
 */

export const EXAM_ALIASES: Record<string, string> = {
  // ── Medical ──
  neet: "NEET UG",
  "neet ug": "NEET UG",
  "neet-ug": "NEET UG",
  "neet (ug)": "NEET UG",
  "national eligibility cum entrance test": "NEET UG",
  "national eligibility cum entrance test (ug)": "NEET UG",
  "neet pg": "NEET PG",
  "neet-pg": "NEET PG",
  "neet (pg)": "NEET PG",
  "neet ss": "NEET SS",
  "neet super speciality": "NEET SS",
  fmge: "FMGE",
  "foreign medical graduate examination": "FMGE",
  "screening test for foreign medical graduates": "FMGE",
  dnb: "DNB",
  "diplomate of national board": "DNB",

  // ── Pharmacy ──
  gpat: "GPAT",
  "graduate pharmacy aptitude test": "GPAT",
  niper: "NIPER JEE",
  "niper jee": "NIPER JEE",

  // ── Engineering ──
  "jee main": "JEE Main",
  "jee-main": "JEE Main",
  "joint entrance examination main": "JEE Main",
  "jee advanced": "JEE Advanced",
  gate: "GATE",
  "graduate aptitude test in engineering": "GATE",
  "ies/ese": "IES/ESE",
  ies: "IES/ESE",
  ese: "IES/ESE",
  "engineering services examination": "IES/ESE",

  // ── Civil services (national) ──
  "upsc cse": "UPSC CSE",
  "upsc civil services": "UPSC CSE",
  "civil services examination": "UPSC CSE",
  "civil services exam": "UPSC CSE",
  "ias exam": "UPSC CSE",
  "upsc prelims": "UPSC CSE Prelims",
  "civil services preliminary examination": "UPSC CSE Prelims",
  "upsc mains": "UPSC CSE Mains",
  "civil services main examination": "UPSC CSE Mains",
  ifs: "IFS",
  "indian forest service": "IFS",
  cds: "CDS",
  "combined defence services": "CDS",
  nda: "NDA",
  "national defence academy": "NDA",
  capf: "CAPF",
  "central armed police forces": "CAPF",
  cms: "CMS",
  "combined medical services": "CMS",
  ifos: "IFoS",
  "indian forest service examination": "IFoS",

  // ── UGC / CSIR ──
  "ugc net": "UGC NET",
  "ugc-net": "UGC NET",
  net: "UGC NET",
  "national eligibility test": "UGC NET",
  "csir net": "CSIR NET",
  "csir-ugc net": "CSIR NET",

  // ── CUET ──
  "cuet ug": "CUET UG",
  "cuet-ug": "CUET UG",
  "common university entrance test (ug)": "CUET UG",
  "cuet pg": "CUET PG",
  "common university entrance test (pg)": "CUET PG",

  // ── Management ──
  cmat: "CMAT",
  "common management admission test": "CMAT",
  "nchm jee": "NCHM JEE",

  // ── Kerala PSC ──
  "kerala psc ldc": "Kerala PSC LDC",
  "lower division clerk": "Kerala PSC LDC",
  "kerala psc ld typist": "Kerala PSC LD Typist",
  "ld typist": "Kerala PSC LD Typist",
  "kerala psc assistant professor": "Kerala PSC Assistant Professor",
  "kerala psc asst professor": "Kerala PSC Assistant Professor",
  "asst professor": "Kerala PSC Assistant Professor",
  "assistant professor": "Kerala PSC Assistant Professor",
  "kerala psc assistant professor pharmacy": "Kerala PSC Assistant Professor Pharmacy",
  "assistant professor pharmacy": "Kerala PSC Assistant Professor Pharmacy",
  "kerala psc pharmacist": "Kerala PSC Pharmacist",
  pharmacist: "Kerala PSC Pharmacist",
  "kerala psc secretariat assistant": "Kerala PSC Secretariat Assistant",
  "secretariat assistant": "Kerala PSC Secretariat Assistant",

  // ── TNPSC ──
  "tnpsc group 1": "TNPSC Group 1",
  "tnpsc group i": "TNPSC Group 1",
  "tnpsc group 2": "TNPSC Group 2",
  "tnpsc group ii": "TNPSC Group 2",
  "tnpsc group 4": "TNPSC Group 4",
  "tnpsc group iv": "TNPSC Group 4",
  "tnpsc assistant professor": "TNPSC Assistant Professor",

  // ── APPSC ──
  "appsc group 1": "APPSC Group 1",
  "appsc group i": "APPSC Group 1",
  "appsc group 2": "APPSC Group 2",
  "appsc group ii": "APPSC Group 2",
  "appsc assistant professor": "APPSC Assistant Professor",

  // ── KPSC Karnataka ──
  "kpsc kas": "KPSC KAS",
  kas: "KPSC KAS",
  "kpsc fda": "KPSC FDA",
  fda: "KPSC FDA",
  "kpsc sda": "KPSC SDA",
  sda: "KPSC SDA",

  // ── Medical (additional legacy aliases) ──
  aipmt: "NEET UG",
  "all india pre-medical test": "NEET UG",
  "mci screening": "FMGE",

  // ── Engineering (GATE branches + JEE Advanced) ──
  "iit jee": "JEE Advanced",
  "jee (advanced)": "JEE Advanced",
  "gate cse": "GATE CS",
  "gate cs": "GATE CS",
  "gate ece": "GATE EC",
  "gate ec": "GATE EC",
  "gate ee": "GATE EE",
  "gate me": "GATE ME",
  "gate ce": "GATE CE",

  // ── UPSC (legacy shorthands) ──
  upsc: "UPSC CSE",
  ias: "UPSC CSE",
  "indian engineering services": "IES/ESE",

  // ── State PSCs (additions) ──
  tnpsc: "TNPSC",
  "tamilnadu psc": "TNPSC",
  "tamil nadu psc": "TNPSC",
  appsc: "APPSC",
  "andhra pradesh psc": "APPSC",
  kpsc: "KPSC Karnataka",
  "karnataka psc": "KPSC Karnataka",
  mpsc: "MPSC",
  "maharashtra psc": "MPSC",
  "mpsc state services": "MPSC State Services",
  "mpsc combined": "MPSC Combined",
  uppsc: "UPPSC",
  "up psc": "UPPSC",
  "uttar pradesh psc": "UPPSC",
  "uppsc pcs": "UPPSC PCS",
  "uppsc ro/aro": "UPPSC RO/ARO",

  // ── Banking ──
  "sbi po": "SBI PO",
  "sbi clerk": "SBI Clerk",
  "sbi so": "SBI SO",
  "state bank of india po": "SBI PO",
  "ibps po": "IBPS PO",
  "ibps clerk": "IBPS Clerk",
  "ibps so": "IBPS SO",
  "ibps rrb": "IBPS RRB",
  "rbi grade b": "RBI Grade B",
  "rbi assistant": "RBI Assistant",
  "reserve bank of india grade b": "RBI Grade B",

  // ── SSC ──
  "ssc cgl": "SSC CGL",
  "ssc chsl": "SSC CHSL",
  "ssc mts": "SSC MTS",
  "ssc cpo": "SSC CPO",
  "ssc je": "SSC JE",
  "ssc gd": "SSC GD",
  "staff selection commission": "SSC CGL",
  "combined graduate level": "SSC CGL",
  "combined higher secondary level": "SSC CHSL",

  // ── Teaching (SET / additional) ──
  set: "SET",
  "state eligibility test": "SET",

  // ── Pharmacy (additions) ──
  "drug inspector": "Drug Inspector",
  "kerala drug inspector": "Kerala Drug Inspector",
  "tn drug inspector": "TN Drug Inspector",
  "tamil nadu drug inspector": "TN Drug Inspector",
  "pharmacy officer": "Kerala Pharmacy Officer",
  "kerala pharmacy officer": "Kerala Pharmacy Officer",
};

/**
 * Normalize a raw exam name string to its canonical form.
 *
 * Strips punctuation (except hyphen/parentheses), collapses whitespace,
 * lower-cases, then looks up in EXAM_ALIASES. Falls back to the
 * trimmed original if no alias matches.
 */
export function normalizeExamName(raw: string): string {
  if (!raw) return "";
  const cleaned = raw
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^\w\s\-()/]/g, "");
  return EXAM_ALIASES[cleaned] ?? raw.trim();
}

/**
 * Fuzzy-match a raw exam name against an array of canonical candidate names.
 * Returns the best candidate (or null) based on normalized equality.
 *
 * Useful when the agent knows a portal's `examsConducted` list and wants
 * to pin an extracted item to one of them.
 */
export function matchExamName(raw: string, candidates: string[]): string | null {
  const normalized = normalizeExamName(raw);
  const normalizedLower = normalized.toLowerCase();

  // Exact match on canonical form
  const exact = candidates.find((c) => c.toLowerCase() === normalizedLower);
  if (exact) return exact;

  // Prefix / substring fallback
  const prefix = candidates.find((c) => normalizedLower.startsWith(c.toLowerCase()));
  if (prefix) return prefix;

  const substring = candidates.find(
    (c) => normalizedLower.includes(c.toLowerCase()) || c.toLowerCase().includes(normalizedLower),
  );
  return substring ?? null;
}
