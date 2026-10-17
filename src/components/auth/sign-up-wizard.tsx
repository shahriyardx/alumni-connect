"use client";
import { Radio } from "@base-ui/react/radio";
import { RadioGroup } from "@base-ui/react/radio-group";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/cn";
import { useTRPC } from "@/lib/trpc";
import { ALLOWED_MIME, MAX_BYTES } from "@/lib/uploads";
import { DepartmentField } from "../department-field";
import { Button, ButtonLink } from "../ui/button";
import { Icon } from "../ui/icon";
import { Select } from "../ui/select";
import { Spinner } from "../ui/spinner";
import { TextField } from "../ui/text-field";
import { useRedirectIfSignedIn } from "../user-menu";
import { AuthFrame } from "./auth-frame";
import { isOtpComplete, OtpField, ResendButton } from "./otp-field";

const STEPS = ["University", "Details", "ID card", "Verify"] as const;
const MIMES = Object.keys(ALLOWED_MIME) as (keyof typeof ALLOWED_MIME)[];

type Form = {
  studentId: string;
  batchNumber: string;
  graduationYear: string;
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
  const confirmIdCard = useMutation(trpc.auth.confirmIdCard.mutationOptions());

  const [step, setStep] = useState(0);
  // Only before the wizard starts: after OTP verify the user is signed in on purpose.
  useRedirectIfSignedIn(undefined, step === 0);
  const [universityId, setUniversityId] = useState("");
  const [form, setForm] = useState<Form>({
    studentId: "",
    batchNumber: "",
    graduationYear: "",
    department: "",
    email: "",
    name: "",
    password: "",
  });
  const [errors, setErrors] = useState<Errors>({});
  const [role, setRole] = useState<string>();
  // Set once startSignup + card upload succeeded, so a retry of a failed
  // better-auth sign-up doesn't redo them (unless the inputs changed, it is
  // older than the 30-min pending row, or better-auth refused the row).
  const [prepared, setPrepared] = useState<{
    sig: string;
    card: File;
    role: string;
    at: number;
  }>();
  const [card, setCard] = useState<File>();
  const preview = useMemo(() => card && URL.createObjectURL(card), [card]);
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [welcome, setWelcome] = useState(false);

  const uni = unis.data?.find((u) => u.id === universityId);
  const batches = useQuery(
    trpc.auth.batches.queryOptions({ universityId }, { enabled: !!uni }),
  );
  const hasBatches = !!batches.data?.length;
  const departments = useQuery(
    trpc.auth.departments.queryOptions({ universityId }, { enabled: !!uni }),
  );
  const field = (k: keyof Form) => ({
    value: form[k],
    error: errors[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      setForm((f) => ({ ...f, [k]: e.target.value }));
      setErrors((er) => ({ ...er, [k]: undefined, form: undefined }));
    },
  });
  function pickCard(f?: File) {
    if (f) setCard(f);
    setErrors({});
  }

  async function submitCard(e: React.FormEvent) {
    e.preventDefault();
    if (!card) return;
    const mime = card.type as (typeof MIMES)[number];
    if (!MIMES.includes(mime))
      return setErrors({ form: "Use a PNG, JPEG, WebP or GIF photo" });
    if (card.size > MAX_BYTES)
      return setErrors({ form: "Photo is too large (max 5 MB)" });
    setBusy(true);
    setErrors({});
    const email = form.email.trim().toLowerCase();
    const input = {
      universityId,
      email,
      studentId: form.studentId.trim(),
      batchNumber: Number(form.batchNumber),
      graduationYear: hasBatches ? undefined : Number(form.graduationYear),
      department: form.department.trim(),
      idCardMime: mime,
    };
    const sig = JSON.stringify(input);
    try {
      let ready =
        prepared?.sig === sig &&
        prepared.card === card &&
        Date.now() - prepared.at < 25 * 60_000 &&
        prepared;
      if (!ready) {
        const r = await startSignup.mutateAsync(input);
        const body = new FormData();
        for (const [k, v] of Object.entries(r.upload.fields)) body.append(k, v);
        body.append("file", card); // must come last for S3 POST
        const up = await fetch(r.upload.url, { method: "POST", body });
        if (!up.ok)
          return setErrors({ form: "Upload failed, try a smaller photo" });
        await confirmIdCard.mutateAsync({
          email,
          signupToken: r.signupToken,
          key: r.upload.key,
        });
        ready = { sig, card, role: r.role, at: Date.now() };
        setPrepared(ready);
      }
      const { error } = await authClient.signUp.email({
        name: form.name.trim(),
        email,
        password: form.password,
      });
      if (error) {
        // The pending row is gone or changed: the next try starts over.
        if (error.code === "FAILED_TO_CREATE_USER") setPrepared(undefined);
        return setErrors({ form: error.message ?? "Could not create account" });
      }
      setRole(ready.role);
      setStep(3);
    } catch (err) {
      const er = mapSignupError(err);
      setErrors(er);
      // Identity problems (duplicate ID, missing year) are fixed one step back.
      if (er.studentId || er.graduationYear) setStep(1);
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
    if (role === "ALUMNUS") setWelcome(true);
    else router.push("/pending");
  }

  const needle = query.trim().toLowerCase();
  // The picked university stays listed even when the search hides it.
  const shown = (unis.data ?? []).filter(
    (u) => u.id === universityId || u.name.toLowerCase().includes(needle),
  );

  if (welcome) return <AlumnusWelcome name={form.name} href="/pending" />;

  return (
    <AuthFrame
      wide
      icon="person_add"
      title="Join your university"
      subtitle="Verified students and alumni only — it takes a minute."
    >
      <StepProgress steps={STEPS} step={step} />

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
            <StepHeading title="Where do you study?" />
            {unis.isLoading ? (
              <Spinner className="my-6 self-center" />
            ) : !unis.data?.length ? (
              <div className="flex flex-col items-center rounded-3xl bg-surface-high px-6 py-10 text-center">
                <span className="grid size-14 place-items-center rounded-2xl bg-primary/12 text-primary">
                  <Icon name="domain_add" size={28} />
                </span>
                <p className="mt-4 font-semibold">No universities yet</p>
                <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                  Your university needs to join first. Ask your registrar, or
                  set it up yourself.
                </p>
                <ButtonLink
                  href="/register-university"
                  variant="tonal"
                  icon="arrow_forward"
                  className="mt-6"
                >
                  Register your university
                </ButtonLink>
              </div>
            ) : (
              <>
                <TextField
                  label="Search"
                  type="search"
                  placeholder="Type your university name"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <RadioGroup
                  aria-label="University"
                  value={universityId}
                  onValueChange={(v) => setUniversityId(v as string)}
                  className="-m-1 flex max-h-80 flex-col gap-2 overflow-y-auto p-1"
                >
                  {shown.length === 0 && (
                    <div className="flex flex-col items-center gap-1 rounded-2xl border border-dashed border-foreground/10 px-4 py-6 text-center text-sm">
                      <Icon
                        name="search_off"
                        size={22}
                        className="text-muted-foreground"
                      />
                      <p className="mt-1 font-medium">
                        No match for “{query.trim()}”
                      </p>
                      <p className="text-muted-foreground">
                        Check the spelling, or{" "}
                        <Link
                          href="/register-university"
                          className="text-primary hover:underline"
                        >
                          register it
                        </Link>
                        .
                      </p>
                    </div>
                  )}
                  {shown.map((u) => (
                    <Radio.Root
                      key={u.id}
                      value={u.id}
                      className="group flex w-full cursor-pointer items-center gap-3 rounded-2xl bg-surface-high p-2.5 pr-4 text-left text-sm font-medium outline-none transition-colors duration-150 hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 data-[checked]:bg-tonal data-[checked]:text-tonal-fg"
                    >
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface text-sm font-semibold group-data-[checked]:bg-primary group-data-[checked]:text-primary-foreground">
                        {u.name.charAt(0).toUpperCase()}
                      </span>
                      <span className="flex-1 truncate">{u.name}</span>
                      <Radio.Indicator className="flex text-primary">
                        <Icon name="check_circle" filled size={20} />
                      </Radio.Indicator>
                    </Radio.Root>
                  ))}
                </RadioGroup>
                <Button type="submit" disabled={!uni} className="w-full">
                  Continue
                  <Icon name="arrow_forward" size={18} />
                </Button>
              </>
            )}
          </form>
        )}

        {step === 1 && uni && (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              setStep(2);
            }}
          >
            <StepHeading title="Your details" sub={uni.name} />
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
              {batches.isLoading ? (
                <Spinner className="self-center sm:col-span-2" />
              ) : hasBatches ? (
                <Select
                  label="Batch"
                  className="sm:col-span-2"
                  value={form.batchNumber}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, batchNumber: v }))
                  }
                  items={(batches.data ?? []).map((b) => ({
                    value: String(b.number),
                    label: `Batch ${b.number} · class of ${b.graduationYear}`,
                  }))}
                />
              ) : (
                <>
                  <TextField
                    label="Batch"
                    type="number"
                    inputMode="numeric"
                    required
                    min={1}
                    max={9999}
                    placeholder="42"
                    {...field("batchNumber")}
                  />
                  <TextField
                    label="Graduation year"
                    type="number"
                    inputMode="numeric"
                    required
                    min={1990}
                    max={new Date().getFullYear() + 8}
                    {...field("graduationYear")}
                  />
                </>
              )}
              <DepartmentField
                className="sm:col-span-2"
                value={form.department}
                departments={departments.data}
                onChange={(v) => {
                  setForm((f) => ({ ...f, department: v }));
                  setErrors((er) => ({
                    ...er,
                    department: undefined,
                    form: undefined,
                  }));
                }}
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
              <Button type="submit" disabled={!form.batchNumber}>
                Continue
                <Icon name="arrow_forward" size={18} />
              </Button>
            </div>
          </form>
        )}

        {step === 2 && (
          <form className="flex flex-col gap-4" onSubmit={submitCard}>
            <StepHeading
              title="Photo of your ID card"
              sub="Only your university's admins see it."
            />
            {preview ? (
              <div className="flex items-center gap-4 rounded-2xl bg-surface-high p-3">
                {/* biome-ignore lint/performance/noImgElement: local blob preview */}
                <img
                  src={preview}
                  alt="Your ID card"
                  className="aspect-[16/10] w-36 shrink-0 rounded-xl object-cover"
                />
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <p className="truncate text-sm font-medium">{card?.name}</p>
                  <div className="flex flex-wrap gap-1">
                    <Button
                      size="sm"
                      variant="tonal"
                      icon="sync"
                      onClick={() =>
                        document.getElementById("id-card-input")?.click()
                      }
                    >
                      Replace
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      icon="delete"
                      onClick={() => setCard(undefined)}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <label
                htmlFor="id-card-input"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  pickCard(e.dataTransfer.files[0]);
                }}
                className="flex aspect-[16/9] cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border bg-surface-high text-sm text-muted-foreground transition-colors duration-150 hover:border-primary/50 hover:bg-muted has-focus-visible:ring-3 has-focus-visible:ring-ring/50"
              >
                <span className="grid size-12 place-items-center rounded-2xl bg-tonal text-tonal-fg">
                  <Icon name="badge" size={26} />
                </span>
                <span className="font-medium text-foreground">
                  Tap to add a photo
                </span>
                <span className="text-xs">PNG, JPEG, WebP or GIF · 5 MB</span>
              </label>
            )}
            <input
              id="id-card-input"
              type="file"
              accept={MIMES.join(",")}
              capture="environment"
              className="sr-only"
              onChange={(e) => {
                pickCard(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            {errors.form && (
              <p role="alert" className="text-sm text-destructive">
                {errors.form}
              </p>
            )}
            <div className="mt-2 flex items-center justify-between gap-2">
              <Button
                variant="ghost"
                icon="arrow_back"
                onClick={() => setStep(1)}
              >
                Back
              </Button>
              <Button type="submit" loading={busy} disabled={!card}>
                Create account
              </Button>
            </div>
          </form>
        )}

        {step === 3 && (
          <form className="flex flex-col gap-6" onSubmit={verify}>
            <StepHeading
              title="Verify your email"
              sub={`Enter the 6-digit code we sent to ${form.email}.`}
            />
            <OtpField
              value={otp}
              onChange={(v) => {
                setOtp(v);
                setErrors({});
              }}
              error={errors.form}
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
                    email: form.email.trim().toLowerCase(),
                    type: "email-verification",
                  })
                }
              />
            </div>
          </form>
        )}
      </div>

      {step < 3 && (
        <p className="mt-8 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          <Link href="/sign-in" className={quietLink}>
            Sign in
          </Link>
          <span aria-hidden>·</span>
          <Link href="/register-university" className={quietLink}>
            Register your university
          </Link>
        </p>
      )}
    </AuthFrame>
  );
}

const quietLink =
  "rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

function StepHeading({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {sub && <p className="text-sm text-muted-foreground">{sub}</p>}
    </div>
  );
}

/** One row of numbered pills; on phones only the current step keeps its label. */
export function StepProgress({
  steps,
  step,
}: {
  steps: readonly string[];
  step: number;
}) {
  return (
    <ol aria-label="Progress" className="mb-8 flex items-center gap-1.5">
      {steps.map((s, i) => (
        <li
          key={s}
          aria-current={i === step ? "step" : undefined}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-full pr-3 pl-1 text-xs font-medium transition-colors duration-200",
            i === step && "bg-primary text-primary-foreground",
            i < step && "bg-tonal text-tonal-fg max-sm:pr-1",
            i > step && "bg-muted text-muted-foreground max-sm:pr-1",
          )}
        >
          <span
            className={cn(
              "grid size-5 place-items-center rounded-full text-[0.6875rem]",
              i === step ? "bg-white/20" : "bg-surface/60",
            )}
          >
            {i < step ? <Icon name="check" size={14} /> : i + 1}
          </span>
          <span className={cn(i !== step && "max-sm:sr-only")}>{s}</span>
        </li>
      ))}
    </ol>
  );
}

/** Puts each tRPC failure next to the field it's about. */
export function mapSignupError(err: unknown): Errors {
  if (!(err instanceof TRPCClientError))
    return { form: "Something went wrong, try again" };
  const msg: string = err.message;
  if (/graduation year/i.test(msg)) return { graduationYear: msg };
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
