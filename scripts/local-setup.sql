-- =============================================================================
-- ExamForge — Local PostgreSQL 17 Setup & Debug Script
-- =============================================================================
-- Connection:  localhost:5432
-- Username:    ensate_user
-- Password:    Talipot@123
-- Database:    examforge_dev
--
-- Usage (run from project root):
--   psql -h localhost -p 5432 -U ensate_user -f scripts/local-setup.sql
--
-- Or step by step via psql:
--   psql -h localhost -p 5432 -U ensate_user -d postgres
--   \i scripts/local-setup.sql
--
-- WARNING: This drops and recreates the database. All data will be lost.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Database & Extension Setup
-- ---------------------------------------------------------------------------

-- Connect to default database first to create/drop examforge_dev
-- (run these two commands manually if the database doesn't exist yet):
--   CREATE DATABASE examforge_dev OWNER ensate_user;
--   \c examforge_dev

-- Enable required extensions (requires connecting to examforge_dev)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------------
-- 2. Drop existing objects (safe re-run)
-- ---------------------------------------------------------------------------

-- Drop tables in dependency order (children before parents)
DROP TABLE IF EXISTS "ai_usage_logs"      CASCADE;
DROP TABLE IF EXISTS "exam_sessions"      CASCADE;
DROP TABLE IF EXISTS "question_versions"  CASCADE;
DROP TABLE IF EXISTS "questions"          CASCADE;
DROP TABLE IF EXISTS "scrape_sources"     CASCADE;
DROP TABLE IF EXISTS "exams"              CASCADE;
DROP TABLE IF EXISTS "users"              CASCADE;
DROP TABLE IF EXISTS "organizations"      CASCADE;

-- Drop enums
DROP TYPE IF EXISTS "change_type"    CASCADE;
DROP TYPE IF EXISTS "difficulty"     CASCADE;
DROP TYPE IF EXISTS "question_type"  CASCADE;
DROP TYPE IF EXISTS "scrape_status"  CASCADE;
DROP TYPE IF EXISTS "user_role"      CASCADE;

-- ---------------------------------------------------------------------------
-- 3. Create Enums
-- ---------------------------------------------------------------------------

CREATE TYPE "public"."change_type" AS ENUM(
  'created', 'updated', 'reviewed', 'translated', 'archived'
);

CREATE TYPE "public"."difficulty" AS ENUM(
  'easy', 'medium', 'hard'
);

CREATE TYPE "public"."question_type" AS ENUM(
  'mcq', 'true_false', 'fill_blank', 'match', 'assertion'
);

CREATE TYPE "public"."scrape_status" AS ENUM(
  'pending', 'active', 'paused', 'error', 'completed'
);

CREATE TYPE "public"."user_role" AS ENUM(
  'student', 'teacher', 'admin', 'superadmin'
);

-- ---------------------------------------------------------------------------
-- 4. Create Tables
-- ---------------------------------------------------------------------------

-- 4a. organizations (root entity — no FK dependencies)
CREATE TABLE "organizations" (
  "id"         uuid        PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name"       varchar(255) NOT NULL,
  "slug"       varchar(100) NOT NULL,
  "plan"       varchar(50)  NOT NULL DEFAULT 'free',
  "is_active"  boolean      NOT NULL DEFAULT true,
  "settings"   jsonb        DEFAULT '{}'::jsonb,
  "created_at" timestamp    NOT NULL DEFAULT now(),
  "updated_at" timestamp    NOT NULL DEFAULT now(),
  CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);

-- 4b. users (depends on: organizations)
CREATE TABLE "users" (
  "id"            uuid        PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email"         varchar(255),
  "name"          varchar(255) NOT NULL,
  "phone"         varchar(20),
  "password_hash" varchar(255),
  "role"          "user_role"  NOT NULL DEFAULT 'student',
  "avatar_url"    varchar(500),
  "org_id"        uuid,
  "created_at"    timestamp    NOT NULL DEFAULT now(),
  "updated_at"    timestamp    NOT NULL DEFAULT now(),
  CONSTRAINT "users_email_unique" UNIQUE("email"),
  CONSTRAINT "users_phone_unique" UNIQUE("phone")
);

-- 4c. exams (depends on: organizations)
CREATE TABLE "exams" (
  "id"         uuid        PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name"       varchar(255) NOT NULL,
  "category"   varchar(100) NOT NULL,
  "subjects"   jsonb        NOT NULL DEFAULT '[]'::jsonb,
  "is_active"  boolean      NOT NULL DEFAULT true,
  "metadata"   jsonb        DEFAULT '{}'::jsonb,
  "org_id"     uuid,
  "created_at" timestamp    NOT NULL DEFAULT now(),
  "updated_at" timestamp    NOT NULL DEFAULT now()
);

-- 4d. questions (depends on: exams, organizations)
CREATE TABLE "questions" (
  "id"           uuid           PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "exam_id"      uuid           NOT NULL,
  "type"         "question_type" NOT NULL DEFAULT 'mcq',
  "content"      jsonb          NOT NULL,
  "subject"      varchar(255)   NOT NULL,
  "topic"        varchar(255),
  "difficulty"   "difficulty"   NOT NULL DEFAULT 'medium',
  "source"       varchar(500),
  "translations" jsonb,
  "embedding"    vector(1536),
  "metadata"     jsonb          DEFAULT '{}'::jsonb,
  "org_id"       uuid,
  "created_at"   timestamp      NOT NULL DEFAULT now(),
  "updated_at"   timestamp      NOT NULL DEFAULT now()
);

-- 4e. question_versions (depends on: questions, users)
CREATE TABLE "question_versions" (
  "id"          uuid          PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "question_id" uuid          NOT NULL,
  "content"     jsonb         NOT NULL,
  "changed_by"  uuid,
  "change_type" "change_type" NOT NULL DEFAULT 'updated',
  "created_at"  timestamp     NOT NULL DEFAULT now(),
  "updated_at"  timestamp     NOT NULL DEFAULT now()
);

-- 4f. exam_sessions (depends on: users, exams, organizations)
CREATE TABLE "exam_sessions" (
  "id"                 uuid      PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id"            uuid      NOT NULL,
  "exam_id"            uuid      NOT NULL,
  "questions"          jsonb     NOT NULL,
  "answers"            jsonb     DEFAULT '{}'::jsonb,
  "score"              real,
  "total_questions"    integer   NOT NULL,
  "time_taken_seconds" integer,
  "metadata"           jsonb     DEFAULT '{}'::jsonb,
  "started_at"         timestamp NOT NULL DEFAULT now(),
  "completed_at"       timestamp,
  "org_id"             uuid,
  "created_at"         timestamp NOT NULL DEFAULT now(),
  "updated_at"         timestamp NOT NULL DEFAULT now()
);

-- 4g. scrape_sources (depends on: exams, organizations)
CREATE TABLE "scrape_sources" (
  "id"              uuid           PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name"            varchar(255)   NOT NULL,
  "url"             varchar(1000)  NOT NULL,
  "status"          "scrape_status" NOT NULL DEFAULT 'pending',
  "last_scraped_at" timestamp,
  "questions_count" integer        NOT NULL DEFAULT 0,
  "config"          jsonb          DEFAULT '{}'::jsonb,
  "exam_id"         uuid,
  "org_id"          uuid,
  "created_at"      timestamp      NOT NULL DEFAULT now(),
  "updated_at"      timestamp      NOT NULL DEFAULT now()
);

-- 4h. ai_usage_logs (depends on: users, exams)
CREATE TABLE "ai_usage_logs" (
  "id"                 uuid      PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id"            uuid,
  "exam_id"            uuid,
  "provider"           varchar(50)  NOT NULL,
  "model"              varchar(100) NOT NULL,
  "feature"            varchar(100) NOT NULL,
  "input_tokens"       integer      NOT NULL,
  "output_tokens"      integer      NOT NULL,
  "latency_ms"         integer      NOT NULL,
  "estimated_cost_usd" real         NOT NULL,
  "created_at"         timestamp    NOT NULL DEFAULT now(),
  "updated_at"         timestamp    NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 5. Foreign Keys
-- ---------------------------------------------------------------------------

-- users → organizations
ALTER TABLE "users"
  ADD CONSTRAINT "users_org_id_organizations_id_fk"
  FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id")
  ON DELETE no action ON UPDATE no action;

-- exams → organizations
ALTER TABLE "exams"
  ADD CONSTRAINT "exams_org_id_organizations_id_fk"
  FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id")
  ON DELETE no action ON UPDATE no action;

-- questions → exams
ALTER TABLE "questions"
  ADD CONSTRAINT "questions_exam_id_exams_id_fk"
  FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id")
  ON DELETE no action ON UPDATE no action;

-- questions → organizations
ALTER TABLE "questions"
  ADD CONSTRAINT "questions_org_id_organizations_id_fk"
  FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id")
  ON DELETE no action ON UPDATE no action;

-- question_versions → questions (CASCADE delete)
ALTER TABLE "question_versions"
  ADD CONSTRAINT "question_versions_question_id_questions_id_fk"
  FOREIGN KEY ("question_id") REFERENCES "public"."questions"("id")
  ON DELETE cascade ON UPDATE no action;

-- question_versions → users
ALTER TABLE "question_versions"
  ADD CONSTRAINT "question_versions_changed_by_users_id_fk"
  FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id")
  ON DELETE no action ON UPDATE no action;

-- exam_sessions → users
ALTER TABLE "exam_sessions"
  ADD CONSTRAINT "exam_sessions_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE no action ON UPDATE no action;

-- exam_sessions → exams
ALTER TABLE "exam_sessions"
  ADD CONSTRAINT "exam_sessions_exam_id_exams_id_fk"
  FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id")
  ON DELETE no action ON UPDATE no action;

-- exam_sessions → organizations
ALTER TABLE "exam_sessions"
  ADD CONSTRAINT "exam_sessions_org_id_organizations_id_fk"
  FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id")
  ON DELETE no action ON UPDATE no action;

-- scrape_sources → exams
ALTER TABLE "scrape_sources"
  ADD CONSTRAINT "scrape_sources_exam_id_exams_id_fk"
  FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id")
  ON DELETE no action ON UPDATE no action;

-- scrape_sources → organizations
ALTER TABLE "scrape_sources"
  ADD CONSTRAINT "scrape_sources_org_id_organizations_id_fk"
  FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id")
  ON DELETE no action ON UPDATE no action;

-- ai_usage_logs → users
ALTER TABLE "ai_usage_logs"
  ADD CONSTRAINT "ai_usage_logs_user_id_users_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE no action ON UPDATE no action;

-- ai_usage_logs → exams
ALTER TABLE "ai_usage_logs"
  ADD CONSTRAINT "ai_usage_logs_exam_id_exams_id_fk"
  FOREIGN KEY ("exam_id") REFERENCES "public"."exams"("id")
  ON DELETE no action ON UPDATE no action;

-- ---------------------------------------------------------------------------
-- 6. Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX "question_versions_question_id_idx" ON "question_versions" USING btree ("question_id");
CREATE INDEX "questions_exam_id_idx"             ON "questions"          USING btree ("exam_id");
CREATE INDEX "questions_subject_idx"             ON "questions"          USING btree ("subject");
CREATE INDEX "questions_difficulty_idx"          ON "questions"          USING btree ("difficulty");

-- HNSW index for vector similarity search (cosine distance)
CREATE INDEX "questions_embedding_idx"           ON "questions"          USING hnsw ("embedding" vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- 7. Seed Data (optional — for local debugging)
-- ---------------------------------------------------------------------------

-- Default organization
INSERT INTO "organizations" ("id", "name", "slug", "plan", "settings") VALUES
  ('a0000000-0000-0000-0000-000000000001', 'ExamForge Dev Org', 'examforge-dev', 'enterprise', '{"maxUsers": 100}');

-- Default admin user (password: password123)
INSERT INTO "users" ("id", "name", "email", "phone", "password_hash", "role", "org_id") VALUES
  ('b0000000-0000-0000-0000-000000000001', 'Dev Admin', 'admin@examforge.dev', '+919999999999',
   crypt('password123', gen_salt('bf', 10)), 'superadmin', 'a0000000-0000-0000-0000-000000000001');

-- Sample exams
INSERT INTO "exams" ("id", "name", "category", "subjects", "org_id") VALUES
  ('c0000000-0000-0000-0000-000000000001', 'BPharm Assistant Professor 2025', 'bpharm_asst_prof', '["Pharmaceutics", "Pharmacology", "Pharmaceutical Chemistry", "Pharmacognosy"]'::jsonb, 'a0000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000002', 'GPAT 2025',                       'gpat',             '["Pharmaceutics", "Pharmacology", "Pharmaceutical Analysis"]'::jsonb,                   'a0000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000003', 'NEET 2025',                        'neet',             '["Physics", "Chemistry", "Biology"]'::jsonb,                                            'a0000000-0000-0000-0000-000000000001');

-- Sample questions for BPharm exam
INSERT INTO "questions" ("id", "exam_id", "type", "content", "subject", "topic", "difficulty", "source", "org_id") VALUES
  ('d0000000-0000-0000-0000-000000000001',
   'c0000000-0000-0000-0000-000000000001', 'mcq',
   '{"type":"mcq","question":"Which of the following is a natural polymer used in sustained release formulations?","options":["Eudragit","Guar gum","Polycarbonate","Nylon"],"answer":1,"explanation":"Guar gum is a natural polysaccharide polymer widely used in sustained release formulations due to its gel-forming properties."}'::jsonb,
   'Pharmaceutics', 'Sustained Release', 'medium', 'PCI Practice Paper 2024', 'a0000000-0000-0000-0000-000000000001'),

  ('d0000000-0000-0000-0000-000000000002',
   'c0000000-0000-0000-0000-000000000001', 'mcq',
   '{"type":"mcq","question":"Which enzyme is responsible for the conversion of angiotensin I to angiotensin II?","options":["Renin","ACE","Pepsin","Trypsin"],"answer":1,"explanation":"Angiotensin Converting Enzyme (ACE) converts angiotensin I to angiotensin II, a potent vasoconstrictor."}'::jsonb,
   'Pharmacology', 'Cardiovascular', 'easy', 'PCI Practice Paper 2024', 'a0000000-0000-0000-0000-000000000001'),

  ('d0000000-0000-0000-0000-000000000003',
   'c0000000-0000-0000-0000-000000000001', 'mcq',
   '{"type":"mcq","question":"The BCS classification system classifies drugs based on:","options":["Solubility and molecular weight","Solubility and permeability","Permeability and stability","Stability and solubility"],"answer":1,"explanation":"The Biopharmaceutics Classification System (BCS) classifies drugs into four classes based on their aqueous solubility and intestinal permeability."}'::jsonb,
   'Pharmaceutics', 'Biopharmaceutics', 'medium', 'GPAT Previous Year', 'a0000000-0000-0000-0000-000000000001'),

  ('d0000000-0000-0000-0000-000000000004',
   'c0000000-0000-0000-0000-000000000001', 'mcq',
   '{"type":"mcq","question":"Which of the following is a prodrug?","options":["Aspirin","Enalapril","Ibuprofen","Paracetamol"],"answer":1,"explanation":"Enalapril is a prodrug that is converted to its active form enalaprilat by esterases in the liver."}'::jsonb,
   'Pharmacology', 'Prodrugs', 'easy', 'GPAT Previous Year', 'a0000000-0000-0000-0000-000000000001'),

  ('d0000000-0000-0000-0000-000000000005',
   'c0000000-0000-0000-0000-000000000001', 'mcq',
   '{"type":"mcq","question":"Which test is used to determine the hardness of tablets?","options":["Friability tester","Monsanto hardness tester","Dissolution apparatus","Disintegration tester"],"answer":1,"explanation":"The Monsanto hardness tester measures the force required to break a tablet by diametral compression."}'::jsonb,
   'Pharmaceutics', 'Tablet Evaluation', 'easy', 'PCI Practice Paper 2024', 'a0000000-0000-0000-0000-000000000001'),

  ('d0000000-0000-0000-0000-000000000006',
   'c0000000-0000-0000-0000-000000000001', 'true_false',
   '{"type":"true_false","question":"Heparin is administered orally for anticoagulation therapy.","answer":false,"explanation":"Heparin is not absorbed orally and must be administered parenterally (IV or subcutaneous) due to its large molecular weight and negative charge."}'::jsonb,
   'Pharmacology', 'Anticoagulants', 'easy', 'PCI Practice Paper 2024', 'a0000000-0000-0000-0000-000000000001'),

  ('d0000000-0000-0000-0000-000000000007',
   'c0000000-0000-0000-0000-000000000001', 'mcq',
   '{"type":"mcq","question":"Which alkaloid is obtained from Cinchona bark?","options":["Morphine","Quinine","Atropine","Caffeine"],"answer":1,"explanation":"Quinine is the principal alkaloid obtained from the bark of Cinchona species and is used as an antimalarial agent."}'::jsonb,
   'Pharmacognosy', 'Alkaloids', 'medium', 'BPharm Exam 2023', 'a0000000-0000-0000-0000-000000000001'),

  ('d0000000-0000-0000-0000-000000000008',
   'c0000000-0000-0000-0000-000000000001', 'mcq',
   '{"type":"mcq","question":"The Henderson-Hasselbalch equation is used to calculate:","options":["Reaction rate","pH of buffer solutions","Partition coefficient","Osmotic pressure"],"answer":1,"explanation":"The Henderson-Hasselbalch equation relates the pH of a solution to the pKa and the ratio of conjugate base to acid concentrations."}'::jsonb,
   'Pharmaceutical Chemistry', 'Physical Chemistry', 'medium', 'BPharm Exam 2023', 'a0000000-0000-0000-0000-000000000001'),

  ('d0000000-0000-0000-0000-000000000009',
   'c0000000-0000-0000-0000-000000000001', 'mcq',
   '{"type":"mcq","question":"Zero-order kinetics means the rate of drug elimination is:","options":["Proportional to drug concentration","Independent of drug concentration","Exponentially decreasing","Logarithmically increasing"],"answer":1,"explanation":"In zero-order kinetics, a constant amount of drug is eliminated per unit time regardless of the plasma concentration."}'::jsonb,
   'Pharmaceutics', 'Pharmacokinetics', 'hard', 'GPAT Previous Year', 'a0000000-0000-0000-0000-000000000001'),

  ('d0000000-0000-0000-0000-000000000010',
   'c0000000-0000-0000-0000-000000000001', 'mcq',
   '{"type":"mcq","question":"Which of the following is a calcium channel blocker?","options":["Propranolol","Amlodipine","Losartan","Captopril"],"answer":1,"explanation":"Amlodipine is a dihydropyridine calcium channel blocker used in the treatment of hypertension and angina."}'::jsonb,
   'Pharmacology', 'Cardiovascular', 'easy', 'BPharm Exam 2023', 'a0000000-0000-0000-0000-000000000001');

-- Version record for the first sample question
INSERT INTO "question_versions" ("question_id", "content", "changed_by", "change_type") VALUES
  ('d0000000-0000-0000-0000-000000000001',
   '{"type":"mcq","question":"Which of the following is a natural polymer used in sustained release formulations?","options":["Eudragit","Guar gum","Polycarbonate","Nylon"],"answer":1,"explanation":"Guar gum is a natural polysaccharide polymer widely used in sustained release formulations due to its gel-forming properties."}'::jsonb,
   'b0000000-0000-0000-0000-000000000001',
   'created');

-- Sample scrape source
INSERT INTO "scrape_sources" ("name", "url", "status", "exam_id", "org_id") VALUES
  ('PCI Previous Year Papers', 'https://www.pci.nic.in/previous-papers', 'pending', 'c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001');

-- ---------------------------------------------------------------------------
-- 8. Debug Helpers
-- ---------------------------------------------------------------------------

-- Quick count of all tables
DO $$
DECLARE
  r RECORD;
BEGIN
  RAISE NOTICE '--- Table Row Counts ---';
  FOR r IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  LOOP
    EXECUTE format('SELECT count(*) FROM %I', r.tablename) INTO r;
  END LOOP;
END $$;

-- View all tables
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;

-- View all custom enums
SELECT t.typname AS enum_name, e.enumlabel AS enum_value
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public'
ORDER BY t.typname, e.enumsortorder;

-- View all foreign keys
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name   AS foreign_table,
  ccu.column_name  AS foreign_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
ORDER BY tc.table_name;

-- View all indexes
SELECT
  indexname,
  tablename,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- =============================================================================
-- CONNECTION STRING for .env:
-- DATABASE_URL=postgresql://ensate_user:Talipot@123@localhost:5432/examforge_dev
-- =============================================================================
