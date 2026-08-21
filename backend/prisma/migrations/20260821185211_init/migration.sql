-- CreateEnum
CREATE TYPE "SkillLevel" AS ENUM ('beginner', 'intermediate', 'advanced');

-- CreateEnum
CREATE TYPE "RiskTier" AS ENUM ('healthy', 'watch', 'atrisk');

-- CreateEnum
CREATE TYPE "ConceptType" AS ENUM ('conceptual', 'practical');

-- CreateEnum
CREATE TYPE "RoadmapItemStatus" AS ENUM ('locked', 'current', 'completed');

-- CreateEnum
CREATE TYPE "UserLevelStatus" AS ENUM ('locked', 'unlocked', 'completed');

-- CreateEnum
CREATE TYPE "Verdict" AS ENUM ('accepted', 'wrong_answer', 'compile_error', 'runtime_error', 'timeout');

-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "full_name" TEXT,
    "college" TEXT,
    "branch" TEXT,
    "year" INTEGER,
    "skill_level" "SkillLevel" NOT NULL DEFAULT 'beginner',
    "hours_per_week" INTEGER NOT NULL DEFAULT 5,
    "goal_text" TEXT,
    "goal_category" TEXT,
    "total_xp" INTEGER NOT NULL DEFAULT 0,
    "current_streak" INTEGER NOT NULL DEFAULT 0,
    "best_streak" INTEGER NOT NULL DEFAULT 0,
    "last_active_date" DATE,
    "onboarding_step" INTEGER NOT NULL DEFAULT 0,
    "risk_tier" "RiskTier" NOT NULL DEFAULT 'healthy',
    "is_admin" BOOLEAN NOT NULL DEFAULT false,
    "consent_version" TEXT,
    "consent_given_at" TIMESTAMP(3),
    "withdrawn_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_target_companies" (
    "user_id" UUID NOT NULL,
    "company_id" TEXT NOT NULL,

    CONSTRAINT "user_target_companies_pkey" PRIMARY KEY ("user_id","company_id")
);

-- CreateTable
CREATE TABLE "skills" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "concept_type" "ConceptType" NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "estimated_minutes" INTEGER NOT NULL DEFAULT 60,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_prerequisites" (
    "skill_id" TEXT NOT NULL,
    "prereq_id" TEXT NOT NULL,

    CONSTRAINT "skill_prerequisites_pkey" PRIMARY KEY ("skill_id","prereq_id")
);

-- CreateTable
CREATE TABLE "goal_profiles" (
    "goal_category" TEXT NOT NULL,
    "skill_tag" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,

    CONSTRAINT "goal_profiles_pkey" PRIMARY KEY ("goal_category","skill_tag")
);

-- CreateTable
CREATE TABLE "levels" (
    "id" TEXT NOT NULL,
    "skill_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "difficulty" INTEGER NOT NULL DEFAULT 1,
    "statement_md" TEXT NOT NULL,
    "starter_code" TEXT NOT NULL,
    "reference_solution" TEXT,
    "hints" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "xp_reward" INTEGER NOT NULL DEFAULT 50,
    "time_limit_ms" INTEGER NOT NULL DEFAULT 5000,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "order_in_skill" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_cases" (
    "id" SERIAL NOT NULL,
    "level_id" TEXT NOT NULL,
    "stdin" TEXT NOT NULL DEFAULT '',
    "expected_output" TEXT NOT NULL,
    "is_hidden" BOOLEAN NOT NULL DEFAULT false,
    "weight" INTEGER NOT NULL DEFAULT 1,
    "ordinal" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "test_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roadmaps" (
    "id" SERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "params" JSONB,

    CONSTRAINT "roadmaps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roadmap_items" (
    "id" SERIAL NOT NULL,
    "roadmap_id" INTEGER NOT NULL,
    "skill_id" TEXT NOT NULL,
    "week_number" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "status" "RoadmapItemStatus" NOT NULL DEFAULT 'locked',

    CONSTRAINT "roadmap_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_levels" (
    "user_id" UUID NOT NULL,
    "level_id" TEXT NOT NULL,
    "status" "UserLevelStatus" NOT NULL DEFAULT 'locked',
    "best_pass_ratio" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hints_used" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "user_levels_pkey" PRIMARY KEY ("user_id","level_id")
);

-- CreateTable
CREATE TABLE "submissions" (
    "id" SERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "level_id" TEXT NOT NULL,
    "source_code" TEXT,
    "pass_ratio" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "verdict" "Verdict" NOT NULL,
    "runtime_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" SERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "badges" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "icon" TEXT,
    "criteria" TEXT,

    CONSTRAINT "badges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_badges" (
    "user_id" UUID NOT NULL,
    "badge_id" TEXT NOT NULL,
    "earned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_badges_pkey" PRIMARY KEY ("user_id","badge_id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logo" TEXT,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_role_profiles" (
    "id" SERIAL NOT NULL,
    "company_id" TEXT NOT NULL,
    "role_title" TEXT NOT NULL,
    "location" TEXT,
    "source_url" TEXT NOT NULL,
    "collected_on" DATE NOT NULL,
    "profile_version" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "company_role_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_skills" (
    "profile_id" INTEGER NOT NULL,
    "skill_id" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "jd_phrase" TEXT,
    "is_tracked" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "company_skills_pkey" PRIMARY KEY ("profile_id","skill_id")
);

-- CreateTable
CREATE TABLE "dropout_scores" (
    "id" SERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "probability" DOUBLE PRECISION NOT NULL,
    "tier" "RiskTier" NOT NULL,
    "features" JSONB NOT NULL,
    "model_version" TEXT NOT NULL,
    "feature_set_version" TEXT NOT NULL,
    "threshold_version" TEXT NOT NULL,
    "observation_window_start" DATE NOT NULL,
    "observation_window_end" DATE NOT NULL,
    "prediction_horizon_days" INTEGER NOT NULL,
    "scored_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dropout_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "placement_scores" (
    "id" SERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "profile_id" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "missing_tracked_skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "missing_external_skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "placement_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_attempts" (
    "id" SERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "question_id" TEXT NOT NULL,
    "question_version" INTEGER NOT NULL,
    "topic_skill_id" TEXT NOT NULL,
    "chosen_option" INTEGER NOT NULL,
    "is_correct" BOOLEAN NOT NULL,
    "answered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quiz_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nudges" (
    "id" SERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "dropout_score_id" INTEGER,
    "variant" TEXT NOT NULL,
    "suggested_level_id" TEXT,
    "shown_at" TIMESTAMP(3),
    "clicked_at" TIMESTAMP(3),
    "dismissed_at" TIMESTAMP(3),

    CONSTRAINT "nudges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "test_cases_level_id_ordinal_key" ON "test_cases"("level_id", "ordinal");

-- CreateIndex
CREATE UNIQUE INDEX "roadmap_items_roadmap_id_skill_id_key" ON "roadmap_items"("roadmap_id", "skill_id");

-- CreateIndex
CREATE UNIQUE INDEX "roadmap_items_roadmap_id_week_number_position_key" ON "roadmap_items"("roadmap_id", "week_number", "position");

-- CreateIndex
CREATE INDEX "user_levels_user_id_status_idx" ON "user_levels"("user_id", "status");

-- CreateIndex
CREATE INDEX "submissions_user_id_created_at_idx" ON "submissions"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "submissions_level_id_idx" ON "submissions"("level_id");

-- CreateIndex
CREATE INDEX "events_user_id_ts_idx" ON "events"("user_id", "ts");

-- CreateIndex
CREATE UNIQUE INDEX "company_role_profiles_company_id_role_title_profile_version_key" ON "company_role_profiles"("company_id", "role_title", "profile_version");

-- CreateIndex
CREATE UNIQUE INDEX "dropout_scores_user_id_observation_window_end_model_version_key" ON "dropout_scores"("user_id", "observation_window_end", "model_version");

-- CreateIndex
CREATE INDEX "placement_scores_user_id_profile_id_computed_at_idx" ON "placement_scores"("user_id", "profile_id", "computed_at");

-- AddForeignKey
ALTER TABLE "user_target_companies" ADD CONSTRAINT "user_target_companies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_target_companies" ADD CONSTRAINT "user_target_companies_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_prerequisites" ADD CONSTRAINT "skill_prerequisites_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_prerequisites" ADD CONSTRAINT "skill_prerequisites_prereq_id_fkey" FOREIGN KEY ("prereq_id") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "levels" ADD CONSTRAINT "levels_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "levels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roadmaps" ADD CONSTRAINT "roadmaps_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roadmap_items" ADD CONSTRAINT "roadmap_items_roadmap_id_fkey" FOREIGN KEY ("roadmap_id") REFERENCES "roadmaps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roadmap_items" ADD CONSTRAINT "roadmap_items_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_levels" ADD CONSTRAINT "user_levels_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_levels" ADD CONSTRAINT "user_levels_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "levels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "levels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_badge_id_fkey" FOREIGN KEY ("badge_id") REFERENCES "badges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_role_profiles" ADD CONSTRAINT "company_role_profiles_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_skills" ADD CONSTRAINT "company_skills_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "company_role_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_skills" ADD CONSTRAINT "company_skills_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dropout_scores" ADD CONSTRAINT "dropout_scores_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placement_scores" ADD CONSTRAINT "placement_scores_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "placement_scores" ADD CONSTRAINT "placement_scores_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "company_role_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_topic_skill_id_fkey" FOREIGN KEY ("topic_skill_id") REFERENCES "skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nudges" ADD CONSTRAINT "nudges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nudges" ADD CONSTRAINT "nudges_dropout_score_id_fkey" FOREIGN KEY ("dropout_score_id") REFERENCES "dropout_scores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nudges" ADD CONSTRAINT "nudges_suggested_level_id_fkey" FOREIGN KEY ("suggested_level_id") REFERENCES "levels"("id") ON DELETE SET NULL ON UPDATE CASCADE;
