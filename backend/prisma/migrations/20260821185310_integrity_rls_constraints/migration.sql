-- Things Prisma's schema language can't express, applied as raw SQL.
-- Documented in docs/05-BACKEND-SCHEMA.md and docs/notes/M0-foundations.md.

-- 1) Row Level Security: enable on every table with NO policies.
--    Our API connects as the table owner (postgres role), which bypasses RLS,
--    so the app keeps working. The anon/authenticated roles (the browser's
--    public key) get no policy => they can read nothing directly. This is the
--    protection that makes a leaked anon key harmless.
ALTER TABLE "profiles"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_target_companies"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "skills"                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "skill_prerequisites"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "goal_profiles"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "levels"                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "test_cases"              ENABLE ROW LEVEL SECURITY;
ALTER TABLE "roadmaps"                ENABLE ROW LEVEL SECURITY;
ALTER TABLE "roadmap_items"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_levels"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "submissions"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "events"                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "badges"                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_badges"             ENABLE ROW LEVEL SECURITY;
ALTER TABLE "companies"               ENABLE ROW LEVEL SECURITY;
ALTER TABLE "company_role_profiles"   ENABLE ROW LEVEL SECURITY;
ALTER TABLE "company_skills"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "dropout_scores"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "placement_scores"        ENABLE ROW LEVEL SECURITY;
ALTER TABLE "quiz_attempts"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE "nudges"                  ENABLE ROW LEVEL SECURITY;

-- 2) Numeric / range CHECK constraints (ratios in [0,1], score in [0,100], etc.)
ALTER TABLE "profiles"
  ADD CONSTRAINT "profiles_year_range"        CHECK ("year" IS NULL OR "year" BETWEEN 1 AND 4),
  ADD CONSTRAINT "profiles_hours_range"       CHECK ("hours_per_week" BETWEEN 1 AND 40),
  ADD CONSTRAINT "profiles_onboarding_range"  CHECK ("onboarding_step" BETWEEN 0 AND 5),
  ADD CONSTRAINT "profiles_xp_nonneg"         CHECK ("total_xp" >= 0),
  ADD CONSTRAINT "profiles_streak_nonneg"     CHECK ("current_streak" >= 0 AND "best_streak" >= 0);

ALTER TABLE "skills"
  ADD CONSTRAINT "skills_minutes_pos"         CHECK ("estimated_minutes" > 0);

ALTER TABLE "levels"
  ADD CONSTRAINT "levels_difficulty_range"    CHECK ("difficulty" BETWEEN 1 AND 5),
  ADD CONSTRAINT "levels_xp_nonneg"           CHECK ("xp_reward" >= 0),
  ADD CONSTRAINT "levels_timelimit_pos"       CHECK ("time_limit_ms" > 0);

ALTER TABLE "test_cases"
  ADD CONSTRAINT "test_cases_weight_pos"      CHECK ("weight" > 0);

ALTER TABLE "roadmap_items"
  ADD CONSTRAINT "roadmap_items_week_pos"     CHECK ("week_number" > 0);

ALTER TABLE "user_levels"
  ADD CONSTRAINT "user_levels_ratio_range"    CHECK ("best_pass_ratio" BETWEEN 0 AND 1),
  ADD CONSTRAINT "user_levels_nonneg"         CHECK ("hints_used" >= 0 AND "attempts" >= 0);

ALTER TABLE "submissions"
  ADD CONSTRAINT "submissions_ratio_range"    CHECK ("pass_ratio" BETWEEN 0 AND 1);

ALTER TABLE "goal_profiles"
  ADD CONSTRAINT "goal_profiles_weight_nonneg" CHECK ("weight" >= 0);

ALTER TABLE "company_skills"
  ADD CONSTRAINT "company_skills_weight_pos"  CHECK ("weight" > 0);

ALTER TABLE "dropout_scores"
  ADD CONSTRAINT "dropout_scores_prob_range"  CHECK ("probability" BETWEEN 0 AND 1),
  ADD CONSTRAINT "dropout_scores_horizon_pos" CHECK ("prediction_horizon_days" > 0);

ALTER TABLE "placement_scores"
  ADD CONSTRAINT "placement_scores_range"     CHECK ("score" BETWEEN 0 AND 100);

-- 3) A skill cannot be its own prerequisite.
ALTER TABLE "skill_prerequisites"
  ADD CONSTRAINT "no_self_prerequisite"       CHECK ("skill_id" <> "prereq_id");

-- 4) At most one ACTIVE roadmap per user (partial unique index).
CREATE UNIQUE INDEX "one_active_roadmap_per_user"
  ON "roadmaps" ("user_id") WHERE "is_active";

-- 5) Link profiles to Supabase's auth.users. Prisma doesn't manage the auth
--    schema, so the FK is added here. Deleting the auth user cascades to the
--    profile (and everything owned by it).
--    Guarded by an existence check: Prisma validates every migration on a fresh
--    "shadow" database that has NO auth schema, so an unconditional statement
--    would fail there. This runs only where the auth schema exists (the real
--    Supabase database), and is skipped on the shadow DB.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'auth') THEN
    ALTER TABLE "profiles"
      ADD CONSTRAINT "profiles_id_fkey"
      FOREIGN KEY ("id") REFERENCES "auth"."users" ("id") ON DELETE CASCADE;
  END IF;
END $$;
