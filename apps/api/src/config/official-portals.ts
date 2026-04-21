/**
 * Official Portal Registry — Universal Discovery Agent v2
 *
 * Catalog of Indian exam portals monitored by the discovery agent.
 * The agent uses an AI-as-Adapter pattern — one universal prompt parses
 * ANY portal format, so no per-site custom code is needed.
 *
 * Contrast with the legacy `packages/shared/src/constants/portals.ts`,
 * which the v1 discovery agent uses. This file is the authoritative source
 * for v2 onwards.
 */

export type PortalType = "conducting_body" | "exam_specific" | "aggregator";
export type FetchMethod = "firecrawl" | "playwright" | "cheerio";
export type CheckFrequency = "daily" | "weekly" | "monthly";

export interface OfficialPortalPages {
  notifications?: string;
  examCalendar?: string;
  previousPapers?: string;
  answerKeys?: string;
  syllabus?: string;
  results?: string;
  applicationPortal?: string;
}

export interface OfficialPortal {
  id: string;
  name: string;
  domain: string;
  type: PortalType;

  /** Content pages keyed by purpose. Agent uses these to route deep discovery. */
  pages: OfficialPortalPages;

  /** Canonical exam names conducted by this body (for matching). */
  examsConducted: string[];

  /** How to fetch pages. firecrawl is not currently installed — cheerio/playwright are the real options. */
  fetchMethod: FetchMethod;

  /** Min ms between requests to this portal. */
  rateLimit: number;

  /** How often the broad-discovery scheduler should check this portal. */
  checkFrequency: CheckFrequency;

  /** 1 = highest priority, 3 = lowest. Used by the scheduler when budget is limited. */
  priority: number;

  /** Operator notes — known quirks, bilingual warnings, OCR needs, etc. */
  notes?: string;
}

export const OFFICIAL_PORTALS: OfficialPortal[] = [
  // ══════════ NATIONAL — NTA ══════════
  {
    id: "nta",
    name: "National Testing Agency",
    domain: "nta.ac.in",
    type: "conducting_body",
    pages: {
      notifications: "https://nta.ac.in/",
      examCalendar: "https://nta.ac.in/ExamCalendar",
      previousPapers: "https://nta.ac.in/Download",
    },
    examsConducted: [
      "NEET UG",
      "JEE Main",
      "CUET UG",
      "CUET PG",
      "UGC NET",
      "CSIR NET",
      "GPAT",
      "CMAT",
      "NCHM JEE",
    ],
    fetchMethod: "playwright",
    rateLimit: 3000,
    checkFrequency: "daily",
    priority: 1,
  },
  {
    id: "nta-neet",
    name: "NTA NEET Portal",
    domain: "neet.nta.nic.in",
    type: "exam_specific",
    pages: {
      notifications: "https://neet.nta.nic.in/",
      applicationPortal: "https://neet.nta.nic.in/",
    },
    examsConducted: ["NEET UG"],
    fetchMethod: "playwright",
    rateLimit: 3000,
    checkFrequency: "daily",
    priority: 1,
  },
  {
    id: "nta-gpat",
    name: "NTA GPAT Portal",
    domain: "gpat.nta.nic.in",
    type: "exam_specific",
    pages: {
      notifications: "https://gpat.nta.nic.in/",
    },
    examsConducted: ["GPAT"],
    fetchMethod: "playwright",
    rateLimit: 3000,
    checkFrequency: "daily",
    priority: 1,
  },
  {
    id: "nta-ugcnet",
    name: "NTA UGC NET Portal",
    domain: "ugcnet.nta.ac.in",
    type: "exam_specific",
    pages: {
      notifications: "https://ugcnet.nta.ac.in/",
      previousPapers: "https://nta.ac.in/Download/QP-UGC-NET",
    },
    examsConducted: ["UGC NET"],
    fetchMethod: "playwright",
    rateLimit: 3000,
    checkFrequency: "daily",
    priority: 1,
  },
  {
    id: "nta-csirnet",
    name: "NTA CSIR NET Portal",
    domain: "csirnet.nta.ac.in",
    type: "exam_specific",
    pages: {
      notifications: "https://csirnet.nta.ac.in/",
    },
    examsConducted: ["CSIR NET"],
    fetchMethod: "playwright",
    rateLimit: 3000,
    checkFrequency: "weekly",
    priority: 2,
  },
  {
    id: "nta-jeemain",
    name: "NTA JEE Main Portal",
    domain: "jeemain.nta.nic.in",
    type: "exam_specific",
    pages: {
      notifications: "https://jeemain.nta.nic.in/",
      previousPapers: "https://nta.ac.in/Download/QP-JEE-Main",
    },
    examsConducted: ["JEE Main"],
    fetchMethod: "playwright",
    rateLimit: 3000,
    checkFrequency: "daily",
    priority: 2,
  },

  // ══════════ NATIONAL — UPSC ══════════
  {
    id: "upsc",
    name: "Union Public Service Commission",
    domain: "upsc.gov.in",
    type: "conducting_body",
    pages: {
      notifications: "https://upsc.gov.in/examinations/active-examinations",
      examCalendar: "https://upsc.gov.in/examinations/examination-calendar",
      previousPapers: "https://upsc.gov.in/examinations/previous-question-papers",
      results: "https://upsc.gov.in/written-results",
    },
    examsConducted: ["UPSC CSE", "IFS", "CDS", "NDA", "CAPF", "IES/ESE", "CMS", "IFoS"],
    fetchMethod: "playwright",
    rateLimit: 5000,
    checkFrequency: "daily",
    priority: 1,
    notes: "Heavy PDF-only notifications. Needs download + text extraction.",
  },

  // ══════════ NATIONAL — NBEMS ══════════
  {
    id: "nbems",
    name: "National Board of Examinations in Medical Sciences",
    domain: "natboard.edu.in",
    type: "conducting_body",
    pages: {
      notifications: "https://natboard.edu.in/viewnotice",
    },
    examsConducted: ["NEET PG", "NEET SS", "FMGE", "FET", "DNB"],
    fetchMethod: "playwright",
    rateLimit: 3000,
    checkFrequency: "daily",
    priority: 1,
  },

  // ══════════ NATIONAL — PCI ══════════
  {
    id: "pci",
    name: "Pharmacy Council of India",
    domain: "pci.nic.in",
    type: "conducting_body",
    pages: {
      notifications: "https://www.pci.nic.in/",
    },
    examsConducted: ["PCI Registration Exams"],
    fetchMethod: "cheerio",
    rateLimit: 5000,
    checkFrequency: "weekly",
    priority: 2,
    notes: "Basic HTML site. Limited content. Check for regulation updates.",
  },

  // ══════════ NATIONAL — NIPER ══════════
  // NIPER JEE: pharmaceutical masters entrance. Highly relevant
  // seed source for Kerala PSC Asst Prof Pharmacy under the
  // Question Acquisition Strategy cross-exam rule (§5).
  {
    id: "niper",
    name: "National Institute of Pharmaceutical Education & Research",
    domain: "niperhyd.ac.in",
    type: "conducting_body",
    pages: {
      notifications: "https://niperhyd.ac.in/",
      previousPapers: "https://niperhyd.ac.in/jee.html",
    },
    examsConducted: ["NIPER JEE"],
    fetchMethod: "cheerio",
    rateLimit: 4000,
    checkFrequency: "weekly",
    priority: 2,
    notes:
      "Pharmacy M.Pharm entrance. Past papers are strong seeds for BPharm Assistant Professor pattern generation.",
  },

  // ══════════ NATIONAL — GATE ══════════
  {
    id: "gate",
    name: "GATE (IIT organized)",
    domain: "gate2026.iitb.ac.in",
    type: "exam_specific",
    pages: {
      notifications: "https://gate2026.iitb.ac.in/",
      previousPapers: "https://gate2026.iitb.ac.in/previous_qp.php",
      syllabus: "https://gate2026.iitb.ac.in/syllabus.php",
    },
    examsConducted: ["GATE"],
    fetchMethod: "playwright",
    rateLimit: 3000,
    checkFrequency: "weekly",
    priority: 2,
    notes:
      "Domain rotates yearly (gate2026.iitb.ac.in -> gate2027.<iit>.ac.in). Update this entry annually.",
  },

  // ══════════ STATE PSCs ══════════
  {
    id: "keralapsc",
    name: "Kerala Public Service Commission",
    domain: "keralapsc.gov.in",
    type: "conducting_body",
    pages: {
      notifications: "https://keralapsc.gov.in/notifications",
      examCalendar: "https://keralapsc.gov.in/examinations",
      previousPapers: "https://keralapsc.gov.in/previous-question-paper",
      answerKeys: "https://keralapsc.gov.in/omr-answer-key",
      syllabus: "https://keralapsc.gov.in/examinations",
    },
    examsConducted: [
      "Kerala PSC LDC",
      "Kerala PSC LD Typist",
      "Kerala PSC Assistant Professor",
      "Kerala PSC Pharmacist",
      "Kerala PSC Secretariat Assistant",
    ],
    fetchMethod: "playwright",
    rateLimit: 3000,
    checkFrequency: "daily",
    priority: 1,
    notes: "Bilingual (Malayalam + English). Extract English version.",
  },
  {
    id: "tnpsc",
    name: "Tamil Nadu Public Service Commission",
    domain: "tnpsc.gov.in",
    type: "conducting_body",
    pages: {
      notifications: "https://www.tnpsc.gov.in/english/notifications.html",
      previousPapers: "https://www.tnpsc.gov.in/english/previousqp.html",
      results: "https://www.tnpsc.gov.in/english/results.html",
    },
    examsConducted: [
      "TNPSC Group 1",
      "TNPSC Group 2",
      "TNPSC Group 4",
      "TNPSC Assistant Professor",
    ],
    fetchMethod: "cheerio",
    rateLimit: 3000,
    checkFrequency: "weekly",
    priority: 2,
  },
  {
    id: "appsc",
    name: "Andhra Pradesh Public Service Commission",
    domain: "psc.ap.gov.in",
    type: "conducting_body",
    pages: {
      notifications: "https://psc.ap.gov.in/Notifications",
    },
    examsConducted: ["APPSC Group 1", "APPSC Group 2", "APPSC Assistant Professor"],
    fetchMethod: "playwright",
    rateLimit: 5000,
    checkFrequency: "weekly",
    priority: 3,
  },
  {
    id: "kpsc-karnataka",
    name: "Karnataka Public Service Commission",
    domain: "kpsc.kar.nic.in",
    type: "conducting_body",
    pages: {
      notifications: "https://kpsc.kar.nic.in/",
    },
    examsConducted: ["KPSC KAS", "KPSC FDA", "KPSC SDA"],
    fetchMethod: "cheerio",
    rateLimit: 5000,
    checkFrequency: "weekly",
    priority: 3,
  },
  {
    id: "mpsc",
    name: "Maharashtra Public Service Commission",
    domain: "mpsc.gov.in",
    type: "conducting_body",
    pages: {
      notifications: "https://mpsc.gov.in/",
    },
    examsConducted: ["MPSC State Services", "MPSC Combined", "MPSC Assistant Professor"],
    fetchMethod: "cheerio",
    rateLimit: 5000,
    checkFrequency: "weekly",
    priority: 3,
  },
  {
    id: "uppsc",
    name: "Uttar Pradesh Public Service Commission",
    domain: "uppsc.up.nic.in",
    type: "conducting_body",
    pages: {
      notifications: "http://uppsc.up.nic.in/Notifications.aspx",
    },
    examsConducted: ["UPPSC PCS", "UPPSC RO/ARO", "UPPSC Assistant Professor"],
    fetchMethod: "cheerio",
    rateLimit: 5000,
    checkFrequency: "weekly",
    priority: 3,
  },

  // ══════════ BANKING ══════════
  {
    id: "ibps",
    name: "Institute of Banking Personnel Selection",
    domain: "ibps.in",
    type: "conducting_body",
    pages: {
      notifications: "https://www.ibps.in/",
    },
    examsConducted: ["IBPS PO", "IBPS Clerk", "IBPS SO", "IBPS RRB"],
    fetchMethod: "playwright",
    rateLimit: 5000,
    checkFrequency: "weekly",
    priority: 2,
  },
  {
    id: "sbi",
    name: "State Bank of India — Careers",
    domain: "sbi.co.in",
    type: "conducting_body",
    pages: {
      notifications: "https://bank.sbi/web/careers",
    },
    examsConducted: ["SBI PO", "SBI Clerk", "SBI SO"],
    fetchMethod: "playwright",
    rateLimit: 5000,
    checkFrequency: "weekly",
    priority: 2,
  },
  {
    id: "rbi",
    name: "Reserve Bank of India — Careers",
    domain: "rbi.org.in",
    type: "conducting_body",
    pages: {
      notifications: "https://opportunities.rbi.org.in/",
    },
    examsConducted: ["RBI Grade B", "RBI Assistant"],
    fetchMethod: "playwright",
    rateLimit: 5000,
    checkFrequency: "weekly",
    priority: 3,
  },

  // ══════════ SSC ══════════
  {
    id: "ssc",
    name: "Staff Selection Commission",
    domain: "ssc.gov.in",
    type: "conducting_body",
    pages: {
      notifications: "https://ssc.gov.in/whats-new",
      previousPapers: "https://ssc.gov.in/question-paper-download",
    },
    examsConducted: ["SSC CGL", "SSC CHSL", "SSC MTS", "SSC CPO", "SSC JE", "SSC GD"],
    fetchMethod: "playwright",
    rateLimit: 5000,
    checkFrequency: "weekly",
    priority: 2,
    notes: "Domain recently moved from ssc.nic.in to ssc.gov.in — keep both aliases handy.",
  },

  // ══════════ PHARMA-SPECIFIC STATE CADRES ══════════
  // Kerala Drugs Control Department: conducts Drug Inspector
  // recruitment via Kerala PSC. The notifications reveal the
  // exam pattern for Drug Inspector + Pharmacy Officer — which
  // heavily overlaps with BPharm Assistant Professor syllabus.
  {
    id: "kerala-dcd",
    name: "Kerala Drugs Control Department",
    domain: "drugscontrol.kerala.gov.in",
    type: "conducting_body",
    pages: {
      notifications: "https://drugscontrol.kerala.gov.in/index.php/notifications",
    },
    examsConducted: ["Kerala Drug Inspector", "Kerala Pharmacy Officer"],
    fetchMethod: "cheerio",
    rateLimit: 4000,
    checkFrequency: "weekly",
    priority: 2,
    notes:
      "Conducted by Kerala PSC — notification first appears on Drugs Control dept site. Use as early-warning signal.",
  },
  {
    id: "tn-dcd",
    name: "Tamil Nadu Drugs Control Department",
    domain: "tndrugscontrol.tn.gov.in",
    type: "conducting_body",
    pages: {
      notifications: "https://tndrugscontrol.tn.gov.in/",
    },
    examsConducted: ["TN Drug Inspector"],
    fetchMethod: "cheerio",
    rateLimit: 4000,
    checkFrequency: "monthly",
    priority: 3,
    notes: "Conducted by TNPSC. Low-frequency — annual-ish notifications.",
  },

  // ══════════ COMMUNITY AGGREGATORS ══════════
  {
    id: "keralapscgk",
    name: "Kerala PSC GK (Community)",
    domain: "keralapscgk.com",
    type: "aggregator",
    pages: {
      previousPapers: "https://www.keralapscgk.com/p/kerala-psc-previous-question-papers.html",
      answerKeys: "https://www.keralapscgk.com/p/previous-question-papers.html",
    },
    examsConducted: ["Kerala PSC *"],
    fetchMethod: "cheerio",
    rateLimit: 2000,
    checkFrequency: "weekly",
    priority: 2,
    notes: "Strong archive (2001–2024). HTML pages with embedded Q&A + PDF links.",
  },
  {
    id: "pscpdfbanks",
    name: "PSC PDF Banks (Community)",
    domain: "pscpdfbanks.in",
    type: "aggregator",
    pages: {
      previousPapers: "https://www.pscpdfbanks.in/p/previous-question-papers.html",
    },
    examsConducted: ["Kerala PSC *"],
    fetchMethod: "cheerio",
    rateLimit: 2000,
    checkFrequency: "weekly",
    priority: 2,
    notes: "Large PDF collection organized by year. Answer keys included.",
  },

  // ══════════ MULTI-EXAM COMMUNITY AGGREGATORS ══════════
  // Low priority — use for discovery, not primary source.
  {
    id: "testbook",
    name: "Testbook (Previous Papers)",
    domain: "testbook.com",
    type: "aggregator",
    pages: {
      previousPapers: "https://testbook.com/previous-year-papers",
    },
    examsConducted: ["*"],
    fetchMethod: "playwright",
    rateLimit: 5000,
    checkFrequency: "weekly",
    priority: 3,
    notes: "Large aggregator across most Indian exams. Use for discovery, not primary source.",
  },
  {
    id: "embibe",
    name: "Embibe (Previous Papers)",
    domain: "embibe.com",
    type: "aggregator",
    pages: {},
    examsConducted: ["NEET UG", "JEE Main", "JEE Advanced"],
    fetchMethod: "playwright",
    rateLimit: 5000,
    checkFrequency: "weekly",
    priority: 3,
  },
];

/** Map of portal id -> portal, for O(1) lookup. */
export const PORTAL_BY_ID: Record<string, OfficialPortal> = Object.fromEntries(
  OFFICIAL_PORTALS.map((p) => [p.id, p]),
);

/** Find all portals that conduct (or aggregate) a given canonical exam name. */
export function getPortalsForExam(examName: string): OfficialPortal[] {
  return OFFICIAL_PORTALS.filter((p) =>
    p.examsConducted.some((e) => {
      // Universal wildcard — aggregator covers every exam.
      if (e === "*") return true;
      // Prefix wildcard (e.g. "Kerala PSC *" matches "Kerala PSC LDC").
      if (e.endsWith(" *")) {
        const prefix = e.slice(0, -2).toLowerCase();
        return examName.toLowerCase().startsWith(prefix);
      }
      return e.toLowerCase() === examName.toLowerCase();
    }),
  );
}

/** Portals due for a broad-discovery check on the given frequency tier. */
export function getPortalsForFrequency(frequency: CheckFrequency): OfficialPortal[] {
  return OFFICIAL_PORTALS.filter((p) => p.checkFrequency === frequency);
}
