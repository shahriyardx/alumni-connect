"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { XIcon } from "@/components/icons"
import { useIsMobile } from "@/hooks/use-mobile"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerPortal,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"

// On phones every Dialog renders as a vaul bottom sheet instead of a centred
// modal. The part components read this context and swap to their drawer
// equivalents, so call sites keep the plain Dialog API. (The mapping is
// mandatory, not cosmetic: vaul bundles its own radix-dialog instance, so a
// radix DialogTitle inside a vaul root would miss its context and throw.)
const SheetModeContext = React.createContext(false)

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  const isMobile = useIsMobile()
  return (
    <SheetModeContext.Provider value={isMobile}>
      {isMobile ? (
        <Drawer data-slot="dialog" {...props} />
      ) : (
        <DialogPrimitive.Root data-slot="dialog" {...props} />
      )}
    </SheetModeContext.Provider>
  )
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  if (React.useContext(SheetModeContext))
    return <DrawerTrigger data-slot="dialog-trigger" {...props} />
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  if (React.useContext(SheetModeContext))
    return <DrawerPortal data-slot="dialog-portal" {...props} />
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  if (React.useContext(SheetModeContext))
    return <DrawerClose data-slot="dialog-close" {...props} />
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className,
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
}) {
  const sheet = React.useContext(SheetModeContext)

  if (sheet) {
    // The caller's className carries desktop sizing (sm:max-w-md and
    // friends), which has no business on a full-width sheet — drop it and
    // give the body standard sheet padding + its own scroll.
    return (
      <DrawerContent data-slot="dialog-content">
        <div className="flex flex-col gap-4 overflow-y-auto p-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
          {children}
        </div>
      </DrawerContent>
    )
  }

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        // Radix popovers (Select, Dropdown, Popover) portal their content
        // OUTSIDE this dialog's DOM, so dismissing one reads as an
        // interact-outside and closes the whole dialog. Same story when a
        // popper is open and the click lands back on the dialog body — the
        // dialog's layer isn't topmost, so Radix still reports it as outside
        // (shadcn-ui/ui#10979). Ignore both. Callers can still override.
        onInteractOutside={(event) => {
          const target = (event.detail as { originalEvent?: Event } | undefined)
            ?.originalEvent?.target
          if (
            target instanceof Element &&
            target.closest(
              "[data-slot='select-content'], [data-radix-popper-content-wrapper], [data-slot='dialog-content']",
            )
          ) {
            event.preventDefault()
          }
        }}
        className={cn(
          "fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-6 rounded-3xl bg-popover p-6 text-sm text-popover-foreground shadow-2xl duration-100 outline-none sm:max-w-md data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close data-slot="dialog-close" asChild>
            <Button
              variant="ghost"
              className="absolute top-4 right-4"
              size="icon-sm"
            >
              <XIcon />
              <span className="sr-only">Close</span>
            </Button>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  const sheet = React.useContext(SheetModeContext)
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className,
      )}
      {...props}
    >
      {children}
      {showCloseButton &&
        (sheet ? (
          <DrawerClose asChild>
            <Button variant="outline">Close</Button>
          </DrawerClose>
        ) : (
          <DialogPrimitive.Close asChild>
            <Button variant="outline">Close</Button>
          </DialogPrimitive.Close>
        ))}
    </div>
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  if (React.useContext(SheetModeContext))
    return (
      <DrawerTitle
        data-slot="dialog-title"
        className={cn("font-heading text-lg leading-tight font-semibold tracking-tight", className)}
        {...props}
      />
    )
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("font-heading text-lg leading-tight font-semibold tracking-tight", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  const classes = cn(
    "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
    className,
  )
  if (React.useContext(SheetModeContext))
    return (
      <DrawerDescription
        data-slot="dialog-description"
        className={classes}
        {...props}
      />
    )
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={classes}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
