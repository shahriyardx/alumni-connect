"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { useTRPC } from "@/lib/trpc";
import { Button, ButtonLink } from "../ui/button";
import { TextField } from "../ui/text-field";
import { useRedirectIfSignedIn } from "../user-menu";
import { AuthFrame } from "./auth-frame";
import { isOtpComplete, OtpField, ResendButton } from "./otp-field";
import { mapSignupError, StepProgress } from "./sign-up-wizard";

const STEPS = ["Details", "Verify"] as const;
const EMPTY = {
  universityName: "",
  website: "",
  name: "",
  title: "",
  email: "",
  password: "",
};
type Form = typeof EMPTY;

export function RegisterUniversityForm() {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const register = useMutation(trpc.auth.registerUniversity.mutationOptions());
  const [step, setStep] = useState(0);
  useRedirectIfSignedIn("/feed", step === 0);
  const [form, setForm] = useState<Form>(EMPTY);
  const [error, setError] = useState<string>();
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const email = form.email.trim().toLowerCase();

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
      await register.mutateAsync({
        universityName: form.universityName.trim(),
        website: form.website.trim(),
        name: form.name.trim(),
        title: form.title.trim(),
        email,
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
    router.push("/pending");
  }

  return (
    <AuthFrame
      wide
      icon="domain_add"
      title="Bring your university"
      subtitle="Apply for a workspace. We review every application."
    >
      <StepProgress steps={STEPS} step={step} />
      <div
        key={step}
        className="transition-[opacity,translate] duration-200 ease-out starting:translate-y-1 starting:opacity-0"
      >
        {step === 0 ? (
          <form className="flex flex-col gap-4" onSubmit={submit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="University name"
                required
                minLength={2}
                maxLength={120}
                className="sm:col-span-2"
                {...field("universityName")}
              />
              <TextField
                label="Website"
                type="url"
                placeholder="https://"
                description="Optional"
                className="sm:col-span-2"
                {...field("website")}
              />
              <TextField
                label="Your name"
                autoComplete="name"
                required
                minLength={2}
                maxLength={80}
                {...field("name")}
              />
              <TextField
                label="Your title"
                placeholder="Registrar"
                required
                minLength={2}
                maxLength={80}
                {...field("title")}
              />
              <TextField
                label="Work email"
                type="email"
                autoComplete="email"
                required
                className="sm:col-span-2"
                {...field("email")}
              />
              <TextField
                label="Password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                description="At least 8 characters"
                className="sm:col-span-2"
                {...field("password")}
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" loading={busy} className="mt-2 w-full">
              Apply
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
            <div className="flex items-center justify-between gap-2">
              <ResendButton
                onResend={() =>
                  authClient.emailOtp.sendVerificationOtp({
                    email,
                    type: "email-verification",
                  })
                }
              />
              <Button
                type="submit"
                loading={busy}
                disabled={!isOtpComplete(otp)}
              >
                Verify
              </Button>
            </div>
          </form>
        )}
      </div>
      {step === 0 && (
        <p className="mt-6 flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
          Student or alumnus?
          <ButtonLink href="/sign-up" variant="link">
            Join instead
          </ButtonLink>
        </p>
      )}
    </AuthFrame>
  );
}
