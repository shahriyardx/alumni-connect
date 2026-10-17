"use client";
import { Switch as BaseSwitch } from "@base-ui/react/switch";
import { cn } from "@/lib/cn";
import { focusRing } from "./styles";

export function Switch({
  checked,
  onCheckedChange,
  label,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <BaseSwitch.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      aria-label={label}
      className={cn(
        focusRing,
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full bg-muted transition-colors duration-150",
        "data-[checked]:bg-primary data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
      )}
    >
      <BaseSwitch.Thumb
        className={cn(
          "block size-5 translate-x-0.5 rounded-full bg-background shadow-sm transition-transform duration-150",
          "data-[checked]:translate-x-[22px]",
        )}
      />
    </BaseSwitch.Root>
  );
}
