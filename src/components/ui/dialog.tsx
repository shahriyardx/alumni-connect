"use client";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { cn } from "@/lib/cn";
import { popupMotion } from "./styles";

export const Dialog = {
  Root: BaseDialog.Root,
  Trigger: BaseDialog.Trigger,
  Close: BaseDialog.Close,
};

export function DialogContent({
  title,
  description,
  children,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <BaseDialog.Portal>
      <BaseDialog.Backdrop className="fixed inset-0 z-40 bg-scrim/40 transition-opacity duration-300 ease-[var(--ease-emphasized)] data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
      <BaseDialog.Popup
        className={cn(
          popupMotion,
          "fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-48px)] w-[min(560px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-[28px] bg-surface-container-high p-6 text-on-surface shadow-elevation-3 outline-none",
          className,
        )}
      >
        <div className="flex flex-col gap-2">
          <BaseDialog.Title className="text-2xl font-[650] tracking-tight">
            {title}
          </BaseDialog.Title>
          {description && (
            <BaseDialog.Description className="text-sm text-on-surface-variant">
              {description}
            </BaseDialog.Description>
          )}
        </div>
        {children}
      </BaseDialog.Popup>
    </BaseDialog.Portal>
  );
}
