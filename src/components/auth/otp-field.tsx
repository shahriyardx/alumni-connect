"use client";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { Button } from "../ui/button";

const LEN = 6;

/** Six single-digit boxes: auto-advance, backspace goes back, paste fills all. */
export function OtpField({
  value,
  onChange,
  error,
  disabled,
}: {
  value: string;
  onChange(v: string): void;
  error?: string;
  disabled?: boolean;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const focus = (i: number) =>
    refs.current[Math.max(0, Math.min(LEN - 1, i))]?.focus();

  const fill = (from: number, digits: string) => {
    const chars = value.padEnd(LEN, " ").split("");
    for (const [k, d] of [...digits].entries())
      if (from + k < LEN) chars[from + k] = d;
    onChange(chars.join("").trimEnd());
    focus(from + digits.length);
  };

  return (
    <div className="flex flex-col gap-2">
      <fieldset
        aria-label="Verification code"
        className="flex justify-center gap-1.5 sm:gap-2"
      >
        {Array.from({ length: LEN }, (_, i) => (
          <input
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed-length positional boxes
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            aria-label={`Digit ${i + 1}`}
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            pattern="[0-9]*"
            maxLength={i === 0 ? LEN : 1}
            disabled={disabled}
            value={value[i]?.trim() ?? ""}
            aria-invalid={!!error}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => {
              const digits = e.currentTarget.value.replace(/\D/g, "");
              if (digits) fill(i, digits.slice(-(LEN - i)));
            }}
            onPaste={(e) => {
              e.preventDefault();
              const digits = e.clipboardData.getData("text").replace(/\D/g, "");
              if (digits) fill(0, digits.slice(0, LEN));
            }}
            onKeyDown={(e) => {
              if (e.key === "Backspace") {
                e.preventDefault();
                const chars = value.padEnd(LEN, " ").split("");
                const at = chars[i].trim() ? i : i - 1;
                if (at < 0) return;
                chars[at] = " ";
                onChange(chars.join("").trimEnd());
                focus(at);
              } else if (e.key === "ArrowLeft") focus(i - 1);
              else if (e.key === "ArrowRight") focus(i + 1);
            }}
            className={cn(
              "h-12 w-10 rounded-xl border border-transparent bg-surface-high text-center text-xl font-medium tabular-nums outline-none sm:w-11",
              "transition-[box-shadow,border-color] duration-150 focus:border-ring focus:ring-3 focus:ring-ring/50",
              error && "border-destructive focus:ring-destructive/20",
            )}
          />
        ))}
      </fieldset>
      {error && (
        <p role="alert" className="text-center text-xs text-destructive">
          {error}
        </p>
      )}
      {process.env.NODE_ENV !== "production" && (
        <p className="text-center text-xs text-muted-foreground">
          Dev mode: the code is printed in the server terminal.
        </p>
      )}
    </div>
  );
}

export const isOtpComplete = (v: string) => /^\d{6}$/.test(v);

/** "Resend code" text button with a 60 s cooldown (starts cooling, since a code was just sent). */
export function ResendButton({ onResend }: { onResend(): Promise<unknown> }) {
  const [left, setLeft] = useState(60);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return (
    <Button
      variant="ghost"
      size="sm"
      icon="refresh"
      loading={busy}
      disabled={left > 0}
      onClick={async () => {
        setBusy(true);
        try {
          await onResend();
          setLeft(60);
        } finally {
          setBusy(false);
        }
      }}
    >
      {left > 0 ? `Resend code in ${left}s` : "Resend code"}
    </Button>
  );
}
