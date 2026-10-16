"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/cn";
import { useTRPC } from "@/lib/trpc";
import { Button, ButtonLink } from "../ui/button";
import { Icon } from "../ui/icon";
import { Select } from "../ui/select";
import { Spinner } from "../ui/spinner";
import { TextField } from "../ui/text-field";
import { useRedirectIfSignedIn } from "../user-menu";
import { AuthFrame } from "./auth-frame";
import { isOtpComplete, OtpField, ResendButton } from "./otp-field";

const STEPS = ["University", "Identity", "Verify"] as const;

type Form = {
  studentId: string;
  batchYear: string;
  department: string;
  email: string;
  name: string;
  password: string;
};
type Errors = Partial<Record<keyof Form | "form", string>>;

export function SignUpWizard() {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const unis = useQuery(trpc.auth.universities.queryOptions());
  const startSignup = useMutation(trpc.auth.startSignup.mutationOptions());

  const [step, setStep] = useState(0);
  // Only before the wizard starts: after OTP verify the user is signed in on purpose.
  useRedirectIfSignedIn("/feed", step === 0);
  const [universityId, setUniversityId] = useState("");
  const [form, setForm] = useState<Form>({
    studentId: "",
    batchYear: "",
    department: "",
    email: "",
    name: "",
    password: "",
  });
  const [errors, setErrors] = useState<Errors>({});
  const [result, setResult] = useState<{ role: string; status: string }>();
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [welcome, setWelcome] = useState(false);

  const uni = unis.data?.find((u) => u.id === universityId);
  const field = (k: keyof Form) => ({
    value: form[k],
    error: errors[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      setForm((f) => ({ ...f, [k]: e.target.value }));
      setErrors((er) => ({ ...er, [k]: undefined, form: undefined }));
    },
  });
  const destination = result?.status === "PENDING" ? "/pending" : "/feed";

  async function submitIdentity(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const r = await startSignup.mutateAsync({
        universityId,
        email: form.email.trim(),
        studentId: form.studentId.trim(),
        batchYear: Number(form.batchYear),
        department: form.department.trim(),
      });
      const { error } = await authClient.signUp.email({
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
      });
      if (error)
        return setErrors({ form: error.message ?? "Could not create account" });
      setResult(r);
      setStep(2);
    } catch (err) {
      setErrors(mapSignupError(err));
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await authClient.emailOtp.verifyEmail({
      email: form.email.trim().toLowerCase(),
      otp,
    });
    setBusy(false);
    if (error)
      return setErrors({ form: error.message ?? "That code didn't work" });
    queryClient.clear();
    if (result?.role === "ALUMNUS") setWelcome(true);
    else router.push(destination);
  }

  if (welcome) return <AlumnusWelcome name={form.name} href={destination} />;

  return (
    <AuthFrame
      wide
      icon="person_add"
      title="Join your university"
      subtitle="Verified students and alumni only — it takes a minute."
    >
      {/* Step progress */}
      <div className="mb-4 flex flex-col gap-2.5">
        <div
          role="progressbar"
          aria-label="Sign-up progress"
          aria-valuemin={1}
          aria-valuemax={STEPS.length}
          aria-valuenow={step + 1}
          className="flex h-1 gap-1"
        >
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={cn(
                "h-full flex-1 rounded-full transition-colors duration-200",
                i <= step ? "bg-primary" : "bg-muted",
              )}
            />
          ))}
        </div>
        <ol className="flex justify-between text-xs font-medium">
          {STEPS.map((s, i) => (
            <li
              key={s}
              aria-current={i === step ? "step" : undefined}
              className={cn(
                "flex items-center gap-1",
                i <= step ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {i < step && (
                <Icon name="check" size={14} className="text-primary" />
              )}
              {s}
            </li>
          ))}
        </ol>
      </div>

      {/* Keyed so each step's card mounts fresh and fades in via @starting-style. */}
      <div
        key={step}
        className="transition-[opacity,translate] duration-200 ease-out starting:translate-y-1 starting:opacity-0"
      >
        {step === 0 && (
          <form
            className="flex flex-col gap-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (uni) setStep(1);
            }}
          >
            <h2 className="text-base font-semibold">Where do you study?</h2>
            {unis.isLoading ? (
              <Spinner className="self-center" />
            ) : (
              <Select
                label="University"
                value={universityId}
                onValueChange={setUniversityId}
                items={(unis.data ?? []).map((u) => ({
                  value: u.id,
                  label: u.name,
                }))}
              />
            )}
            <p
              className={cn(
                "flex items-center gap-2 rounded-xl bg-tonal px-3.5 py-2.5 text-sm text-tonal-fg transition-opacity duration-150",
                !uni && "opacity-0",
              )}
              aria-live="polite"
            >
              <Icon name="alternate_email" size={18} />
              {uni ? `Use your @${uni.emailDomain} email` : " "}
            </p>
            <Button type="submit" disabled={!uni} className="self-end">
              Continue
              <Icon name="arrow_forward" size={18} />
            </Button>
          </form>
        )}

        {step === 1 && uni && (
          <form className="flex flex-col gap-4" onSubmit={submitIdentity}>
            <h2 className="text-base font-semibold">Tell us who you are</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Student ID"
                required
                minLength={3}
                maxLength={40}
                autoComplete="off"
                description="Stored encrypted, never shown"
                className="sm:col-span-2"
                {...field("studentId")}
              />
              <TextField
                label="Batch year"
                type="number"
                inputMode="numeric"
                required
                min={1990}
                max={new Date().getFullYear() + 8}
                description="Expected graduation"
                {...field("batchYear")}
              />
              <TextField
                label="Department"
                required
                minLength={2}
                maxLength={80}
                {...field("department")}
              />
              <TextField
                label="Email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@example.com"
                className="sm:col-span-2"
                {...field("email")}
              />
              <TextField
                label="Full name"
                autoComplete="name"
                required
                className="sm:col-span-2"
                {...field("name")}
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
            {errors.form && (
              <p role="alert" className="text-sm text-destructive">
                {errors.form}
              </p>
            )}
            <div className="mt-2 flex items-center justify-between gap-2">
              <Button
                variant="ghost"
                icon="arrow_back"
                onClick={() => setStep(0)}
              >
                Back
              </Button>
              <Button type="submit" loading={busy}>
                Create account
              </Button>
            </div>
          </form>
        )}

        {step === 2 && (
          <form className="flex flex-col gap-6" onSubmit={verify}>
            <div className="flex flex-col gap-1">
              <h2 className="text-base font-semibold">Verify your email</h2>
              <p className="text-sm text-muted-foreground">
                Enter the 6-digit code we sent to{" "}
                <b className="font-medium text-foreground">{form.email}</b>.
              </p>
            </div>
            <OtpField
              value={otp}
              onChange={(v) => {
                setOtp(v);
                setErrors({});
              }}
              error={errors.form}
            />
            <div className="flex items-center justify-between gap-2">
              <ResendButton
                onResend={() =>
                  authClient.emailOtp.sendVerificationOtp({
                    email: form.email.trim().toLowerCase(),
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

      {step < 2 && (
        <p className="mt-6 flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
          Already have an account?
          <ButtonLink href="/sign-in" variant="link">
            Sign in
          </ButtonLink>
        </p>
      )}
    </AuthFrame>
  );
}

/** Puts each tRPC failure next to the field it's about. */
function mapSignupError(err: unknown): Errors {
  if (!(err instanceof TRPCClientError))
    return { form: "Something went wrong, try again" };
  const msg: string = err.message;
  if (/roster/i.test(msg)) return { studentId: msg };
  if (err.data?.code === "CONFLICT") return { studentId: msg, form: msg };
  if (err.data?.zodError || msg.startsWith("["))
    return { form: "Check the details you entered and try again" };
  return { form: msg };
}

function AlumnusWelcome({ name, href }: { name: string; href: string }) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center transition-[opacity,translate] duration-300 ease-out starting:translate-y-2 starting:opacity-0">
        <span className="mb-2 grid size-12 place-items-center rounded-2xl bg-tonal text-tonal-fg">
          <Icon name="school" filled size={26} />
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome back, alumnus
        </h1>
        <p className="text-sm text-muted-foreground">
          {name.split(" ")[0]}, the students who are where you once were have
          questions only you can answer.
        </p>
        <ButtonLink href={href} icon="arrow_forward" className="mt-3">
          {href === "/pending" ? "See account status" : "Go to the feed"}
        </ButtonLink>
      </div>
    </main>
  );
}
