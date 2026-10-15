"use client";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { AuthFrame } from "@/components/auth/auth-frame";
import {
  isOtpComplete,
  OtpField,
  ResendButton,
} from "@/components/auth/otp-field";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { TextField } from "@/components/ui/text-field";
import { authClient } from "@/lib/auth-client";

/** Only same-origin paths; never `//evil.com`. */
const safeNext = (n: string | null) =>
  n?.startsWith("/") && !n.startsWith("//") ? n : "/feed";

export function SignInForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const next = safeNext(useSearchParams().get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [unverified, setUnverified] = useState(false);
  const [otpStep, setOtpStep] = useState(false);
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);

  const done = () => {
    queryClient.clear();
    router.push(next);
  };

  const sendCode = () =>
    authClient.emailOtp.sendVerificationOtp({
      email,
      type: "email-verification",
    });

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    const { error } = await authClient.signIn.email({ email, password });
    setBusy(false);
    if (!error) return done();
    setUnverified(
      error.code === "EMAIL_NOT_VERIFIED" ||
        /not verified/i.test(error.message ?? ""),
    );
    setError(error.message ?? "Sign in failed");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    const { error } = await authClient.emailOtp.verifyEmail({ email, otp });
    setBusy(false);
    if (!error) return done();
    setError(error.message ?? "That code didn't work");
  }

  if (otpStep)
    return (
      <AuthFrame
        title="Check your inbox"
        subtitle={
          <>
            We sent a 6-digit code to <b className="text-on-surface">{email}</b>
            .
          </>
        }
      >
        <Card variant="elevated" className="p-6 sm:p-8">
          <form onSubmit={verify} className="flex flex-col gap-6">
            <OtpField value={otp} onChange={setOtp} error={error} />
            <div className="flex items-center justify-between gap-2">
              <ResendButton onResend={sendCode} />
              <Button
                type="submit"
                loading={busy}
                disabled={!isOtpComplete(otp)}
              >
                Verify
              </Button>
            </div>
          </form>
        </Card>
      </AuthFrame>
    );

  return (
    <AuthFrame
      title="Welcome back"
      subtitle="Sign in with your institutional email."
    >
      <Card variant="elevated" className="p-6 sm:p-8">
        <form onSubmit={signIn} className="flex flex-col gap-4">
          <TextField
            label="Email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <TextField
            label="Password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-[16px] bg-error-container p-3 text-sm text-on-error-container"
            >
              <Icon name="error" size={20} />
              <div className="flex flex-1 flex-col items-start gap-2">
                {error}
                {unverified && (
                  <Button
                    size="sm"
                    variant="filled"
                    icon="mail"
                    loading={busy}
                    onClick={async () => {
                      setBusy(true);
                      const { error } = await sendCode();
                      setBusy(false);
                      if (error) return setError(error.message);
                      setError(undefined);
                      setOtpStep(true);
                    }}
                  >
                    Send code
                  </Button>
                )}
              </div>
            </div>
          )}
          <Link
            href="/forgot-password"
            className="self-start text-sm font-semibold text-primary hover:underline"
          >
            Forgot password?
          </Link>
          <Button type="submit" size="lg" loading={busy} className="mt-2">
            Sign in
          </Button>
        </form>
      </Card>
      <p className="mt-6 flex items-center justify-center gap-2 text-sm text-on-surface-variant">
        New here?
        <ButtonLink href="/sign-up" variant="text" size="sm">
          Create an account
        </ButtonLink>
      </p>
    </AuthFrame>
  );
}
