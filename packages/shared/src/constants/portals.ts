export type PortalConfig = {
  name: string;
  url: string;
  focusAreas: string[];
  frequency: "daily" | "weekly";
  preferredCrawler: "cheerio" | "playwright";
};

export const EXAM_PORTALS: PortalConfig[] = [
  {
    name: "NTA Official",
    url: "https://nta.ac.in",
    focusAreas: ["NEET", "GPAT", "UGC NET", "GATE"],
    frequency: "daily",
    preferredCrawler: "playwright",
  },
  {
    name: "UPSC",
    url: "https://upsc.gov.in",
    focusAreas: ["UPSC CSE", "CDS", "NDA", "CAPF"],
    frequency: "weekly",
    preferredCrawler: "playwright",
  },
  {
    name: "Kerala PSC",
    url: "https://keralapsc.gov.in",
    focusAreas: ["Pharmacist", "Assistant Professor", "Staff Nurse"],
    frequency: "daily",
    preferredCrawler: "cheerio",
  },
  {
    name: "TNPSC",
    url: "https://tnpsc.gov.in",
    focusAreas: ["Group I", "Group II", "Assistant Professor"],
    frequency: "weekly",
    preferredCrawler: "cheerio",
  },
  {
    name: "PCI (Pharmacy Council of India)",
    url: "https://www.pci.nic.in",
    focusAreas: ["BPharm", "MPharm", "Pharmacy Regulations"],
    frequency: "weekly",
    preferredCrawler: "cheerio",
  },
  {
    name: "NBEMS (National Board of Examinations)",
    url: "https://natboard.edu.in",
    focusAreas: ["NEET PG", "FMGE", "DNB"],
    frequency: "weekly",
    preferredCrawler: "playwright",
  },
];
