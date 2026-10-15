import { createAuthClient } from "better-auth/react";
import { emailOTPClient, inferAdditionalFields } from "better-auth/client/plugins";
import type { auth } from "./auth";
export const authClient = createAuthClient({ plugins: [emailOTPClient(), inferAdditionalFields<typeof auth>()] });
async function demo() {
  await authClient.signUp.email({ name: "a", email: "a", password: "b", gradYear: 2020 });
  await authClient.emailOtp.sendVerificationOtp({ email: "a", type: "email-verification" });
  await authClient.emailOtp.verifyEmail({ email: "a", otp: "1" });
  await authClient.emailOtp.requestPasswordReset({ email: "a" });
  await authClient.emailOtp.resetPassword({ email: "a", otp: "1", password: "x" });
  const { data, error } = await authClient.signIn.email({ email: "a", password: "b" });
  data?.user.role; error?.message;
}
export function useMe() { const { data, isPending } = authClient.useSession(); return { u: data?.user.role, isPending }; }
void demo;
