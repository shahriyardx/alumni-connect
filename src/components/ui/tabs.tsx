"use client";
import { Tabs } from "@base-ui/react/tabs";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";

type S<P> = Omit<P, "className"> & { className?: string };

export function TabsRoot({ className, ...props }: S<Tabs.Root.Props>) {
  return <Tabs.Root {...props} className={cn("flex flex-col", className)} />;
}

/** Segmented pill tabs; the active pill slides between triggers. */
export function TabsList({
  className,
  children,
  ...props
}: S<Tabs.List.Props>) {
  return (
    <Tabs.List
      {...props}
      className={cn(
        "relative z-0 flex h-10 w-fit max-w-full items-center overflow-x-auto rounded-full bg-surface-high p-1 [scrollbar-width:none]",
        className,
      )}
    >
      {children}
      <Tabs.Indicator className="absolute top-1 bottom-1 left-[var(--active-tab-left)] -z-10 w-[var(--active-tab-width)] rounded-full bg-white shadow-sm shadow-black/5 transition-[left,width] duration-200 ease-out dark:bg-background" />
    </Tabs.List>
  );
}

export function Tab({
  icon,
  className,
  children,
  ...props
}: S<Tabs.Tab.Props> & { icon?: string }) {
  return (
    <Tabs.Tab
      {...props}
      className={cn(
        "flex h-full cursor-pointer items-center justify-center gap-1.5 rounded-full px-3.5 text-sm font-medium whitespace-nowrap text-muted-foreground outline-none",
        "transition-colors duration-150 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 data-[active]:text-foreground",
        icon && "pl-3",
        className,
      )}
    >
      {icon && <Icon name={icon} size={16} />}
      {children}
    </Tabs.Tab>
  );
}

export function TabsPanel({ className, ...props }: S<Tabs.Panel.Props>) {
  return (
    <Tabs.Panel
      {...props}
      className={cn(
        "pt-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
    />
  );
}
