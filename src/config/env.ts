import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  AUTH_SECRET: z.string().min(32),
  SESSION_ENCRYPTION_KEY: z.string().min(32),
  PASSWORD_PEPPER: z.string().min(32),
  FIELD_ENCRYPTION_KEY_V1: z.string().min(43),
  FIELD_ENCRYPTION_ACTIVE_VERSION: z.string().default("v1"),
  REDIS_URL: z.string().url(),
  WEBHOOK_SIGNING_SECRET: z.string().min(32),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
});
export function getServerEnv() { return schema.parse(process.env); }
