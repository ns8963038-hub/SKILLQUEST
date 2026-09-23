-- The placement quiz moves to the server (PRD F1).
--
-- Until now the questions, their answers and the grading all lived in the
-- browser, and the browser told the API which topics the student had tested
-- out of — so anyone could skip any topic by editing one request. The
-- questions (with their answers) now live here, seeded from content/quiz.json,
-- and the API grades the quiz itself.
CREATE TABLE "quiz_questions" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "topic_skill_id" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "prompt" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "options" TEXT[],
    "correct_index" INTEGER NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "quiz_questions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "quiz_questions_topic_skill_id_fkey" FOREIGN KEY ("topic_skill_id") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Like every application table: row-level security on, no policies, so
-- Supabase's public REST API can't read the answers with the anon key. The
-- API connects as the table owner, which bypasses RLS.
ALTER TABLE "quiz_questions" ENABLE ROW LEVEL SECURITY;
