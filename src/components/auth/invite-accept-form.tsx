"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { useTRPC } from "@/lib/trpc";
import { Button, ButtonLink } from "../ui/button";
import { Spinner } from "../ui/spinner";
import { TextField } from "../ui/text-field";
import { useRedirectIfSignedIn } from "../user-menu";
import { AuthFrame } from "./auth-frame";
import { isOtpComplete, OtpField, ResendButton } from "./otp-field";

const ROLE_WORD: Record<string, string> = {
  OWNER: "the owner",
  ADMIN: "an admin",
  MODERATOR: "a moderator",
  STAFF: "a faculty member",
};

/** /invite/[token]: details (name + password, email fixed) -> email OTP -> workspace or feed. */
export function InviteAcceptForm({ token }: { token: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const lookup = useQuery(trpc.invites.lookup.queryOptions({ token }));
  const accept = useMutation(trpc.invites.accept.mutationOptions());

  const [step, setStep] = useState<"details" | "verify">("details");
  useRedirectIfSignedIn(undefined, step === "details");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submitDetails(e: React.FormEvent) {
    e.preventDefault();
    if (!lookup.data) return;
    setBusy(true);
    setError(undefined);
    try {
      await accept.mutateAsync({ token, name: name.trim() });
      const { error } = await authClient.signUp.email({
        name: name.trim(),
        email: lookup.data.email,
        password,
      });
      if (error) {
        setError(error.message ?? "Could not create account");
        return;
      }
      setStep("verify");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not accept this invite",
      );
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!lookup.data) return;
    setBusy(true);
    const { error } = await authClient.emailOtp.verifyEmail({
      email: lookup.data.email,
      otp,
    });
    setBusy(false);
    if (error) {
      setError(error.message ?? "That code didn't work");
      return;
    }
    queryClient.clear();
    router.push(lookup.data.role === "STAFF" ? "/feed" : "/workspace");
  }

  if (lookup.isLoading)
    return (
      <AuthFrame icon="mail" title="Accept your invite">
        <div className="grid place-items-center py-16">
          <Spinner />
        </div>
      </AuthFrame>
    );

  if (!lookup.data)
    return (
      <AuthFrame icon="mail" title="Invite not found">
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="text-sm text-muted-foreground">
            This invite link is invalid, expired or already used. Ask whoever
            invited you to send a new one.
          </p>
          <ButtonLink href="/sign-in" variant="tonal" icon="arrow_back">
            Back to sign in
          </ButtonLink>
        </div>
      </AuthFrame>
    );

  const { universityName, role, email, department } = lookup.data;

  return (
    <AuthFrame
      icon="mail"
      title={`Join ${universityName}`}
      subtitle={`You've been invited as ${ROLE_WORD[role] ?? role.toLowerCase()} · ${department}.`}
    >
      {step === "details" ? (
        <form className="flex flex-col gap-4" onSubmit={submitDetails}>
          <TextField label="Email" value={email} readOnly disabled />
          <TextField
            label="Full name"
            autoComplete="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <TextField
            label="Password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            description="At least 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" loading={busy} className="mt-1 w-full">
            Create account
          </Button>
        </form>
      ) : (
        <form className="flex flex-col gap-6" onSubmit={verify}>
          <div className="flex flex-col gap-1">
            <h2 className="text-xl font-semibold tracking-tight">
              Verify your email
            </h2>
            <p className="text-sm text-muted-foreground">
              Enter the 6-digit code we sent to {email}.
            </p>
          </div>
          <OtpField
            value={otp}
            onChange={(v) => {
              setOtp(v);
              setError(undefined);
            }}
            error={error}
          />
          <div className="flex flex-col items-start gap-2">
            <Button
              className="w-full"
              type="submit"
              loading={busy}
              disabled={!isOtpComplete(otp)}
            >
              Verify
            </Button>
            <ResendButton
              onResend={() =>
                authClient.emailOtp.sendVerificationOtp({
                  email,
                  type: "email-verification",
                })
              }
            />
          </div>
        </form>
      )}
    </AuthFrame>
  );
}
