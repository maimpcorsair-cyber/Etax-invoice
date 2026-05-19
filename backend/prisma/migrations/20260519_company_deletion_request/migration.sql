-- PDPA Section 33 — right to erasure. Owner can request deletion of the
-- company workspace. Tax records must be retained 5y per Revenue Code, so
-- the retentionLoop purges this row only after hardDeleteScheduledAt.
ALTER TABLE "companies"
  ADD COLUMN "deletionRequestedAt"   TIMESTAMP(3),
  ADD COLUMN "deletionRequestedBy"   TEXT,
  ADD COLUMN "hardDeleteScheduledAt" TIMESTAMP(3);
