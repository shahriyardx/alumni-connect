import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { emailOTP } from "better-auth/plugins/email-otp";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { env } from "@/env";
import { sendMail } from "./mail";

const field = <T extends "string" | "number" | "date">(type: T) =>
  ({ type, required: false, input: false }) as const;

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 8,
  },
  emailVerification: { autoSignInAfterVerification: true },
  user: {
    additionalFields: {
      universityId: field("string"),
      role: { type: [...schema.ROLES], required: false, input: false },
      batchYear: field("number"),
      department: field("string"),
      studentIdHash: field("string"),
      bio: field("string"),
      avatarKey: field("string"),
      status: { type: [...schema.STATUSES], required: false, input: false },
      suspendedUntil: field("date"),
    },
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/email-otp/send-verification-otp": { window: 60, max: 3 },
      "/email-otp/request-password-reset": { window: 60, max: 3 },
    },
  },
  databaseHooks: {
    user: {
      create: {
        before: async (u) => {
          const email = u.email.toLowerCase();
          const [p] = await db
            .select()
            .from(schema.pendingSignup)
            .where(
              and(
                eq(schema.pendingSignup.email, email),
                gt(schema.pendingSignup.expiresAt, new Date()),
              ),
            );
          if (!p) return false;
          return {
            data: {
              ...u,
              email,
              universityId: p.universityId,
              role: p.role,
              batchYear: p.batchYear,
              department: p.department,
              studentIdHash: p.studentIdHash,
              status: p.status,
            },
          };
        },
        after: async (u) => {
          await db
            .delete(schema.pendingSignup)
            .where(eq(schema.pendingSignup.email, u.email));
        },
      },
    },
  },
  plugins: [
    emailOTP({
      overrideDefaultEmailVerification: true,
      sendVerificationOnSignUp: true,
      async sendVerificationOTP({ email, otp, type }) {
        const what =
          type === "forget-password"
            ? "reset your password"
            : "verify your email";
        await sendMail(
          email,
          `Your Alumni Connect code: ${otp}`,
          `Use this code to ${what}: ${otp}\nIt expires in 5 minutes.`,
        );
      },
    }),
    nextCookies(),
  ],
});
