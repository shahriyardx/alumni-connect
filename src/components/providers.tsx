"use client";
import { Toast } from "@base-ui/react/toast";
import { Tooltip } from "@base-ui/react/tooltip";
import { TRPCReactProvider } from "@/lib/trpc";
import { Toaster } from "./ui/toast";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <TRPCReactProvider>
      <Toast.Provider timeout={5000} limit={3}>
        <Tooltip.Provider delay={400}>
          {children}
          <Toaster />
        </Tooltip.Provider>
      </Toast.Provider>
    </TRPCReactProvider>
  );
}
