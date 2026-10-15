"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AuthFrame } from "@/components/auth/auth-frame";
import {
  isOtpComplete,
  OtpField,
  ResendButton,
} from "@/components/auth/otp-field";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TextField } from "@/components/ui/text-field";
import { useToast } from "@/components/ui/toast";
import { authClient } from "@/lib/auth-client";

export function ResetForm() {
  const router = useRouter();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const request = () => authClient.emailOtp.requestPasswordReset({ email });

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await request();
    setBusy(false);
    if (error) return setError(error.message);
    setError(undefined);
    setSent(true);
  }

  async function reset(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await authClient.emailOtp.resetPassword({
      email,
      otp,
      password,
    });
    setBusy(false);
    if (error) return setError(error.message ?? "Reset failed");
    toast.success("Password updated — sign in with your new password");
    router.push("/sign-in");
  }

  return (
    <AuthFrame
      title={sent ? "Choose a new password" : "Forgot your password?"}
      subtitle={
        sent
          ? `If ${email} has an account, a 6-digit code is on its way.`
          : "We'll email you a code to reset it."
      }
    >
      <Card className="p-6">
        {sent ? (
          <form onSubmit={reset} className="flex flex-col gap-6">
            <OtpField value={otp} onChange={setOtp} />
            <TextField
              label="New password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              description="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="flex items-center justify-between gap-2">
              <ResendButton onResend={request} />
              <Button
                type="submit"
                loading={busy}
                disabled={!isOtpComplete(otp)}
              >
                Reset password
              </Button>
            </div>
          </form>
        ) : (
          <form onSubmit={sendCode} className="flex flex-col gap-4">
            <TextField
              label="Email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              error={error}
            />
            <Button type="submit" loading={busy} className="mt-1 w-full">
              Send code
            </Button>
          </form>
        )}
      </Card>
      <div className="mt-6 flex justify-center">
        <ButtonLink href="/sign-in" variant="ghost" size="sm" icon="arrow_back">
          Back to sign in
        </ButtonLink>
      </div>
    </AuthFrame>
  );
}
