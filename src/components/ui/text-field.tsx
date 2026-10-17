"use client";
import { Field } from "@base-ui/react/field";
import { useId } from "react";
import { cn } from "@/lib/cn";

type TextFieldProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  /** Keep the label for screen readers only (e.g. an inline row edit). */
  hideLabel?: boolean;
  error?: string;
  description?: string;
  multiline?: boolean;
  rows?: number;
};

/** Label above a soft filled field; error or hint below. */
export function TextField({
  label,
  hideLabel,
  error,
  description,
  multiline,
  rows = 4,
  className,
  ...props
}: TextFieldProps) {
  const id = useId();
  const control = cn(
    "block w-full rounded-xl border border-transparent bg-surface-high px-3.5 text-base text-foreground outline-none md:text-sm",
    "transition-[box-shadow,border-color] duration-150 placeholder:text-muted-foreground",
    "focus:border-ring focus:ring-3 focus:ring-ring/50",
    "data-[invalid]:border-destructive data-[invalid]:focus:ring-destructive/20",
    "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
    multiline ? "min-h-20 resize-y py-2.5 leading-relaxed" : "h-10",
  );
  return (
    <Field.Root
      invalid={!!error}
      disabled={props.disabled}
      className={cn("flex flex-col gap-1.5", className)}
    >
      <Field.Label
        htmlFor={id}
        className={cn("text-sm font-medium", hideLabel && "sr-only")}
      >
        {label}
      </Field.Label>
      {multiline ? (
        <Field.Control
          {...props}
          id={id}
          className={control}
          render={<textarea rows={rows} />}
        />
      ) : (
        <Field.Control {...props} id={id} className={control} />
      )}
      {error ? (
        <Field.Error match className="text-xs text-destructive">
          {error}
        </Field.Error>
      ) : (
        description && (
          <Field.Description className="text-xs text-muted-foreground">
            {description}
          </Field.Description>
        )
      )}
    </Field.Root>
  );
}
