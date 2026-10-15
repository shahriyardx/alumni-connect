"use client";
import { Select as BaseSelect } from "@base-ui/react/select";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";
import { popupMotion, stateLayer } from "./styles";

export function Select<T extends string>({
  label,
  value,
  onValueChange,
  items,
  className,
}: {
  label: string;
  value: T;
  onValueChange(v: NoInfer<T>): void;
  items: readonly { value: NoInfer<T>; label: string }[];
  className?: string;
}) {
  return (
    <BaseSelect.Root
      items={items}
      value={value}
      onValueChange={(v) => v !== null && onValueChange(v)}
    >
      <div className={cn("relative flex flex-col", className)}>
        <BaseSelect.Trigger
          className={cn(
            stateLayer,
            "flex h-14 w-full min-w-48 cursor-pointer items-center justify-between gap-3 rounded-t-[12px] bg-surface-container-highest pt-5 pr-3 pb-1 pl-4 text-left text-base text-on-surface",
            "shadow-[inset_0_-1px_0_var(--md-on-surface-variant)] data-[popup-open]:shadow-[inset_0_-3px_0_var(--md-primary)] focus-visible:outline-offset-0",
          )}
        >
          <span className="pointer-events-none absolute top-2 left-4 text-xs text-on-surface-variant">
            {label}
          </span>
          <BaseSelect.Value />
          <BaseSelect.Icon className="flex transition-transform duration-300 ease-[var(--ease-spring)] in-data-[popup-open]:rotate-180">
            <Icon name="arrow_drop_down" />
          </BaseSelect.Icon>
        </BaseSelect.Trigger>
      </div>
      <BaseSelect.Portal>
        <BaseSelect.Positioner
          sideOffset={4}
          alignItemWithTrigger={false}
          className="z-50 outline-none"
        >
          <BaseSelect.Popup
            className={cn(
              popupMotion,
              "min-w-[var(--anchor-width)] rounded-[16px] bg-surface-container py-2 text-on-surface shadow-elevation-2 outline-none",
            )}
          >
            <BaseSelect.List className="max-h-[var(--available-height)] overflow-y-auto">
              {items.map((it) => (
                <BaseSelect.Item
                  key={it.value}
                  value={it.value}
                  className="mx-2 flex h-12 cursor-pointer items-center gap-3 rounded-[12px] px-3 text-sm outline-none select-none data-[highlighted]:bg-[color-mix(in_srgb,transparent,var(--md-on-surface)_10%)] data-[selected]:bg-secondary-container data-[selected]:text-on-secondary-container"
                >
                  <BaseSelect.ItemText className="flex-1">
                    {it.label}
                  </BaseSelect.ItemText>
                  <BaseSelect.ItemIndicator className="flex">
                    <Icon name="check" size={20} />
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
