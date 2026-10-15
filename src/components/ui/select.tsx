"use client";
import { Select as BaseSelect } from "@base-ui/react/select";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";
import { popupMotion, popupSurface } from "./styles";

export function Select<T extends string>({
  label,
  value,
  onValueChange,
  items,
  className,
  hideLabel,
  disabled,
}: {
  label: string;
  /** Keep the label for screen readers only (e.g. a select inside a table row). */
  hideLabel?: boolean;
  disabled?: boolean;
  value: T;
  onValueChange(v: NoInfer<T>): void;
  items: readonly { value: NoInfer<T>; label: string }[];
  className?: string;
}) {
  return (
    <BaseSelect.Root
      items={items}
      value={value}
      disabled={disabled}
      onValueChange={(v) => v !== null && onValueChange(v)}
    >
      <div className={cn("flex flex-col gap-1.5", className)}>
        <BaseSelect.Label
          className={cn("text-sm font-medium", hideLabel && "sr-only")}
        >
          {label}
        </BaseSelect.Label>
        <BaseSelect.Trigger
          className={cn(
            "flex h-10 w-full min-w-48 cursor-pointer items-center justify-between gap-2 rounded-xl border border-transparent bg-surface-high pr-2.5 pl-3.5 text-left text-sm outline-none data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
            "transition-[box-shadow,border-color] duration-150 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          )}
        >
          <BaseSelect.Value
            placeholder="Select…"
            className="truncate data-[placeholder]:text-muted-foreground"
          />
          <BaseSelect.Icon className="flex text-muted-foreground transition-transform duration-150 in-data-[popup-open]:rotate-180">
            <Icon name="expand_more" size={18} />
          </BaseSelect.Icon>
        </BaseSelect.Trigger>
      </div>
      <BaseSelect.Portal>
        <BaseSelect.Positioner
          sideOffset={6}
          alignItemWithTrigger={false}
          className="z-50 outline-none"
        >
          <BaseSelect.Popup
            className={cn(
              popupMotion,
              popupSurface,
              "min-w-[var(--anchor-width)] rounded-2xl p-1 outline-none",
            )}
          >
            <BaseSelect.List className="max-h-[var(--available-height)] overflow-y-auto">
              {items.map((it) => (
                <BaseSelect.Item
                  key={it.value}
                  value={it.value}
                  className="flex h-9 cursor-pointer items-center gap-2 rounded-xl px-2.5 text-sm outline-none select-none data-[highlighted]:bg-muted data-[selected]:font-medium"
                >
                  <BaseSelect.ItemText className="flex-1">
                    {it.label}
                  </BaseSelect.ItemText>
                  <BaseSelect.ItemIndicator className="flex text-primary">
                    <Icon name="check" size={18} />
                  </BaseSelect.ItemIndicator>
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}
