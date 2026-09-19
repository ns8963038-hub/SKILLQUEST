-- Learn mode (PRD F8): one interactive lesson per skill, played before its levels.

-- How far a student got in a skill's lesson.
CREATE TYPE "LessonStatus" AS ENUM ('started', 'completed', 'skipped');

-- The lesson content itself, seeded from content/lessons/<skill>.json. Held as
-- jsonb because the step list is authored content, not relational data — the
-- shape is validated by zod in the seed script and by content/build-lessons.mjs.
CREATE TABLE "lessons" (
    "skill_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL DEFAULT 5,
    "version" INTEGER NOT NULL DEFAULT 1,
    "content" JSONB NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lessons_pkey" PRIMARY KEY ("skill_id"),
    CONSTRAINT "lessons_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- One row per student per lesson. `answered` maps a step id to whether their
-- FIRST answer was right — first answers are the only ones that count as
-- evidence, so a retry can never inflate the mastery estimate.
CREATE TABLE "user_lessons" (
    "user_id" UUID NOT NULL,
    "skill_id" TEXT NOT NULL,
    "status" "LessonStatus" NOT NULL DEFAULT 'started',
    "answered" JSONB NOT NULL DEFAULT '{}',
    "fill_attempts" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "user_lessons_pkey" PRIMARY KEY ("user_id", "skill_id"),
    CONSTRAINT "user_lessons_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "user_lessons_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "user_lessons_user_id_idx" ON "user_lessons"("user_id");

-- Row Level Security ON with no policies, like every other table: the browser's
-- anon key can read nothing; only the Web API's own database role can.
ALTER TABLE "lessons" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_lessons" ENABLE ROW LEVEL SECURITY;
