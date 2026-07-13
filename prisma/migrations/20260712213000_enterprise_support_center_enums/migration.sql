-- Add canonical support workflow values in their own committed migration so
-- PostgreSQL can safely use them in the following data migration.
ALTER TYPE "SupportTicketStatus" ADD VALUE IF NOT EXISTS 'WAITING_FOR_USER';
ALTER TYPE "SupportTicketStatus" ADD VALUE IF NOT EXISTS 'WAITING_FOR_ADMIN';
ALTER TYPE "SupportTicketPriority" ADD VALUE IF NOT EXISTS 'NORMAL';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SupportOutboxStatus') THEN
    CREATE TYPE "SupportOutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'DELIVERED', 'FAILED');
  END IF;
END $$;
