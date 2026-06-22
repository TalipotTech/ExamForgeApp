import { config } from "dotenv";
config({ path: "../../.env.local" });

import bcrypt from "bcryptjs";
import { and, eq, gte, sql } from "drizzle-orm";
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
  promotions,
  adminAuditLog,
  creatorContent,
  creatorWallets,
  creatorEarnings,
  creatorFollowers,
  contentViews,
  classrooms,
  classroomMembers,
  doubts,
  doubtResponses,
  paymentOrders,
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
      slug: "test-creator",
      bio: "Seeded demo creator for end-to-end testing of the marketplace flow.",
      institutionType: "independent",
      qualification: "M.Pharm, GPAT topper",
      verificationStatus: "verified",
      isFeatured: true,
      creatorTier: "free",
      specializations: ["pharmacology", "pharmaceutics"],
      examsCovered: [EXAM_IDS.bpharm, EXAM_IDS.gpat],
    })
    .onConflictDoNothing();
  // Backfill the slug + visibility on re-seed (onConflictDoNothing leaves
  // existing rows untouched, so this update is the escape hatch).
  await db
    .update(creatorProfiles)
    .set({
      slug: "test-creator",
      verificationStatus: "verified",
      isFeatured: true,
      isActive: true,
      specializations: ["pharmacology", "pharmaceutics"],
      examsCovered: [EXAM_IDS.bpharm, EXAM_IDS.gpat],
    })
    .where(eq(creatorProfiles.id, CREATOR_PROFILE_ID));

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

  // ─── Promotions (one row per status for /admin/promotions QA) ──────────
  console.log("  Seeding promotions...");
  const PROMO_IDS = {
    pending: "a1000000-0000-0000-0000-000000000001",
    active: "a1000000-0000-0000-0000-000000000002",
    rejected: "a1000000-0000-0000-0000-000000000003",
    expired: "a1000000-0000-0000-0000-000000000004",
  };
  const nowMs = Date.now();
  const days = (n: number): Date => new Date(nowMs + n * 24 * 60 * 60 * 1000);

  await db
    .insert(promotions)
    .values([
      {
        id: PROMO_IDS.pending,
        creatorId: CREATOR_PROFILE_ID,
        promotionType: "banner",
        bannerImageUrl: "https://picsum.photos/seed/promo-pending/640/360",
        headline: "Free GPAT crash course — limited seats",
        description: "Two-week intensive GPAT prep with daily MCQs and weekly mock tests.",
        ctaText: "Enroll free",
        ctaUrl: "https://example.com/gpat-crash",
        targetExams: ["gpat", "bpharm"],
        targetSubjects: ["pharmacology"],
        budgetType: "flat",
        budgetAmountInr: 5000,
        spentAmountInr: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        startsAt: days(0),
        endsAt: days(30),
        status: "pending",
      },
      {
        id: PROMO_IDS.active,
        creatorId: CREATOR_PROFILE_ID,
        promotionType: "featured",
        bannerImageUrl: "https://picsum.photos/seed/promo-active/640/360",
        headline: "BPharm 2026 batch — early-bird discount",
        description: "Full-syllabus BPharm Assistant Professor coaching with mentor calls.",
        ctaText: "Join now",
        ctaUrl: "https://example.com/bpharm-2026",
        targetExams: ["bpharm"],
        targetSubjects: ["pharmaceutics", "pharmacology"],
        budgetType: "impressions",
        budgetAmountInr: 100000,
        spentAmountInr: 27500,
        impressions: 27500,
        clicks: 612,
        conversions: 38,
        startsAt: days(-5),
        endsAt: days(25),
        status: "active",
        approvedBy: ADMIN_ID,
      },
      {
        id: PROMO_IDS.rejected,
        creatorId: CREATOR_PROFILE_ID,
        promotionType: "sponsored",
        bannerImageUrl: "https://picsum.photos/seed/promo-rejected/640/360",
        headline: "Spam test promo",
        description: "Banner failed brand-safety review.",
        ctaText: "Click here",
        ctaUrl: "https://example.com/spam",
        targetExams: ["neet"],
        targetSubjects: [],
        budgetType: "flat",
        budgetAmountInr: 2000,
        spentAmountInr: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        startsAt: days(-2),
        endsAt: days(28),
        status: "rejected",
      },
      {
        id: PROMO_IDS.expired,
        creatorId: CREATOR_PROFILE_ID,
        promotionType: "banner",
        bannerImageUrl: "https://picsum.photos/seed/promo-expired/640/360",
        headline: "Old GATE-Pharma promo (expired)",
        description: "Promo whose run window has ended.",
        ctaText: "Learn more",
        ctaUrl: "https://example.com/gate-pharma",
        targetExams: ["gate"],
        targetSubjects: ["pharmaceutics"],
        budgetType: "clicks",
        budgetAmountInr: 50000,
        spentAmountInr: 48750,
        impressions: 412300,
        clicks: 9750,
        conversions: 184,
        startsAt: days(-30),
        endsAt: days(-1),
        status: "active",
        approvedBy: ADMIN_ID,
      },
    ])
    .onConflictDoNothing();

  // ─── Creator analytics fixtures (Test Creator) ─────────────────────────
  // Populates content_views, creator_earnings, creator_wallets,
  // creator_followers, classrooms + members, doubts + responses so
  // /creator/analytics shows non-empty charts and KPIs.
  console.log("  Seeding creator analytics fixtures...");
  // nowMs/days helpers are declared above in the promotions block.

  const ANALYTICS_IDS = {
    content: "f1000000-0000-0000-0000-000000000001",
    classroom: "f2000000-0000-0000-0000-000000000001",
    classroomMember1: "f2000000-0000-0000-0000-000000000011",
    classroomMember2: "f2000000-0000-0000-0000-000000000012",
    follower1: "f3000000-0000-0000-0000-000000000001",
    follower2: "f3000000-0000-0000-0000-000000000002",
    follower3: "f3000000-0000-0000-0000-000000000003",
    follower4: "f3000000-0000-0000-0000-000000000004",
    follower5: "f3000000-0000-0000-0000-000000000005",
  };

  // 1) One published piece of content for views to hang off.
  await db
    .insert(creatorContent)
    .values({
      id: ANALYTICS_IDS.content,
      creatorId: CREATOR_PROFILE_ID,
      contentType: "article",
      title: "Pharmacology cheat-sheet — top 50 drug classes",
      description: "Quick-revision notes for GPAT / BPharm.",
      body: "Stub body for the seeded analytics fixture.",
      isPublished: true,
      publishedAt: days(-25),
      uploadStatus: "completed",
      reviewStatus: "approved",
      viewCount: 320,
      likeCount: 42,
      doubtCount: 3,
      totalWatchMinutes: 480,
      avgRating: 4.5,
    })
    .onConflictDoNothing();

  // 2) Wallet (one row per creator). Amounts are paisa, recomputed
  // below from creator_earnings so balance == sum(available earnings).
  await db
    .insert(creatorWallets)
    .values({
      creatorId: CREATOR_PROFILE_ID,
      balanceInr: 0,
      pendingInr: 0,
      lifetimeEarnedInr: 0,
    })
    .onConflictDoNothing();

  // 3) Earnings spread across last ~30 days. Mix of statuses.
  const earningRows: (typeof creatorEarnings.$inferInsert)[] = [];
  const earningSchedule: { offset: number; amount: number; status: string; type: string }[] = [
    { offset: -28, amount: 49900, status: "available", type: "sale" },
    { offset: -22, amount: 29900, status: "available", type: "sale" },
    { offset: -18, amount: 9900, status: "available", type: "tip" },
    { offset: -14, amount: 49900, status: "available", type: "sale" },
    { offset: -10, amount: 99900, status: "available", type: "sale" },
    { offset: -7, amount: 19900, status: "available", type: "tip" },
    { offset: -5, amount: 49900, status: "pending", type: "sale" },
    { offset: -3, amount: 14900, status: "pending", type: "tip" },
    { offset: -1, amount: 19900, status: "pending", type: "sale" },
    { offset: 0, amount: 9900, status: "pending", type: "subscription_pool" },
  ];
  for (const e of earningSchedule) {
    earningRows.push({
      creatorId: CREATOR_PROFILE_ID,
      earningType: e.type,
      amountInr: e.amount,
      status: e.status,
      availableAt: e.status === "available" ? days(e.offset + 7) : null,
      createdAt: days(e.offset),
      description: `Seeded ${e.type} earning`,
    });
  }
  await db.insert(creatorEarnings).values(earningRows).onConflictDoNothing();

  // 4) Daily content_views for the last 30 days (1-12 per day, weighted).
  const viewRows: (typeof contentViews.$inferInsert)[] = [];
  for (let dayOffset = -29; dayOffset <= 0; dayOffset += 1) {
    // Deterministic pseudo-random: gentle weekly oscillation 2-12 views.
    const base = 4 + ((dayOffset + 30) % 7);
    const burst = dayOffset % 5 === 0 ? 4 : 0;
    const count = base + burst;
    for (let i = 0; i < count; i += 1) {
      viewRows.push({
        contentId: ANALYTICS_IDS.content,
        creatorId: CREATOR_PROFILE_ID,
        userId: STUDENT_ID,
        watchedSeconds: 60 + ((i * 17) % 240),
        completed: i % 4 === 0,
        creditCost: 0,
        createdAt: new Date(days(dayOffset).getTime() + i * 60_000),
      });
    }
  }
  await db.insert(contentViews).values(viewRows).onConflictDoNothing();

  // 5) Five followers across last 30 days (drives follower-delta KPI).
  await db
    .insert(creatorFollowers)
    .values([
      {
        id: ANALYTICS_IDS.follower1,
        creatorId: CREATOR_PROFILE_ID,
        studentId: STUDENT_ID,
        followedAt: days(-25),
      },
      {
        id: ANALYTICS_IDS.follower2,
        creatorId: CREATOR_PROFILE_ID,
        studentId: ADMIN_ID,
        followedAt: days(-18),
      },
      {
        id: ANALYTICS_IDS.follower3,
        creatorId: CREATOR_PROFILE_ID,
        studentId: STUDENT_ID,
        followedAt: days(-12),
      },
      {
        id: ANALYTICS_IDS.follower4,
        creatorId: CREATOR_PROFILE_ID,
        studentId: ADMIN_ID,
        followedAt: days(-5),
      },
      {
        id: ANALYTICS_IDS.follower5,
        creatorId: CREATOR_PROFILE_ID,
        studentId: STUDENT_ID,
        followedAt: days(-1),
      },
    ])
    .onConflictDoNothing();

  // Audit log entry so the "Why rejected?" popover has a reason to show.
  await db
    .insert(adminAuditLog)
    .values({
      adminId: ADMIN_ID,
      action: "promotion.reject",
      targetType: "promotion",
      targetId: PROMO_IDS.rejected,
      details: {
        before: { status: "pending" },
        after: { status: "rejected" },
        reason: "Banner image violates policy: includes competitor branding and unverified claims.",
      },
    })
    .onConflictDoNothing();

  // 6) One classroom + two members so the Classrooms tab has a row.
  await db
    .insert(classrooms)
    .values({
      id: ANALYTICS_IDS.classroom,
      teacherId: CREATOR_ID,
      creatorId: CREATOR_PROFILE_ID,
      name: "BPharm 2026 — pilot batch",
      description: "Seeded classroom for analytics QA.",
      joinCode: "ANALY1",
      isActive: true,
      maxStudents: 50,
      studentCount: 2,
      isPaid: false,
      createdAt: days(-20),
    })
    .onConflictDoNothing();
  await db
    .insert(classroomMembers)
    .values([
      {
        id: ANALYTICS_IDS.classroomMember1,
        classroomId: ANALYTICS_IDS.classroom,
        studentId: STUDENT_ID,
        joinedAt: days(-15),
      },
      {
        id: ANALYTICS_IDS.classroomMember2,
        classroomId: ANALYTICS_IDS.classroom,
        studentId: ADMIN_ID,
        joinedAt: days(-3),
      },
    ])
    .onConflictDoNothing();

  // 7) Doubts + a response so the Engagement tab populates.
  const DOUBT_IDS = {
    open: "f4000000-0000-0000-0000-000000000001",
    answered: "f4000000-0000-0000-0000-000000000002",
    closed: "f4000000-0000-0000-0000-000000000003",
  };
  await db
    .insert(doubts)
    .values([
      {
        id: DOUBT_IDS.open,
        studentId: STUDENT_ID,
        creatorId: CREATOR_ID,
        contentId: ANALYTICS_IDS.content,
        questionText: "What is the mechanism of action of beta-blockers?",
        status: "open",
        createdAt: days(-2),
      },
      {
        id: DOUBT_IDS.answered,
        studentId: STUDENT_ID,
        creatorId: CREATOR_ID,
        contentId: ANALYTICS_IDS.content,
        questionText: "Difference between agonist and antagonist?",
        status: "answered",
        createdAt: days(-7),
      },
      {
        id: DOUBT_IDS.closed,
        studentId: STUDENT_ID,
        creatorId: CREATOR_ID,
        contentId: ANALYTICS_IDS.content,
        questionText: "What's the half-life formula?",
        status: "closed",
        createdAt: days(-12),
      },
    ])
    .onConflictDoNothing();
  await db
    .insert(doubtResponses)
    .values([
      {
        doubtId: DOUBT_IDS.answered,
        responderId: CREATOR_ID,
        responseText: "Agonists activate; antagonists block. Full notes attached.",
        responseType: "text",
        isAi: false,
        createdAt: new Date(days(-7).getTime() + 4 * 60 * 60 * 1000), // +4h
      },
      {
        doubtId: DOUBT_IDS.closed,
        responderId: CREATOR_ID,
        responseText: "t½ = 0.693 / k. See chapter 3.",
        responseType: "text",
        isAi: false,
        createdAt: new Date(days(-12).getTime() + 2 * 60 * 60 * 1000), // +2h
      },
    ])
    .onConflictDoNothing();

  // 8) Recompute aggregates from the rows we just inserted so every
  // counter on the profile + wallet + content cross-references against
  // the underlying tables. This is the test-bench equivalent of the
  // counter-update jobs that run in production.
  const [availableSumRow] = await db
    .select({
      sum: sql<number>`coalesce(sum(${creatorEarnings.amountInr}), 0)::int`,
    })
    .from(creatorEarnings)
    .where(
      and(
        eq(creatorEarnings.creatorId, CREATOR_PROFILE_ID),
        eq(creatorEarnings.status, "available"),
      ),
    );
  const [pendingSumRow] = await db
    .select({
      sum: sql<number>`coalesce(sum(${creatorEarnings.amountInr}), 0)::int`,
    })
    .from(creatorEarnings)
    .where(
      and(eq(creatorEarnings.creatorId, CREATOR_PROFILE_ID), eq(creatorEarnings.status, "pending")),
    );
  const [paidOutSumRow] = await db
    .select({
      sum: sql<number>`coalesce(sum(${creatorEarnings.amountInr}), 0)::int`,
    })
    .from(creatorEarnings)
    .where(
      and(
        eq(creatorEarnings.creatorId, CREATOR_PROFILE_ID),
        eq(creatorEarnings.status, "paid_out"),
      ),
    );
  const [salesCountRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(creatorEarnings)
    .where(
      and(
        eq(creatorEarnings.creatorId, CREATOR_PROFILE_ID),
        eq(creatorEarnings.earningType, "sale"),
      ),
    );
  const [viewsCountRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contentViews)
    .where(eq(contentViews.creatorId, CREATOR_PROFILE_ID));
  const [followersCountRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(creatorFollowers)
    .where(eq(creatorFollowers.creatorId, CREATOR_PROFILE_ID));
  const [contentCountRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(creatorContent)
    .where(
      and(eq(creatorContent.creatorId, CREATOR_PROFILE_ID), eq(creatorContent.isPublished, true)),
    );
  const [studentsCountRow] = await db
    .select({
      sum: sql<number>`coalesce(sum(${classrooms.studentCount}), 0)::int`,
    })
    .from(classrooms)
    .where(eq(classrooms.creatorId, CREATOR_PROFILE_ID));

  const availableSum = Number(availableSumRow?.sum ?? 0);
  const pendingSum = Number(pendingSumRow?.sum ?? 0);
  const paidOutSum = Number(paidOutSumRow?.sum ?? 0);
  const lifetimeSum = availableSum + paidOutSum;
  const totalViewsCount = Number(viewsCountRow?.count ?? 0);

  await db
    .update(creatorWallets)
    .set({
      balanceInr: availableSum,
      pendingInr: pendingSum,
      lifetimeEarnedInr: lifetimeSum,
    })
    .where(eq(creatorWallets.creatorId, CREATOR_PROFILE_ID));

  await db
    .update(creatorContent)
    .set({ viewCount: totalViewsCount })
    .where(eq(creatorContent.id, ANALYTICS_IDS.content));

  await db
    .update(creatorProfiles)
    .set({
      followerCount: Number(followersCountRow?.count ?? 0),
      contentCount: Number(contentCountRow?.count ?? 0),
      totalViews: totalViewsCount,
      totalStudents: Number(studentsCountRow?.sum ?? 0),
      totalSales: Number(salesCountRow?.count ?? 0),
      totalRevenueEarned: lifetimeSum,
      averageRating: 4.5,
      totalRatings: 12,
    })
    .where(eq(creatorProfiles.id, CREATOR_PROFILE_ID));

  console.log(
    `    wallet: ₹${(availableSum / 100).toFixed(0)} balance / ₹${(pendingSum / 100).toFixed(0)} pending / ${totalViewsCount} views`,
  );

  // ─── Subscription-pool fixtures ────────────────────────────────────────
  // Lets a developer flow the worker end-to-end:
  //   1) flip creators.subscription_pool_enabled -> true in /admin/settings
  //   2) visit /admin/subscription-pool
  //   3) click "Run for [last month]" — pool computed from these rows.
  console.log("  Seeding subscription-pool fixtures...");

  // Use the previous calendar month so the worker's "previous month" default
  // matches what we seed. Anchor in the middle of the month to dodge
  // timezone edge cases at month boundaries.
  const seedNow = new Date();
  const lastMonth = new Date(
    Date.UTC(seedNow.getUTCFullYear(), seedNow.getUTCMonth() - 1, 15, 12, 0, 0),
  );

  const POOL_FIXTURE_IDS = {
    content: "f1000000-0000-0000-0000-000000000010",
    payment: "f5000000-0000-0000-0000-000000000001",
  };

  // 1) One published piece of content for views to attach to.
  await db
    .insert(creatorContent)
    .values({
      id: POOL_FIXTURE_IDS.content,
      creatorId: CREATOR_PROFILE_ID,
      contentType: "article",
      title: "Free pharmacology revision (subscription-pool fixture)",
      description: "Seeded so subscription-pool worker has views to score.",
      body: "Stub body for subscription-pool fixture content.",
      isPublished: true,
      publishedAt: lastMonth,
      uploadStatus: "completed",
      reviewStatus: "approved",
    })
    .onConflictDoNothing();

  // 2) One completed subscription order from last month → ₹1,000 of revenue
  // (100,000 paisa). Pool = 70% = 70,000 paisa = ₹700.
  await db
    .insert(paymentOrders)
    .values({
      id: POOL_FIXTURE_IDS.payment,
      userId: STUDENT_ID,
      orderType: "subscription",
      amountInr: 100_000, // paisa
      status: "completed",
      planId: PLAN_IDS.pro,
      billingCycle: "monthly",
      createdAt: lastMonth,
      updatedAt: lastMonth,
    })
    .onConflictDoNothing();

  // 3) 20 free views by the student last month so the creator scores.
  // Skip if any rows already exist for this content+last-month — keeps the
  // fixture idempotent without needing per-view UUIDs.
  const [{ existingViews }] = (await db
    .select({
      existingViews: sql<number>`count(*)::int`,
    })
    .from(contentViews)
    .where(
      and(
        eq(contentViews.contentId, POOL_FIXTURE_IDS.content),
        gte(
          contentViews.createdAt,
          new Date(Date.UTC(lastMonth.getUTCFullYear(), lastMonth.getUTCMonth(), 1)),
        ),
      ),
    )) as { existingViews: number }[];

  if (Number(existingViews ?? 0) === 0) {
    const viewRows = Array.from({ length: 20 }).map((_, i) => ({
      contentId: POOL_FIXTURE_IDS.content,
      creatorId: CREATOR_PROFILE_ID,
      userId: STUDENT_ID,
      watchedSeconds: 90 + (i % 5) * 30, // 90-210s of watch time
      completed: i % 4 === 0,
      creditCost: 0, // free views drive the pool score
      createdAt: new Date(lastMonth.getTime() + i * 60_000),
    }));
    await db.insert(contentViews).values(viewRows);
  }

  console.log(
    `    pool fixture: 1 subscription order (₹1,000), 20 free views attributed to Test Creator`,
  );

  console.log("\nSeed complete!");
  console.log("──────────────────────────────────────");
  console.log("  Admin:     admin@examforge.dev / password123");
  console.log("  Student:   student@examforge.dev / student123");
  console.log("  Creator:   creator@examforge.dev / creator123");
  console.log("  Exams:     10 seeded");
  console.log("  Sources:   3 seeded");
  console.log("  Plans:     3 seeded (free, pro, premium)");
  console.log("  Flags:     45 seeded");
  console.log("  Promotions: 4 seeded (pending, active, rejected, expired)");
  console.log("  Analytics: 1 content, ~200 views, 10 earnings,");
  console.log("             5 followers, 1 classroom + 2 members,");
  console.log("             3 doubts + 2 responses");
  console.log("  Pool:      1 subscription order (₹1,000) + 20 free views (last month)");
  console.log("──────────────────────────────────────");

  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
