CREATE TYPE "TelegramMessageDeleteStatus" AS ENUM ('NONE', 'PENDING', 'DELETED', 'FAILED');

ALTER TABLE "TelegramDispatch"
  ADD COLUMN "deleteRequestedAt" TIMESTAMP(3),
  ADD COLUMN "deletedForEveryoneAt" TIMESTAMP(3),
  ADD COLUMN "deleteTotalCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "deleteSuccessCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "deleteFailedCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "TelegramDelivery"
  ADD COLUMN "deleteStatus" "TelegramMessageDeleteStatus" NOT NULL DEFAULT 'NONE',
  ADD COLUMN "deleteRequestedAt" TIMESTAMP(3),
  ADD COLUMN "deletedForEveryoneAt" TIMESTAMP(3),
  ADD COLUMN "deleteErrorCode" TEXT;

CREATE INDEX "TelegramDelivery_deleteStatus_updatedAt_idx"
  ON "TelegramDelivery"("deleteStatus", "updatedAt");
