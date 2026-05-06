import { config } from "dotenv";
config({ path: "../../.env.local" });

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { createDatabase } from "../src/db/index";
import {
  organizations,
  users,
  exams,
  questions,
  scrapeSources,
  examNotifications,
  subscriptionPlans,
  userSubscriptions,
  userCredits,
  adminFeatureFlags,
  creatorProfiles,
} from "../src/db/schema/index";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is required. Make sure .env.local exists at the monorepo root.");
  process.exit(1);
}

const db = createDatabase(DATABASE_URL);

const ORG_ID = "a0000000-0000-0000-0000-000000000001";
const ADMIN_ID = "b0000000-0000-0000-0000-000000000001";
const STUDENT_ID = "b0000000-0000-0000-0000-000000000002";
const CREATOR_ID = "b0000000-0000-0000-0000-000000000003";
const CREATOR_PROFILE_ID = "f0000000-0000-0000-0000-000000000001";
const PLAN_IDS = {
  free: "e0000000-0000-0000-0000-000000000001",
  pro: "e0000000-0000-0000-0000-000000000002",
  premium: "e0000000-0000-0000-0000-000000000003",
};
const EXAM_IDS = {
  bpharm: "c0000000-0000-0000-0000-000000000001",
  gpat: "c0000000-0000-0000-0000-000000000002",
  neet: "c0000000-0000-0000-0000-000000000003",
  upsc: "c0000000-0000-0000-0000-000000000004",
  keralaPsc: "c0000000-0000-0000-0000-000000000005",
  tnpsc: "c0000000-0000-0000-0000-000000000006",
  neetPg: "c0000000-0000-0000-0000-000000000007",
  fmge: "c0000000-0000-0000-0000-000000000008",
  gate: "c0000000-0000-0000-0000-000000000009",
  ugcNet: "c0000000-0000-0000-0000-000000000010",
};

const SOURCE_IDS = {
  pharmQuiz: "d0000000-0000-0000-0000-000000000001",
  gpatPrep: "d0000000-0000-0000-0000-000000000002",
  keralaPscArchives: "d0000000-0000-0000-0000-000000000003",
  keralaPscGk: "d0000000-0000-0000-0000-000000000004",
  pscPdfBanks: "d0000000-0000-0000-0000-000000000005",
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

  console.log("  Creating subscription plans...");
  await db
    .insert(subscriptionPlans)
    .values([
      {
        id: PLAN_IDS.free,
        name: "free",
        displayName: "Free",
        priceMonthlyInr: 0,
        priceYearlyInr: 0,
        creditsPerMonth: 50,
        maxExams: 2,
        maxTutorialsFree: 5,
        maxAiQuestions: 10,
        maxMockExams: 2,
        features: {
          explanations: true,
          syllabus_structure: true,
          basic_analytics: true,
          detailed_analytics: false,
          ai_insights: false,
          ad_free: false,
        },
        sortOrder: 0,
      },
      {
        id: PLAN_IDS.pro,
        name: "pro",
        displayName: "Pro",
        priceMonthlyInr: 29900,
        priceYearlyInr: 249900,
        creditsPerMonth: 500,
        maxExams: 5,
        maxTutorialsFree: -1,
        maxAiQuestions: 100,
        maxMockExams: 20,
        features: {
          explanations: true,
          syllabus_structure: true,
          basic_analytics: true,
          detailed_analytics: true,
          ai_insights: false,
          ad_free: true,
        },
        sortOrder: 1,
      },
      {
        id: PLAN_IDS.premium,
        name: "premium",
        displayName: "Premium",
        priceMonthlyInr: 79900,
        priceYearlyInr: 699900,
        creditsPerMonth: -1,
        maxExams: -1,
        maxTutorialsFree: -1,
        maxAiQuestions: -1,
        maxMockExams: -1,
        features: {
          explanations: true,
          syllabus_structure: true,
          basic_analytics: true,
          detailed_analytics: true,
          ai_insights: true,
          ad_free: true,
        },
        sortOrder: 2,
      },
    ])
    .onConflictDoNothing();

  console.log("  Creating admin user...");
  const passwordHash = await bcrypt.hash("password123", 12);
  await db
    .insert(users)
    .values({
      id: ADMIN_ID,
      name: "Dev Admin",
      email: "admin@examforge.dev",
      username: "admin",
      phone: "+919999999999",
      passwordHash,
      role: "superadmin",
      orgId: ORG_ID,
      authProvider: "credentials",
      emailVerified: new Date(),
      phoneVerified: new Date(),
      isActive: true,
      isBanned: false,
      loginCount: 0,
      signupSource: "seed",
    })
    .onConflictDoNothing();

  console.log("  Creating test student user...");
  const studentPasswordHash = await bcrypt.hash("student123", 12);
  await db
    .insert(users)
    .values({
      id: STUDENT_ID,
      name: "Test Student",
      email: "student@examforge.dev",
      username: "teststudent",
      phone: "+919999999998",
      passwordHash: studentPasswordHash,
      role: "student",
      orgId: ORG_ID,
      authProvider: "credentials",
      emailVerified: new Date(),
      phoneVerified: new Date(),
      isActive: true,
      isBanned: false,
      loginCount: 0,
      unverifiedLoginCount: 0,
      signupSource: "seed",
      onboardingCompleted: true,
    })
    .onConflictDoNothing();
  // Reset verification state on re-seed so a previously-locked seed user
  // becomes usable again (onConflictDoNothing above leaves existing rows
  // untouched, so this update is the escape hatch for dev loops).
  await db
    .update(users)
    .set({
      phoneVerified: new Date(),
      emailVerified: new Date(),
      unverifiedLoginCount: 0,
      isActive: true,
      isBanned: false,
    })
    .where(eq(users.id, STUDENT_ID));

  console.log("  Creating test creator user + profile...");
  const creatorPasswordHash = await bcrypt.hash("creator123", 12);
  await db
    .insert(users)
    .values({
      id: CREATOR_ID,
      name: "Test Creator",
      email: "creator@examforge.dev",
      username: "testcreator",
      phone: "+919999999997",
      passwordHash: creatorPasswordHash,
      role: "student",
      orgId: ORG_ID,
      authProvider: "credentials",
      emailVerified: new Date(),
      phoneVerified: new Date(),
      isActive: true,
      isBanned: false,
      loginCount: 0,
      unverifiedLoginCount: 0,
      signupSource: "seed",
      onboardingCompleted: true,
    })
    .onConflictDoNothing();
  // Reset verification state on re-seed (see note above).
  await db
    .update(users)
    .set({
      phoneVerified: new Date(),
      emailVerified: new Date(),
      unverifiedLoginCount: 0,
      isActive: true,
      isBanned: false,
    })
    .where(eq(users.id, CREATOR_ID));
  await db
    .insert(creatorProfiles)
    .values({
      id: CREATOR_PROFILE_ID,
      userId: CREATOR_ID,
      displayName: "Test Creator",
      bio: "Seeded demo creator for end-to-end testing of the marketplace flow.",
      institutionType: "independent",
      qualification: "M.Pharm, GPAT topper",
      verificationStatus: "unverified",
      creatorTier: "free",
    })
    .onConflictDoNothing();

  // Create subscriptions for admin and student
  const now = new Date();
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);

  console.log("  Creating user subscriptions...");
  await db
    .insert(userSubscriptions)
    .values([
      {
        userId: STUDENT_ID,
        planId: PLAN_IDS.free,
        status: "active",
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
      },
      {
        userId: CREATOR_ID,
        planId: PLAN_IDS.free,
        status: "active",
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
      },
    ])
    .onConflictDoNothing();

  console.log("  Creating user credits...");
  await db
    .insert(userCredits)
    .values([
      {
        userId: STUDENT_ID,
        periodStart: periodStart.toISOString().split("T")[0],
        periodEnd: periodEnd.toISOString().split("T")[0],
        creditsTotal: 50,
        creditsUsed: 0,
      },
      {
        userId: CREATOR_ID,
        periodStart: periodStart.toISOString().split("T")[0],
        periodEnd: periodEnd.toISOString().split("T")[0],
        creditsTotal: 50,
        creditsUsed: 0,
      },
    ])
    .onConflictDoNothing();

  console.log("  Seeding feature flags...");
  await db
    .insert(adminFeatureFlags)
    .values([
      // Auth
      {
        key: "auth.signup_enabled",
        value: true,
        category: "auth",
        description: "Allow new user registrations",
      },
      {
        key: "auth.google_oauth_enabled",
        value: true,
        category: "auth",
        description: "Allow Google OAuth signup/login",
      },
      {
        key: "auth.email_password_enabled",
        value: true,
        category: "auth",
        description: "Allow email + password signup/login",
      },
      {
        key: "auth.phone_password_enabled",
        value: false,
        category: "auth",
        description: "Allow phone + password signup/login",
      },
      {
        key: "auth.username_login_enabled",
        value: true,
        category: "auth",
        description: "Allow login with username",
      },
      {
        key: "auth.email_otp_verification",
        value: true,
        category: "auth",
        description: "Require email OTP on signup",
      },
      {
        key: "auth.sms_otp_verification",
        value: false,
        category: "auth",
        description: "Require SMS OTP on signup (needs SMS provider)",
      },
      {
        key: "auth.require_verification",
        value: true,
        category: "auth",
        description: "Users must verify email/phone before full access",
      },
      // SMS
      {
        key: "sms.provider",
        value: "none",
        category: "sms",
        description: "SMS provider: none | msg91 | twilio",
      },
      {
        key: "sms.msg91_auth_key",
        value: "",
        category: "sms",
        description: "MSG91 authentication key",
      },
      {
        key: "sms.msg91_sender_id",
        value: "EXMFRG",
        category: "sms",
        description: "MSG91 sender ID (6 chars)",
      },
      {
        key: "sms.msg91_template_id",
        value: "",
        category: "sms",
        description: "MSG91 OTP template ID",
      },
      {
        key: "sms.twilio_account_sid",
        value: "",
        category: "sms",
        description: "Twilio Account SID",
      },
      {
        key: "sms.twilio_auth_token",
        value: "",
        category: "sms",
        description: "Twilio Auth Token",
      },
      {
        key: "sms.twilio_phone_number",
        value: "",
        category: "sms",
        description: "Twilio sender phone number",
      },
      // Payment
      {
        key: "payment.enabled",
        value: false,
        category: "payment",
        description: "Enable payment processing",
      },
      {
        key: "payment.provider",
        value: "razorpay",
        category: "payment",
        description: "Payment gateway: razorpay | stripe",
      },
      {
        key: "payment.razorpay_key_id",
        value: "",
        category: "payment",
        description: "Razorpay Key ID",
      },
      {
        key: "payment.razorpay_key_secret",
        value: "",
        category: "payment",
        description: "Razorpay Key Secret (encrypted)",
      },
      {
        key: "payment.razorpay_webhook_secret",
        value: "",
        category: "payment",
        description: "Razorpay Webhook Secret",
      },
      {
        key: "payment.test_mode",
        value: true,
        category: "payment",
        description: "Use test/sandbox credentials",
      },
      // Features
      {
        key: "feature.free_credits_on_signup",
        value: 50,
        category: "feature",
        description: "Credits given to new users",
      },
      {
        key: "feature.referral_bonus_credits",
        value: 10,
        category: "feature",
        description: "Credits for referrer when referee signs up",
      },
      {
        key: "feature.maintenance_mode",
        value: false,
        category: "feature",
        description: "Show maintenance page to non-admins",
      },
      // Creators Ecosystem (Phase A — all disabled at launch, enable progressively)
      {
        key: "creators.enabled",
        value: false,
        category: "creators",
        description: "Master switch for the creators ecosystem",
      },
      {
        key: "creators.registration_open",
        value: false,
        category: "creators",
        description: "Allow users to register as creators",
      },
      {
        key: "creators.marketplace_enabled",
        value: false,
        category: "creators",
        description: "Enable paid content marketplace",
      },
      {
        key: "creators.classrooms_enabled",
        value: false,
        category: "creators",
        description: "Enable classroom creation and enrolment",
      },
      {
        key: "creators.live_sessions_enabled",
        value: false,
        category: "creators",
        description: "Enable scheduling and joining live sessions",
      },
      {
        key: "creators.video_upload_enabled",
        value: false,
        category: "creators",
        description: "Allow creators to upload video lessons",
      },
      {
        key: "creators.audio_upload_enabled",
        value: false,
        category: "creators",
        description: "Allow creators to upload audio lessons",
      },
      {
        key: "creators.ocr_enabled",
        value: false,
        category: "creators",
        description: "Enable handwritten-note OCR ingestion",
      },
      {
        key: "creators.promotions_enabled",
        value: false,
        category: "creators",
        description: "Enable paid promotions/featured placements",
      },
      {
        key: "creators.doubts_enabled",
        value: false,
        category: "creators",
        description: "Enable student doubt submission and responses",
      },
      {
        key: "creators.ai_tutor_enabled",
        value: false,
        category: "creators",
        description: "Enable creator-branded AI tutor (RAG on creator content)",
      },
      {
        key: "creators.paid_classrooms_enabled",
        value: false,
        category: "creators",
        description: "Allow classrooms to charge recurring fees",
      },
      {
        key: "creators.revenue_share_verified",
        value: 70,
        category: "creators",
        description: "Verified creator revenue share percentage",
      },
      {
        key: "creators.revenue_share_premium",
        value: 80,
        category: "creators",
        description: "Premium/institute creator revenue share percentage",
      },
      {
        key: "creators.subscription_pool_percent",
        value: 20,
        category: "creators",
        description:
          "Percent of subscription revenue that flows into the free-content creator pool",
      },
      {
        key: "creators.subscription_pool_enabled",
        value: false,
        category: "creators",
        description:
          "Master gate for the monthly subscription-pool worker (off by default until real subscription revenue lands)",
      },
      {
        key: "creators.classroom_platform_fee_percent",
        value: 15,
        category: "creators",
        description: "Platform cut on paid classroom fees",
      },
      {
        key: "creators.min_payout_inr",
        value: 500,
        category: "creators",
        description: "Minimum creator wallet balance eligible for payout",
      },
      {
        key: "creators.max_video_size_mb",
        value: 2048,
        category: "creators",
        description: "Maximum creator video upload size in MB",
      },
      {
        key: "creators.max_audio_size_mb",
        value: 500,
        category: "creators",
        description: "Maximum creator audio upload size in MB",
      },
      {
        key: "creators.kyc_required_for_payout",
        value: true,
        category: "creators",
        description: "Require completed KYC before first payout",
      },
      {
        key: "creators.auto_publish_threshold",
        value: 0.75,
        category: "creators",
        description: "AI quality score threshold for auto-publishing without manual review",
      },
    ])
    .onConflictDoNothing();

  console.log("  Creating exams (10)...");
  await db
    .insert(exams)
    .values([
      {
        id: EXAM_IDS.bpharm,
        name: "BPharm Assistant Professor 2026",
        category: "pharmacy",
        subjects: ["Pharmaceutics", "Pharmacology", "Pharmaceutical Chemistry", "Pharmacognosy"],
        status: "upcoming",
        examDate: new Date("2026-06-15"),
        registrationStart: new Date("2026-03-01"),
        registrationEnd: new Date("2026-04-10"),
        conductingBody: "Kerala PSC",
        level: "state",
        eligibility: "MPharm with 55% marks",
        totalMarks: 100,
        durationMinutes: 75,
        negativeMarking: true,
        negativeMarkingScheme: "0.33 marks per wrong answer",
        examPattern: { marks: 100, duration: 75, negative: true },
        tags: ["pharmacy", "assistant professor", "kerala"],
        questionCount: 2800,
        isFeatured: true,
        popularityScore: 85,
        orgId: ORG_ID,
      },
      {
        id: EXAM_IDS.gpat,
        name: "GPAT 2026",
        category: "pharmacy",
        subjects: ["Pharmaceutics", "Pharmacology", "Pharmaceutical Analysis"],
        status: "upcoming",
        examDate: new Date("2026-03-22"),
        registrationStart: new Date("2026-01-15"),
        registrationEnd: new Date("2026-02-28"),
        conductingBody: "NTA",
        level: "national",
        eligibility: "BPharm 4-year degree",
        totalMarks: 500,
        durationMinutes: 180,
        negativeMarking: true,
        negativeMarkingScheme: "1 mark per wrong answer",
        examPattern: { marks: 500, duration: 180, negative: true },
        tags: ["pharmacy", "gpat", "postgraduate"],
        questionCount: 1800,
        isFeatured: true,
        popularityScore: 76,
        orgId: ORG_ID,
      },
      {
        id: EXAM_IDS.neet,
        name: "NEET UG 2026",
        category: "medical",
        subjects: ["Physics", "Chemistry", "Biology"],
        status: "upcoming",
        examDate: new Date("2026-05-03"),
        registrationStart: new Date("2026-02-01"),
        registrationEnd: new Date("2026-03-20"),
        conductingBody: "NTA",
        level: "national",
        eligibility: "12th pass with PCB, 50% marks",
        totalMarks: 720,
        durationMinutes: 200,
        negativeMarking: true,
        negativeMarkingScheme: "1 mark per wrong answer",
        examPattern: { marks: 720, duration: 200, negative: true },
        tags: ["medical", "biology", "chemistry", "physics"],
        questionCount: 4200,
        isFeatured: true,
        popularityScore: 98,
        orgId: ORG_ID,
      },
      {
        id: EXAM_IDS.upsc,
        name: "UPSC CSE Prelims 2026",
        category: "civil_services",
        subjects: ["General Studies", "CSAT"],
        status: "upcoming",
        examDate: new Date("2026-06-01"),
        registrationStart: new Date("2026-02-15"),
        registrationEnd: new Date("2026-03-15"),
        conductingBody: "UPSC",
        level: "national",
        eligibility: "Graduate in any discipline",
        totalMarks: 400,
        durationMinutes: 120,
        negativeMarking: true,
        negativeMarkingScheme: "0.33 marks per wrong answer",
        examPattern: { marks: 400, duration: 120, negative: true },
        tags: ["upsc", "civil services", "prelims", "ias"],
        questionCount: 3500,
        popularityScore: 95,
        orgId: ORG_ID,
      },
      {
        id: EXAM_IDS.keralaPsc,
        name: "Kerala PSC Pharmacist Gr II",
        category: "state_psc",
        subjects: ["Pharmacy Practice", "Pharmaceutical Chemistry", "Pharmacology"],
        status: "active",
        examDate: new Date("2026-04-05"),
        conductingBody: "Kerala PSC",
        level: "state",
        eligibility: "DPharm registered",
        totalMarks: 100,
        durationMinutes: 75,
        negativeMarking: false,
        examPattern: { marks: 100, duration: 75, negative: false },
        tags: ["kerala", "pharmacist", "grade 2"],
        questionCount: 1100,
        popularityScore: 65,
        orgId: ORG_ID,
      },
      {
        id: EXAM_IDS.tnpsc,
        name: "TNPSC Assistant Professor",
        category: "state_psc",
        subjects: ["Pharmaceutics", "Pharmacology", "Pharmaceutical Chemistry"],
        status: "upcoming",
        examDate: new Date("2026-07-20"),
        registrationStart: new Date("2026-04-01"),
        registrationEnd: new Date("2026-05-01"),
        conductingBody: "TNPSC",
        level: "state",
        eligibility: "MPharm/PhD with NET",
        totalMarks: 200,
        durationMinutes: 180,
        negativeMarking: false,
        examPattern: { marks: 200, duration: 180, negative: false },
        tags: ["tnpsc", "assistant professor", "tamil nadu"],
        questionCount: 400,
        popularityScore: 58,
        orgId: ORG_ID,
      },
      {
        id: EXAM_IDS.neetPg,
        name: "NEET PG 2026",
        category: "medical",
        subjects: ["Pre-clinical", "Para-clinical", "Clinical"],
        status: "upcoming",
        examDate: new Date("2026-04-20"),
        registrationStart: new Date("2026-02-01"),
        registrationEnd: new Date("2026-03-05"),
        conductingBody: "NBEMS",
        level: "national",
        eligibility: "MBBS degree with internship",
        totalMarks: 800,
        durationMinutes: 210,
        negativeMarking: true,
        negativeMarkingScheme: "1 mark per wrong answer",
        examPattern: { marks: 800, duration: 210, negative: true },
        tags: ["medical", "postgraduate", "neet pg"],
        questionCount: 2200,
        popularityScore: 88,
        orgId: ORG_ID,
      },
      {
        id: EXAM_IDS.fmge,
        name: "FMGE December 2025",
        category: "medical",
        subjects: ["Pre-clinical", "Para-clinical", "Clinical"],
        status: "past",
        examDate: new Date("2025-12-10"),
        conductingBody: "NBEMS",
        level: "national",
        eligibility: "Foreign medical graduate",
        totalMarks: 300,
        durationMinutes: 150,
        negativeMarking: false,
        examPattern: { marks: 300, duration: 150, negative: false },
        tags: ["fmge", "medical", "foreign graduate"],
        questionCount: 1600,
        popularityScore: 70,
        orgId: ORG_ID,
      },
      {
        id: EXAM_IDS.gate,
        name: "GATE 2026 — Pharmacy",
        category: "engineering",
        subjects: ["Pharmaceutical Sciences"],
        status: "upcoming",
        examDate: new Date("2026-02-08"),
        registrationStart: new Date("2025-09-01"),
        registrationEnd: new Date("2026-01-15"),
        conductingBody: "IIT Roorkee",
        level: "national",
        eligibility: "BPharm or equivalent",
        totalMarks: 100,
        durationMinutes: 180,
        negativeMarking: true,
        negativeMarkingScheme: "0.33 marks per wrong answer for MCQ",
        examPattern: { marks: 100, duration: 180, negative: true },
        tags: ["gate", "pharmacy", "engineering"],
        questionCount: 950,
        popularityScore: 72,
        orgId: ORG_ID,
      },
      {
        id: EXAM_IDS.ugcNet,
        name: "UGC NET Pharmaceutical Sciences",
        category: "pharmacy",
        subjects: ["Pharmaceutical Sciences"],
        status: "upcoming",
        examDate: new Date("2026-06-25"),
        registrationStart: new Date("2026-03-15"),
        registrationEnd: new Date("2026-04-15"),
        conductingBody: "NTA",
        level: "national",
        eligibility: "MPharm or equivalent",
        totalMarks: 300,
        durationMinutes: 180,
        negativeMarking: false,
        examPattern: { marks: 300, duration: 180, negative: false },
        tags: ["ugc net", "pharmacy", "lecturership"],
        questionCount: 750,
        popularityScore: 62,
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
          question:
            "Which of the following is a natural polymer used in sustained release formulations?",
          options: ["Eudragit", "Guar gum", "Polycarbonate", "Nylon"],
          answer: 1,
          explanation:
            "Guar gum is a natural polysaccharide polymer widely used in sustained release formulations due to its gel-forming properties.",
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
          question:
            "Which enzyme is responsible for the conversion of angiotensin I to angiotensin II?",
          options: ["Renin", "ACE", "Pepsin", "Trypsin"],
          answer: 1,
          explanation:
            "Angiotensin Converting Enzyme (ACE) converts angiotensin I to angiotensin II, a potent vasoconstrictor.",
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
          options: [
            "Solubility and molecular weight",
            "Solubility and permeability",
            "Permeability and stability",
            "Stability and solubility",
          ],
          answer: 1,
          explanation:
            "The Biopharmaceutics Classification System (BCS) classifies drugs into four classes based on their aqueous solubility and intestinal permeability.",
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
          explanation:
            "Enalapril is a prodrug that is converted to its active form enalaprilat by esterases in the liver.",
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
          explanation:
            "Quinine is the principal alkaloid obtained from the bark of Cinchona species and is used as an antimalarial agent.",
        },
        subject: "Pharmacognosy",
        topic: "Alkaloids",
        difficulty: "medium",
        source: "BPharm Exam 2023",
        orgId: ORG_ID,
      },
    ])
    .onConflictDoNothing();

  console.log("  Creating scrape sources (5)...");
  await db
    .insert(scrapeSources)
    .values([
      {
        id: SOURCE_IDS.pharmQuiz,
        name: "PharmQuiz Daily MCQs",
        url: "https://pharmaquiz.net/bpharm-mcqs",
        status: "active",
        examId: EXAM_IDS.bpharm,
        sourceType: "question_bank",
        scrapeFrequency: "daily",
        scrapeDepth: 3,
        contentFormat: "html",
        aiProvider: "claude",
        totalRuns: 28,
        successfulRuns: 27,
        totalQuestionsScraped: 342,
        questionsCount: 342,
        lastScrapedAt: new Date("2026-03-10T12:00:00Z"),
        tags: ["pharmacy", "mcq", "bpharm"],
        config: {
          crawlerType: "cheerio",
          maxPages: 50,
          fetchDelayMs: 1000,
          contentSelector: ".question-container",
          questionTypes: ["mcq"],
        },
        orgId: ORG_ID,
      },
      {
        id: SOURCE_IDS.gpatPrep,
        name: "GPAT Previous Papers",
        url: "https://gpatprep.com/papers",
        status: "active",
        examId: EXAM_IDS.gpat,
        sourceType: "previous_year",
        scrapeFrequency: "weekly",
        scrapeDepth: 5,
        contentFormat: "html",
        aiProvider: "auto",
        totalRuns: 12,
        successfulRuns: 12,
        totalQuestionsScraped: 1240,
        questionsCount: 1240,
        lastScrapedAt: new Date("2026-03-09T08:00:00Z"),
        tags: ["gpat", "previous year", "pharmacy"],
        config: {
          crawlerType: "playwright",
          maxPages: 100,
          fetchDelayMs: 2000,
          questionTypes: ["mcq", "true_false"],
        },
        orgId: ORG_ID,
      },
      {
        id: SOURCE_IDS.keralaPscArchives,
        name: "Kerala PSC Archives",
        url: "https://keralapsc.gov.in/previous",
        status: "active",
        examId: EXAM_IDS.keralaPsc,
        sourceType: "previous_year",
        scrapeFrequency: "daily",
        scrapeDepth: 4,
        contentFormat: "pdf",
        aiProvider: "claude",
        totalRuns: 45,
        successfulRuns: 44,
        totalQuestionsScraped: 2100,
        questionsCount: 2100,
        lastScrapedAt: new Date("2026-03-10T02:00:00Z"),
        tags: ["kerala psc", "previous year", "pharmacist"],
        config: {
          crawlerType: "playwright",
          maxPages: 30,
          fetchDelayMs: 3000,
          questionTypes: ["mcq"],
        },
        orgId: ORG_ID,
      },
      {
        id: SOURCE_IDS.keralaPscGk,
        name: "Kerala PSC GK — Previous Question Papers",
        url: "https://keralapscgk.com/p/previous-question-papers.html",
        status: "active",
        examId: EXAM_IDS.keralaPsc,
        sourceType: "previous_year",
        scrapeFrequency: "weekly",
        scrapeDepth: 5,
        contentFormat: "html",
        aiProvider: "claude",
        totalRuns: 0,
        successfulRuns: 0,
        totalQuestionsScraped: 0,
        questionsCount: 0,
        tags: ["kerala psc", "previous year", "community", "2001-2024"],
        config: {
          crawlerType: "cheerio",
          maxPages: 200,
          fetchDelayMs: 2000,
          questionTypes: ["mcq"],
        },
        orgId: ORG_ID,
      },
      {
        id: SOURCE_IDS.pscPdfBanks,
        name: "PSC PDF Banks — Previous Question Papers",
        url: "https://pscpdfbanks.in/p/previous-question-papers.html",
        status: "active",
        examId: EXAM_IDS.keralaPsc,
        sourceType: "previous_year",
        scrapeFrequency: "weekly",
        scrapeDepth: 5,
        contentFormat: "pdf",
        aiProvider: "claude",
        totalRuns: 0,
        successfulRuns: 0,
        totalQuestionsScraped: 0,
        questionsCount: 0,
        tags: ["kerala psc", "previous year", "pdf", "community", "with answers"],
        config: {
          crawlerType: "playwright",
          maxPages: 200,
          fetchDelayMs: 3000,
          questionTypes: ["mcq"],
        },
        orgId: ORG_ID,
      },
    ])
    .onConflictDoNothing();

  console.log("  Creating exam notifications (2)...");
  await db
    .insert(examNotifications)
    .values([
      {
        examId: EXAM_IDS.neet,
        type: "registration_open",
        title: "NEET UG 2026 Registration Now Open",
        description:
          "NTA has opened the registration portal for NEET UG 2026. Last date to apply is March 20, 2026.",
        sourceUrl: "https://nta.ac.in/neet-ug-2026",
        isImportant: true,
        detectedAt: new Date("2026-02-01"),
      },
      {
        examId: EXAM_IDS.gpat,
        type: "date_change",
        title: "GPAT 2026 Exam Date Revised to March 22",
        description: "NTA has revised the GPAT 2026 exam date from March 15 to March 22, 2026.",
        sourceUrl: "https://nta.ac.in/gpat-2026",
        isImportant: true,
        detectedAt: new Date("2026-02-20"),
      },
    ])
    .onConflictDoNothing();

  console.log("\nSeed complete!");
  console.log("──────────────────────────────────────");
  console.log("  Admin:    admin@examforge.dev / password123");
  console.log("  Student:  student@examforge.dev / student123");
  console.log("  Creator:  creator@examforge.dev / creator123");
  console.log("  Exams:    10 seeded");
  console.log("  Sources:  3 seeded");
  console.log("  Plans:    3 seeded (free, pro, premium)");
  console.log("  Flags:    45 seeded");
  console.log("──────────────────────────────────────");

  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
