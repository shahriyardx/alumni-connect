"use client";
import { Field } from "@base-ui/react/field";
import { useId } from "react";
import { cn } from "@/lib/cn";

type TextFieldProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  description?: string;
  multiline?: boolean;
  rows?: number;
};

/** M3 filled text field with floating label. */
export function TextField({
  label,
  error,
  description,
  multiline,
  rows = 4,
  className,
  placeholder,
  ...props
}: TextFieldProps) {
  const id = useId();
  const control = cn(
    "peer block w-full rounded-t-[12px] bg-surface-container-highest px-4 pt-6 pb-2 text-base text-on-surface caret-primary outline-none",
    "shadow-[inset_0_-1px_0_var(--md-on-surface-variant)] transition-[box-shadow,background-color] duration-200 ease-[var(--ease-emphasized)]",
    "hover:bg-[color-mix(in_srgb,var(--md-surface-container-highest),var(--md-on-surface)_8%)]",
    "focus:shadow-[inset_0_-3px_0_var(--md-primary)]",
    "data-[invalid]:shadow-[inset_0_-2px_0_var(--md-error)] data-[invalid]:focus:shadow-[inset_0_-3px_0_var(--md-error)]",
    "data-[disabled]:pointer-events-none data-[disabled]:opacity-40",
    "placeholder:text-on-surface-variant",
    multiline ? "min-h-14 resize-y" : "h-14",
  );
  return (
    <Field.Root
      invalid={!!error}
      disabled={props.disabled}
      className={cn("flex flex-col gap-1", className)}
    >
      <div className="relative">
        {multiline ? (
          <Field.Control
            {...props}
            id={id}
            placeholder={placeholder}
            className={control}
            render={<textarea rows={rows} />}
          />
        ) : (
          <Field.Control
            {...props}
            id={id}
            placeholder={placeholder}
            className={control}
          />
        )}
        <Field.Label
          htmlFor={id}
          className={cn(
            "pointer-events-none absolute top-4 left-4 origin-left text-base text-on-surface-variant",
            "transition-[translate,scale,color] duration-200 ease-[var(--ease-emphasized)]",
            "data-[filled]:-translate-y-2.5 data-[filled]:scale-75 data-[focused]:-translate-y-2.5 data-[focused]:scale-75 data-[focused]:text-primary",
            "data-[invalid]:text-error",
            placeholder && "-translate-y-2.5 scale-75",
          )}
        >
          {label}
        </Field.Label>
      </div>
      {error ? (
        <Field.Error match className="px-4 text-xs text-error">
          {error}
        </Field.Error>
      ) : (
        description && (
          <Field.Description className="px-4 text-xs text-on-surface-variant">
            {description}
          </Field.Description>
        )
      )}
    </Field.Root>
  );
}
