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
import { Icon } from "@/components/ui/icon";
import { TextField } from "@/components/ui/text-field";
import { useRedirectIfSignedIn } from "@/components/user-menu";
import { authClient } from "@/lib/auth-client";
import { safeNext } from "@/lib/safe-next";

export function SignInForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const next = safeNext(useSearchParams().get("next"));
  useRedirectIfSignedIn(next);
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
            We sent a 6-digit code to{" "}
            <b className="font-medium text-foreground">{email}</b>.
          </>
        }
      >
        <div>
          <form onSubmit={verify} className="flex flex-col gap-6">
            <OtpField value={otp} onChange={setOtp} error={error} />
            <div className="flex flex-col items-start gap-2">
              <Button
                className="w-full"
                type="submit"
                loading={busy}
                disabled={!isOtpComplete(otp)}
              >
                Verify
              </Button>
              <ResendButton onResend={sendCode} />
            </div>
          </form>
        </div>
      </AuthFrame>
    );

  return (
    <AuthFrame title="Welcome back" icon="login">
      <div>
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
              className="flex items-start gap-2.5 rounded-xl bg-destructive/10 p-3 text-sm text-destructive"
            >
              <Icon name="error" size={18} />
              <div className="flex flex-1 flex-col items-start gap-2">
                {error}
                {unverified && (
                  <Button
                    size="sm"
                    variant="destructive"
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
            className="self-start text-sm font-medium text-primary hover:underline"
          >
            Forgot password?
          </Link>
          <Button type="submit" loading={busy} className="mt-1 w-full">
            Sign in
          </Button>
        </form>
      </div>
      <p className="mt-6 flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
        New here?
        <ButtonLink href="/sign-up" variant="link">
          Create an account
        </ButtonLink>
      </p>
    </AuthFrame>
  );
}
