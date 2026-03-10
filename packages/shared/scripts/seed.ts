import { config } from "dotenv";
config({ path: "../../.env.local" });

import bcrypt from "bcryptjs";
import { createDatabase } from "../src/db/index";
import {
  organizations,
  users,
  exams,
  questions,
} from "../src/db/schema/index";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required. Make sure .env.local exists at the monorepo root.");
  process.exit(1);
}

const db = createDatabase(DATABASE_URL);

const ORG_ID = "a0000000-0000-0000-0000-000000000001";
const ADMIN_ID = "b0000000-0000-0000-0000-000000000001";
const EXAM_IDS = {
  bpharm: "c0000000-0000-0000-0000-000000000001",
  gpat: "c0000000-0000-0000-0000-000000000002",
  neet: "c0000000-0000-0000-0000-000000000003",
};

async function seed(): Promise<void> {
  console.log("Seeding database...\n");

  console.log("  Creating organization...");
  await db
    .insert(organizations)
    .values({
      id: ORG_ID,
      name: "ExamForge Dev Org",
      slug: "examforge-dev",
      plan: "enterprise",
      settings: { maxUsers: 100 },
    })
    .onConflictDoNothing();

  console.log("  Creating admin user...");
  const passwordHash = await bcrypt.hash("password123", 10);
  await db
    .insert(users)
    .values({
      id: ADMIN_ID,
      name: "Dev Admin",
      email: "admin@examforge.dev",
      phone: "+919999999999",
      passwordHash,
      role: "superadmin",
      orgId: ORG_ID,
    })
    .onConflictDoNothing();

  console.log("  Creating exams...");
  await db
    .insert(exams)
    .values([
      {
        id: EXAM_IDS.bpharm,
        name: "BPharm Assistant Professor 2025",
        category: "bpharm_asst_prof",
        subjects: ["Pharmaceutics", "Pharmacology", "Pharmaceutical Chemistry", "Pharmacognosy"],
        orgId: ORG_ID,
      },
      {
        id: EXAM_IDS.gpat,
        name: "GPAT 2025",
        category: "gpat",
        subjects: ["Pharmaceutics", "Pharmacology", "Pharmaceutical Analysis"],
        orgId: ORG_ID,
      },
      {
        id: EXAM_IDS.neet,
        name: "NEET 2025",
        category: "neet",
        subjects: ["Physics", "Chemistry", "Biology"],
        orgId: ORG_ID,
      },
    ])
    .onConflictDoNothing();

  console.log("  Creating sample questions...");
  await db
    .insert(questions)
    .values([
      {
        examId: EXAM_IDS.bpharm,
        type: "mcq",
        content: {
          type: "mcq",
          question: "Which of the following is a natural polymer used in sustained release formulations?",
          options: ["Eudragit", "Guar gum", "Polycarbonate", "Nylon"],
          answer: 1,
          explanation: "Guar gum is a natural polysaccharide polymer widely used in sustained release formulations due to its gel-forming properties.",
        },
        subject: "Pharmaceutics",
        topic: "Sustained Release",
        difficulty: "medium",
        source: "PCI Practice Paper 2024",
        orgId: ORG_ID,
      },
      {
        examId: EXAM_IDS.bpharm,
        type: "mcq",
        content: {
          type: "mcq",
          question: "Which enzyme is responsible for the conversion of angiotensin I to angiotensin II?",
          options: ["Renin", "ACE", "Pepsin", "Trypsin"],
          answer: 1,
          explanation: "Angiotensin Converting Enzyme (ACE) converts angiotensin I to angiotensin II, a potent vasoconstrictor.",
        },
        subject: "Pharmacology",
        topic: "Cardiovascular",
        difficulty: "easy",
        source: "PCI Practice Paper 2024",
        orgId: ORG_ID,
      },
      {
        examId: EXAM_IDS.bpharm,
        type: "mcq",
        content: {
          type: "mcq",
          question: "The BCS classification system classifies drugs based on:",
          options: ["Solubility and molecular weight", "Solubility and permeability", "Permeability and stability", "Stability and solubility"],
          answer: 1,
          explanation: "The Biopharmaceutics Classification System (BCS) classifies drugs into four classes based on their aqueous solubility and intestinal permeability.",
        },
        subject: "Pharmaceutics",
        topic: "Biopharmaceutics",
        difficulty: "medium",
        source: "GPAT Previous Year",
        orgId: ORG_ID,
      },
      {
        examId: EXAM_IDS.bpharm,
        type: "mcq",
        content: {
          type: "mcq",
          question: "Which of the following is a prodrug?",
          options: ["Aspirin", "Enalapril", "Ibuprofen", "Paracetamol"],
          answer: 1,
          explanation: "Enalapril is a prodrug that is converted to its active form enalaprilat by esterases in the liver.",
        },
        subject: "Pharmacology",
        topic: "Prodrugs",
        difficulty: "easy",
        source: "GPAT Previous Year",
        orgId: ORG_ID,
      },
      {
        examId: EXAM_IDS.bpharm,
        type: "mcq",
        content: {
          type: "mcq",
          question: "Which alkaloid is obtained from Cinchona bark?",
          options: ["Morphine", "Quinine", "Atropine", "Caffeine"],
          answer: 1,
          explanation: "Quinine is the principal alkaloid obtained from the bark of Cinchona species and is used as an antimalarial agent.",
        },
        subject: "Pharmacognosy",
        topic: "Alkaloids",
        difficulty: "medium",
        source: "BPharm Exam 2023",
        orgId: ORG_ID,
      },
    ])
    .onConflictDoNothing();

  console.log("\nSeed complete!");
  console.log("──────────────────────────────────────");
  console.log("  Login:    admin@examforge.dev");
  console.log("  Password: password123");
  console.log("──────────────────────────────────────");

  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
