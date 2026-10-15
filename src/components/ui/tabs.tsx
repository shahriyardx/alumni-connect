"use client";
import { Tabs } from "@base-ui/react/tabs";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./icon";

type S<P> = Omit<P, "className"> & { className?: string };

export function TabsRoot({ className, ...props }: S<Tabs.Root.Props>) {
  return <Tabs.Root {...props} className={cn("flex flex-col", className)} />;
}

/** Segmented pill tabs; the active pill slides between triggers. Edges fade when the list scrolls. */
export function TabsList({
  className,
  children,
  ...props
}: Omit<S<Tabs.List.Props>, "style">) {
  const ref = useRef<HTMLDivElement>(null);
  const [fade, setFade] = useState({ l: false, r: false });
  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const l = el.scrollLeft > 1;
    const r = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
    setFade((f) => (f.l === l && f.r === r ? f : { l, r }));
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [update]);
  return (
    <Tabs.List
      {...props}
      ref={ref}
      onScroll={update}
      style={
        {
          "--fade-l": fade.l ? "28px" : "0px",
          "--fade-r": fade.r ? "28px" : "0px",
        } as React.CSSProperties
      }
      className={cn(
        "relative z-0 flex h-10 w-fit max-w-full items-center overflow-x-auto rounded-full bg-surface-high p-1 [scrollbar-width:none]",
        "[mask-image:linear-gradient(to_right,transparent,#000_var(--fade-l),#000_calc(100%-var(--fade-r)),transparent)]",
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
