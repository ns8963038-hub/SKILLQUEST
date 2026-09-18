-- UAT readiness (Phase 3): leaderboard privacy + usability survey storage.

-- Students can hide themselves from the leaderboard (they still see their own rank).
ALTER TABLE "profiles" ADD COLUMN "leaderboard_opt_out" BOOLEAN NOT NULL DEFAULT false;

-- One System Usability Scale (SUS) response per submission, plus the engagement
-- rating and would-recommend answer the PRD's success metrics require.
CREATE TABLE "survey_responses" (
    "id" SERIAL NOT NULL,
    "user_id" UUID NOT NULL,
    "instrument" TEXT NOT NULL DEFAULT 'sus-v1',
    "answers" JSONB NOT NULL,
    "sus_score" DOUBLE PRECISION NOT NULL,
    "engagement" INTEGER NOT NULL,
    "would_recommend" BOOLEAN NOT NULL,
    "comments" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "survey_responses_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "survey_responses_sus_range" CHECK ("sus_score" >= 0 AND "sus_score" <= 100),
    CONSTRAINT "survey_responses_engagement_range" CHECK ("engagement" BETWEEN 1 AND 5)
);

CREATE INDEX "survey_responses_user_id_idx" ON "survey_responses"("user_id");

ALTER TABLE "survey_responses" ADD CONSTRAINT "survey_responses_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Row Level Security ON with no policies, like every other table: the browser's
-- anon key can read nothing; only the Web API's own database role can.
-- (Also closes the gap on skill_mastery, created in the previous migration.)
ALTER TABLE "survey_responses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "skill_mastery" ENABLE ROW LEVEL SECURITY;
