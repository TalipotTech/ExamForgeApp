export interface PortalConfig {
  name: string;
  domain: string;
  searchUrl?: string;
  archiveUrl?: string;
  syllabusUrl?: string;
  quality: "official" | "established" | "community";
}

export const EXAM_PORTAL_MAP: Record<string, PortalConfig[]> = {
  "NEET UG": [
    {
      name: "NTA Official",
      domain: "nta.ac.in",
      archiveUrl: "https://nta.ac.in/Download/QP-NEET",
      quality: "official",
    },
    {
      name: "NTA NEET Portal",
      domain: "neet.nta.nic.in",
      quality: "official",
    },
  ],
  "NEET PG": [
    {
      name: "NBEMS Official",
      domain: "natboard.edu.in",
      quality: "official",
    },
  ],
  GPAT: [
    {
      name: "NTA Official",
      domain: "nta.ac.in",
      archiveUrl: "https://nta.ac.in/Download/QP-GPAT",
      quality: "official",
    },
    {
      name: "GPAT Prep",
      domain: "gpatprep.com",
      archiveUrl: "https://gpatprep.com/previous-papers",
      quality: "established",
    },
  ],
  "UPSC CSE": [
    {
      name: "UPSC Official",
      domain: "upsc.gov.in",
      archiveUrl: "https://upsc.gov.in/examinations/previous-question-papers",
      quality: "official",
    },
  ],
  "Kerala PSC": [
    {
      name: "Kerala PSC Official",
      domain: "keralapsc.gov.in",
      archiveUrl: "https://keralapsc.gov.in/previous-question-papers",
      quality: "official",
    },
  ],
  GATE: [
    {
      name: "GATE Official",
      domain: "gate2026.iitb.ac.in",
      quality: "official",
    },
  ],
  "UGC NET": [
    {
      name: "NTA Official",
      domain: "nta.ac.in",
      archiveUrl: "https://nta.ac.in/Download/QP-UGC-NET",
      quality: "official",
    },
  ],
  FMGE: [
    {
      name: "NBEMS Official",
      domain: "natboard.edu.in",
      quality: "official",
    },
  ],
  "SSC CGL": [
    {
      name: "SSC Official",
      domain: "ssc.nic.in",
      quality: "official",
    },
  ],
  "IBPS PO": [
    {
      name: "IBPS Official",
      domain: "ibps.in",
      quality: "official",
    },
  ],
};

// ─── Portal Ingestion Configs ───
// Pre-configured pages for one-click ingestion from admin UI

export interface PortalIngestionConfig {
  name: string;
  url: string;
  pageType: string;
  description: string;
}

export const PORTAL_INGESTION_CONFIGS: Record<string, PortalIngestionConfig[]> = {
  "Kerala PSC": [
    {
      name: "Examinations",
      url: "https://keralapsc.gov.in/examinations",
      pageType: "examinations",
      description: "Current and upcoming exam notifications",
    },
    {
      name: "Previous Question Papers",
      url: "https://keralapsc.gov.in/previous-question-papers",
      pageType: "previous_questions",
      description: "MCQ question papers for all exams",
    },
    {
      name: "OMR Answer Keys",
      url: "https://keralapsc.gov.in/answerkey_omrexams",
      pageType: "omr_answer_key",
      description: "Official answer keys for OMR-based exams",
    },
    {
      name: "Online Answer Keys",
      url: "https://keralapsc.gov.in/answerkey_onlineexams",
      pageType: "online_answer_key",
      description: "Answer keys for online exams",
    },
    {
      name: "Descriptive Question Papers",
      url: "https://keralapsc.gov.in/question-paper-descriptive-exam",
      pageType: "descriptive_questions",
      description: "Essay and descriptive exam papers",
    },
    {
      name: "Syllabus",
      url: "https://keralapsc.gov.in/syllabus1",
      pageType: "syllabus",
      description: "Post-wise syllabus documents",
    },
  ],
};

export const GENERIC_SOURCES: PortalConfig[] = [
  {
    name: "Testbook",
    domain: "testbook.com",
    quality: "established",
  },
  {
    name: "BYJU's Exam Prep",
    domain: "byjusexamprep.com",
    quality: "established",
  },
  {
    name: "Unacademy",
    domain: "unacademy.com",
    quality: "established",
  },
  {
    name: "Embibe",
    domain: "embibe.com",
    quality: "established",
  },
  {
    name: "PharmQuiz",
    domain: "pharmaquiz.net",
    quality: "community",
  },
];
