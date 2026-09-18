-- CreateTable: per-(student, skill) Bayesian Knowledge Tracing mastery estimate.
CREATE TABLE "skill_mastery" (
    "user_id" UUID NOT NULL,
    "skill_id" TEXT NOT NULL,
    "p_mastery" DOUBLE PRECISION NOT NULL DEFAULT 0.2,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "correct" INTEGER NOT NULL DEFAULT 0,
    "last_result" BOOLEAN,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "skill_mastery_pkey" PRIMARY KEY ("user_id","skill_id")
);

-- Index for looking up all of a user's mastery rows.
CREATE INDEX "skill_mastery_user_id_idx" ON "skill_mastery"("user_id");

-- Foreign keys.
ALTER TABLE "skill_mastery" ADD CONSTRAINT "skill_mastery_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "skill_mastery" ADD CONSTRAINT "skill_mastery_skill_id_fkey"
    FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;
