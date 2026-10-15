"use client";
import { Menu as BaseMenu } from "@base-ui/react/menu";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";
import { popupMotion } from "./styles";

export const Menu = { Root: BaseMenu.Root, Trigger: BaseMenu.Trigger };

export function MenuContent({
  children,
  className,
  align = "end",
}: {
  children: React.ReactNode;
  className?: string;
  align?: "start" | "center" | "end";
}) {
  return (
    <BaseMenu.Portal>
      <BaseMenu.Positioner
        sideOffset={6}
        align={align}
        className="z-50 outline-none"
      >
        <BaseMenu.Popup
          className={cn(
            popupMotion,
            "min-w-48 rounded-[16px] bg-surface-container py-2 text-on-surface shadow-elevation-2 outline-none",
            className,
          )}
        >
          {children}
        </BaseMenu.Popup>
      </BaseMenu.Positioner>
    </BaseMenu.Portal>
  );
}

export function MenuItem({
  icon,
  onClick,
  destructive,
  children,
  className,
}: {
  icon?: string;
  onClick: () => void;
  destructive?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <BaseMenu.Item
      onClick={onClick}
      className={cn(
        "mx-2 flex h-12 cursor-pointer items-center gap-3 rounded-[12px] px-3 text-sm font-medium outline-none select-none",
        "data-[highlighted]:bg-[color-mix(in_srgb,transparent,currentColor_10%)] data-[disabled]:opacity-40",
        destructive ? "text-error" : "text-on-surface",
        className,
      )}
    >
      {icon && (
        <Icon
          name={icon}
          size={20}
          className={destructive ? undefined : "text-on-surface-variant"}
        />
      )}
      {children}
    </BaseMenu.Item>
  );
}
