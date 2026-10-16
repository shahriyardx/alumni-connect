import { randomUUID } from "node:crypto";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { emailOTP } from "better-auth/plugins/email-otp";
import { and, eq, gt } from "drizzle-orm";
import { db, withTenant } from "@/db";
import * as schema from "@/db/schema";
import { env } from "@/env";
import { clientIp } from "./client-ip";
import { sendMail } from "./mail";
import { insertUniversity } from "./university";

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
      graduationYear: field("number"),
      batchNumber: field("number"),
      department: field("string"),
      title: field("string"),
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
        before: async (u, ctx) => {
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
          // Two different emails can each get a pending_signup row for the
          // same studentIdHash (pending_signup is keyed by email, not ID).
          // If a user with that hash already exists (e.g. the other
          // pending email finished sign-up first), refuse cleanly instead
          // of letting the unique constraint on user.student_id_hash throw
          // a raw 500.
          if (p.studentIdHash) {
            const [existingById] = await db
              .select({ id: schema.user.id })
              .from(schema.user)
              .where(eq(schema.user.studentIdHash, p.studentIdHash));
            if (existingById) return false;
          }
          let universityId = p.universityId;
          if (p.role === "OWNER" || p.applicationName) {
            // OWNER rows only ever create a *new* PENDING university from an
            // application — never ownership of an existing one.
            // TODO(W5): accept OWNER rows created from an OWNER invite here.
            if (!p.applicationName || p.role !== "OWNER") return false;
            const id = randomUUID();
            const name = p.applicationName;
            await withTenant(id, async (tx) => {
              await insertUniversity(tx, {
                id,
                name,
                website: p.applicationWebsite,
                status: "PENDING",
              });
              // Inline audit(): importing ../trpc here would be circular.
              await tx.insert(schema.auditLog).values({
                universityId: id,
                action: "university.apply",
                target: email,
                meta: { name, rep: u.name },
                ip: ctx?.headers ? clientIp(ctx.headers) : undefined,
              });
            });
            universityId = id;
          }
          if (!universityId) return false;
          return {
            data: {
              ...u,
              email,
              universityId,
              role: p.role,
              graduationYear: p.graduationYear,
              batchNumber: p.batchNumber,
              department: p.department,
              title: p.title,
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
