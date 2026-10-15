"use client";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { cn } from "@/lib/cn";
import { popupMotion, popupSurface } from "./styles";

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
      <BaseDialog.Backdrop className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px] transition-opacity duration-150 ease-out data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
      <BaseDialog.Popup
        className={cn(
          popupMotion,
          popupSurface,
          "fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-48px)] w-[min(448px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col gap-6 overflow-y-auto rounded-3xl p-6 text-sm outline-none",
          className,
        )}
      >
        <div className="flex flex-col gap-2">
          <BaseDialog.Title className="text-lg leading-tight font-semibold tracking-tight">
            {title}
          </BaseDialog.Title>
          {description && (
            <BaseDialog.Description className="text-sm text-muted-foreground">
              {description}
            </BaseDialog.Description>
          )}
        </div>
        {children}
      </BaseDialog.Popup>
    </BaseDialog.Portal>
  );
}
