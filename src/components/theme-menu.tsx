"use client";
import { cn } from "@/lib/cn";
import { type ThemeChoice, useTheme } from "@/lib/theme";
import { Icon } from "./ui/icon";
import { Menu, MenuContent, MenuItem } from "./ui/menu";
import { focusRing } from "./ui/styles";

const OPTIONS: { value: ThemeChoice; label: string; icon: string }[] = [
  { value: "light", label: "Light", icon: "light_mode" },
  { value: "dark", label: "Dark", icon: "dark_mode" },
  { value: "system", label: "System", icon: "brightness_auto" },
];

/** Theme items for an existing Menu.Root (the account menu). */
export function ThemeMenuItems() {
  const { theme, setTheme } = useTheme();
  return (
    <>
      {OPTIONS.map((o) => (
        <MenuItem key={o.value} icon={o.icon} onClick={() => setTheme(o.value)}>
          <span className="flex-1">{o.label}</span>
          {theme === o.value && <Icon name="check" size={16} />}
        </MenuItem>
      ))}
    </>
  );
}

/** Standalone icon button + menu, for pages with no account menu (the public header). */
export function ThemeMenuButton({ className }: { className?: string }) {
  const { theme } = useTheme();
  const current = OPTIONS.find((o) => o.value === theme) ?? OPTIONS[2];
  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label="Theme"
        className={cn(
          focusRing,
          "grid size-10 shrink-0 cursor-pointer place-items-center rounded-full text-foreground/80 transition-colors hover:bg-muted hover:text-foreground",
          className,
        )}
      >
        <Icon name={current.icon} size={20} />
      </Menu.Trigger>
      <MenuContent className="w-36">
        <ThemeMenuItems />
      </MenuContent>
    </Menu.Root>
  );
}
