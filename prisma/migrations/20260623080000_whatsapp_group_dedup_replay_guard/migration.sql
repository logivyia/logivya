-- Historical migration 20260623090000 used an ON COMMIT DROP temp table while
-- Prisma executes migration statements transaction-by-transaction. On a fresh
-- database the temp relation disappears before the next statement. This empty
-- permanent fallback keeps clean database replays deterministic without
-- changing the checksum of the already-applied production migration.
CREATE TABLE IF NOT EXISTS "_WhatsAppGroupDuplicateKeepers" (
  "duplicateId" TEXT NOT NULL,
  "keepId" TEXT NOT NULL
);
