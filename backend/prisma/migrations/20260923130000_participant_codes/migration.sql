-- Stable participant codes (Backend Schema §5.1).
--
-- Codes (P01, P02…) used to be recomputed from sign-up order on every export,
-- so deleting an account, or a teammate becoming admin after signing up, shifted
-- every later student's code: CSVs exported on different days wouldn't line up.
-- Now each student's code is stored, assigned once when they agree to take part.

ALTER TABLE "profiles" ADD COLUMN "participant_code" TEXT;
CREATE UNIQUE INDEX "profiles_participant_code_key" ON "profiles"("participant_code");

-- New codes come from a sequence, so two students agreeing at the same moment
-- can never get the same code.
CREATE SEQUENCE "participant_code_seq";

-- Existing accounts keep exactly the code the export has been giving them:
-- non-admin accounts numbered in sign-up order. (lpad only pads; its width grows
-- past 2 digits so P100 is never cut to P10.)
WITH numbered AS (
  SELECT "id", row_number() OVER (ORDER BY "created_at", "id") AS n
  FROM "profiles"
  WHERE NOT "is_admin"
)
UPDATE "profiles" p
SET "participant_code" = 'P' || lpad(numbered.n::text, greatest(2, length(numbered.n::text)), '0')
FROM numbered
WHERE p."id" = numbered."id";

-- Continue after the last backfilled code (or start at 1 on an empty table).
SELECT setval(
  '"participant_code_seq"',
  greatest((SELECT count(*) FROM "profiles" WHERE NOT "is_admin"), 1),
  (SELECT count(*) > 0 FROM "profiles" WHERE NOT "is_admin")
);
