-- Role requirements SkillQuest doesn't teach (shown as external/future gaps).
ALTER TABLE "company_role_profiles"
  ADD COLUMN "external_requirements" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
