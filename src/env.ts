import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  // Optional: migrations, seeds and the digest use it; falls back to DATABASE_URL.
  DATABASE_ADMIN_URL: z
    .string()
    .url()
    .optional()
    .transform((v) => v || undefined),
  // Role the app's own queries run as, so row-level security applies even when
  // DATABASE_URL logs in as the database owner.
  DATABASE_APP_ROLE: z
    .string()
    .regex(/^[a-z_][a-z0-9_]*$/)
    .default("app_user"),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url().default("http://localhost:3000"),
  STUDENT_ID_PEPPER: z.string().min(1),
  S3_ENDPOINT: z.string().default("localhost"),
  S3_PORT: z.coerce.number().default(9000),
  S3_USE_SSL: z.stringbool().default(false),
  S3_ACCESS_KEY: z.string().default("minioadmin"),
  S3_SECRET_KEY: z.string().default("minioadmin"),
  S3_BUCKET: z.string().default("alumni"),
  SMTP_URL: z
    .string()
    .optional()
    .transform((v) => v || undefined),
  PLATFORM_ADMIN_EMAILS: z.string().default(""),
  // When set, claiming the first super admin at /admin also needs this token.
  SETUP_TOKEN: z
    .string()
    .optional()
    .transform((v) => v || undefined),
  MAIL_FROM: z.string().default("Alumni Connect <no-reply@alumni.local>"),
  // Bearer secret for POST /api/digest/run (external scheduler trigger).
  // Unset = route returns 404.
  DIGEST_SECRET: z
    .string()
    .optional()
    .transform((v) => v || undefined),
});

export const env = schema.parse(process.env);
/** Connection for owner-level work (migrations, seeds, cross-tenant jobs). */
export const adminUrl = env.DATABASE_ADMIN_URL ?? env.DATABASE_URL;
