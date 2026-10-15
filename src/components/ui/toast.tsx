"use client";
import { Toast } from "@base-ui/react/toast";
import { useMemo } from "react";
import { Icon } from "./icon";

export function useToast() {
  const { add } = Toast.useToastManager();
  return useMemo(
    () => ({
      success: (msg: string) => void add({ title: msg, type: "success" }),
      error: (msg: string) =>
        void add({ title: msg, type: "error", priority: "high" }),
    }),
    [add],
  );
}

/** M3 snackbars, stacked bottom-center. Rendered once in <Providers>. */
export function Toaster() {
  const { toasts } = Toast.useToastManager();
  return (
    <Toast.Portal>
      <Toast.Viewport className="fixed bottom-4 left-1/2 z-[60] flex w-[min(420px,calc(100vw-32px))] -translate-x-1/2 flex-col-reverse gap-2 outline-none">
        {toasts.map((t) => (
          <Toast.Root
            key={t.id}
            toast={t}
            className="flex items-center gap-3 rounded-[16px] bg-inverse-surface py-3 pr-2 pl-4 text-inverse-on-surface shadow-elevation-3 transition-[opacity,scale,translate] duration-400 ease-[var(--ease-spring)] data-[ending-style]:scale-90 data-[ending-style]:opacity-0 data-[ending-style]:duration-200 data-[starting-style]:translate-y-6 data-[starting-style]:scale-90 data-[starting-style]:opacity-0"
          >
            <Icon
              name={t.type === "error" ? "error" : "check_circle"}
              filled
              size={22}
              className={
                t.type === "error"
                  ? "text-error-container"
                  : "text-inverse-primary"
              }
            />
            <Toast.Title className="flex-1 text-sm font-medium" />
            <Toast.Close
              aria-label="Dismiss"
              className="inline-flex size-9 cursor-pointer items-center justify-center rounded-full hover:bg-inverse-on-surface/10 focus-visible:outline-2 focus-visible:outline-inverse-primary"
            >
              <Icon name="close" size={20} />
            </Toast.Close>
          </Toast.Root>
        ))}
      </Toast.Viewport>
    </Toast.Portal>
  );
}
