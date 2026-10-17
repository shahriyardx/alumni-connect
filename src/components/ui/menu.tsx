"use client";
import { Menu as BaseMenu } from "@base-ui/react/menu";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";
import { popupMotion, popupSurface } from "./styles";

export const Menu = { Root: BaseMenu.Root, Trigger: BaseMenu.Trigger };

export function MenuContent({
  children,
  className,
  align = "end",
  side = "bottom",
}: {
  children: React.ReactNode;
  className?: string;
  align?: "start" | "center" | "end";
  side?: "top" | "bottom";
}) {
  return (
    <BaseMenu.Portal>
      <BaseMenu.Positioner
        sideOffset={6}
        align={align}
        side={side}
        className="z-50 outline-none"
      >
        <BaseMenu.Popup
          className={cn(
            popupMotion,
            popupSurface,
            "min-w-44 rounded-2xl p-1 outline-none",
            className,
          )}
        >
          {children}
        </BaseMenu.Popup>
      </BaseMenu.Positioner>
    </BaseMenu.Portal>
  );
}

export function MenuSeparator({ className }: { className?: string }) {
  return (
    <BaseMenu.Separator className={cn("my-1 h-px bg-border", className)} />
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
        "flex h-9 cursor-pointer items-center gap-2.5 rounded-xl px-2.5 text-sm outline-none select-none data-[disabled]:opacity-50",
        destructive
          ? "text-destructive data-[highlighted]:bg-destructive/10"
          : "text-foreground data-[highlighted]:bg-muted",
        className,
      )}
    >
      {icon && (
        <Icon
          name={icon}
          size={18}
          className={destructive ? undefined : "text-muted-foreground"}
        />
      )}
      {children}
    </BaseMenu.Item>
  );
}
