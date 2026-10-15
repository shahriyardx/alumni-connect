import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins/email-otp";
import { nextCookies, toNextJsHandler } from "better-auth/next-js";
import { db } from "./db";
import * as schema from "./schema";
export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: { enabled: true, requireEmailVerification: true, minPasswordLength: 8 },
  user: { additionalFields: {
    role: { type: ["student", "alumni", "admin"], required: false, defaultValue: "student", input: false },
    gradYear: { type: "number", required: false },
    department: { type: "string", required: false },
  } },
  rateLimit: { enabled: true, storage: "database", window: 60, max: 100, customRules: { "/email-otp/send-verification-otp": { window: 60, max: 3 } } },
  databaseHooks: { user: { create: {
    before: async (user) => ({ data: { ...user, email: user.email.toLowerCase() } }),
    after: async (user) => { console.log(user.id); },
  } } },
  plugins: [
    emailOTP({
      overrideDefaultEmailVerification: true,
      sendVerificationOnSignUp: true,
      async sendVerificationOTP({ email, otp, type }) {
        if (type === "email-verification") {} else if (type === "forget-password") {}
        void email; void otp;
      },
    }),
    nextCookies(),
  ],
});
export const { GET, POST } = toNextJsHandler(auth);
async function demo(headers: Headers) {
  const r = await auth.api.signUpEmail({ body: { name: "A", email: "a@b.c", password: "password1", gradYear: 2020 } });
  r.user.gradYear; r.token;
  await auth.api.sendVerificationOTP({ body: { email: "a@b.c", type: "email-verification" } });
  const v = await auth.api.verifyEmailOTP({ body: { email: "a@b.c", otp: "123456" } });
  v.status;
  await auth.api.resetPasswordEmailOTP({ body: { email: "a@b.c", otp: "1", password: "x" } });
  const s = await auth.api.getSession({ headers });
  s?.user.role; s?.session.id;
  const { headers: h, response } = await auth.api.signInEmail({ body: { email: "a", password: "b" }, returnHeaders: true });
  void h; void response;
}
void demo;
