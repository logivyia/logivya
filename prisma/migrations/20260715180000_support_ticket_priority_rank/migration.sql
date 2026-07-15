ALTER TABLE "SupportTicket"
  ADD COLUMN IF NOT EXISTS "priorityRank" INTEGER NOT NULL DEFAULT 2;

UPDATE "SupportTicket"
SET "priorityRank" = CASE "priority"::text
  WHEN 'LOW' THEN 1
  WHEN 'MEDIUM' THEN 2
  WHEN 'NORMAL' THEN 2
  WHEN 'HIGH' THEN 3
  WHEN 'URGENT' THEN 4
  ELSE 2
END;

CREATE INDEX IF NOT EXISTS "SupportTicket_priorityRank_lastMessageAt_id_idx"
  ON "SupportTicket"("priorityRank", "lastMessageAt", "id");
