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

/** Inverse snackbars, stacked bottom-center. Rendered once in <Providers>. */
export function Toaster() {
  const { toasts } = Toast.useToastManager();
  return (
    <Toast.Portal>
      <Toast.Viewport className="fixed bottom-4 left-1/2 z-[60] flex w-[min(400px,calc(100vw-32px))] -translate-x-1/2 flex-col-reverse gap-2 outline-none max-[839px]:bottom-20">
        {toasts.map((t) => (
          <Toast.Root
            key={t.id}
            toast={t}
            className="flex items-center gap-3 rounded-2xl bg-inverse py-2.5 pr-2 pl-3 text-inverse-fg shadow-lg shadow-black/15 transition-[opacity,translate] duration-200 ease-out data-[ending-style]:opacity-0 data-[starting-style]:translate-y-2 data-[starting-style]:opacity-0"
          >
            <span
              className={
                t.type === "error"
                  ? "grid size-6 place-items-center rounded-full bg-[#e5484d] text-white"
                  : "grid size-6 place-items-center rounded-full bg-[#1f9d55] text-white"
              }
            >
              <Icon
                name={t.type === "error" ? "priority_high" : "check"}
                size={16}
              />
            </span>
            <Toast.Title className="flex-1 text-sm font-medium" />
            <Toast.Close
              aria-label="Dismiss"
              className="inline-flex size-8 cursor-pointer items-center justify-center rounded-full outline-none hover:bg-inverse-fg/10 focus-visible:ring-3 focus-visible:ring-inverse-fg/30"
            >
              <Icon name="close" size={18} />
            </Toast.Close>
          </Toast.Root>
        ))}
      </Toast.Viewport>
    </Toast.Portal>
  );
}
