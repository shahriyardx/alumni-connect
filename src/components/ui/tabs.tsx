"use client";
import { Tabs } from "@base-ui/react/tabs";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";
import { stateLayer } from "./styles";

type S<P> = Omit<P, "className"> & { className?: string };

export function TabsRoot({ className, ...props }: S<Tabs.Root.Props>) {
  return <Tabs.Root {...props} className={cn("flex flex-col", className)} />;
}

export function TabsList({
  className,
  children,
  ...props
}: S<Tabs.List.Props>) {
  return (
    <Tabs.List
      {...props}
      className={cn(
        "relative z-0 flex border-b border-outline-variant",
        className,
      )}
    >
      {children}
      <Tabs.Indicator className="absolute bottom-0 left-[calc(var(--active-tab-left)+12px)] -z-10 h-[3px] w-[calc(var(--active-tab-width)-24px)] rounded-t-full bg-primary transition-[left,width] duration-500 ease-[var(--ease-spring)]" />
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
        stateLayer,
        "flex h-12 flex-1 cursor-pointer items-center justify-center gap-2 px-4 text-sm font-semibold text-on-surface-variant outline-none focus-visible:outline-offset-[-2px]",
        "transition-colors duration-200 data-[active]:text-primary",
        className,
      )}
    >
      {icon && <Icon name={icon} size={20} />}
      {children}
    </Tabs.Tab>
  );
}

export function TabsPanel({ className, ...props }: S<Tabs.Panel.Props>) {
  return (
    <Tabs.Panel
      {...props}
      className={cn(
        "pt-4 outline-none focus-visible:outline-2 focus-visible:outline-primary",
        className,
      )}
    />
  );
}
