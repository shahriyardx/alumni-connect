import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url().default("http://localhost:3000"),
  STUDENT_ID_PEPPER: z.string().min(1),
  S3_ENDPOINT: z.string().default("localhost"),
  S3_PORT: z.coerce.number().default(9000),
  S3_USE_SSL: z.stringbool().default(false),
  S3_ACCESS_KEY: z.string().default("minioadmin"),
  S3_SECRET_KEY: z.string().default("minioadmin"),
  S3_BUCKET: z.string().default("alumni"),
  // Mailroom instance; both unset = mail is printed to the server log.
  MAILROOM_BASE_URL: z
    .string()
    .url()
    .optional()
    .transform((v) => v || undefined),
  MAILROOM_API_KEY: z
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
