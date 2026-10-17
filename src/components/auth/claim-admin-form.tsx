"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { useTRPC } from "@/lib/trpc";
import { Button } from "../ui/button";
import { Spinner } from "../ui/spinner";
import { TextField } from "../ui/text-field";
import { useMe } from "../user-menu";
import { AuthFrame } from "./auth-frame";
import { isOtpComplete, OtpField, ResendButton } from "./otp-field";
import { mapSignupError, StepProgress } from "./sign-up-wizard";

const STEPS = ["Details", "Verify"] as const;
const EMPTY = { name: "", email: "", password: "", setupToken: "" };
type Form = typeof EMPTY;

/**
 * /admin: while no super admin exists, the first visitor claims it. After
 * that it's just a door to /platform (or to sign-in for everyone else).
 */
export function ClaimAdminForm() {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const status = useQuery(trpc.auth.claimStatus.queryOptions());
  const { me, isLoading } = useMe();
  const claim = useMutation(trpc.auth.claimSuperAdmin.mutationOptions());
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Form>(EMPTY);
  const [error, setError] = useState<string>();
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const email = form.email.trim().toLowerCase();
  const closed = status.data?.open === false && step === 0;

  useEffect(() => {
    if (!closed || isLoading) return;
    router.replace(
      me?.isPlatformAdmin ? "/platform" : "/sign-in?next=/platform",
    );
  }, [closed, isLoading, me, router]);

  const field = (k: keyof Form) => ({
    value: form[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      setForm((f) => ({ ...f, [k]: e.target.value }));
      setError(undefined);
    },
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await claim.mutateAsync({
        name: form.name.trim(),
        email,
        setupToken: form.setupToken || undefined,
      });
      const { error } = await authClient.signUp.email({
        name: form.name.trim(),
        email,
        password: form.password,
      });
      if (error) return setError(error.message ?? "Could not create account");
      setStep(1);
    } catch (err) {
      setError(mapSignupError(err).form);
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await authClient.emailOtp.verifyEmail({ email, otp });
    setBusy(false);
    if (error) return setError(error.message ?? "That code didn't work");
    queryClient.clear();
    router.push("/platform");
  }

  if (!status.data || closed)
    return (
      <main className="grid flex-1 place-items-center py-24">
        <Spinner />
      </main>
    );

  return (
    <AuthFrame
      wide
      icon="admin_panel_settings"
      title="Set up Alumni Connect"
      subtitle="Create the super admin account. Only the first person can."
    >
      <StepProgress steps={STEPS} step={step} />
      <div
        key={step}
        className="transition-[opacity,translate] duration-200 ease-out starting:translate-y-1 starting:opacity-0"
      >
        {step === 0 ? (
          <form className="flex flex-col gap-4" onSubmit={submit}>
            <TextField
              label="Your name"
              autoComplete="name"
              required
              minLength={2}
              maxLength={80}
              {...field("name")}
            />
            <TextField
              label="Email"
              type="email"
              autoComplete="email"
              required
              {...field("email")}
            />
            <TextField
              label="Password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              description="At least 8 characters"
              {...field("password")}
            />
            {status.data.tokenRequired && (
              <TextField
                label="Setup token"
                type="password"
                autoComplete="off"
                required
                description="From the server's SETUP_TOKEN"
                {...field("setupToken")}
              />
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" loading={busy} className="mt-2 w-full">
              Continue
            </Button>
          </form>
        ) : (
          <form className="flex flex-col gap-6" onSubmit={verify}>
            <div className="flex flex-col gap-1">
              <h2 className="text-base font-semibold">Verify your email</h2>
              <p className="text-sm text-muted-foreground">
                Enter the 6-digit code we sent to{" "}
                <b className="font-medium text-foreground">{email}</b>.
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
      </div>
    </AuthFrame>
  );
}
