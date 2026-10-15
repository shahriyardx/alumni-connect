"use client";
import { QueryClient, QueryClientProvider, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createTRPCClient, httpBatchLink, httpBatchStreamLink } from "@trpc/client";
import { createTRPCContext } from "@trpc/tanstack-react-query";
import superjson from "superjson";
import { useState } from "react";
import type { AppRouter } from "./trpc";
export const { TRPCProvider, useTRPC, useTRPCClient } = createTRPCContext<AppRouter>();
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000 } } }));
  const [trpcClient] = useState(() => createTRPCClient<AppRouter>({
    links: [httpBatchStreamLink({ url: "/api/trpc", transformer: superjson })],
  }));
  void httpBatchLink;
  return <QueryClientProvider client={queryClient}><TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>{children}</TRPCProvider></QueryClientProvider>;
}
export function Demo() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const hello = useQuery(trpc.hello.queryOptions({ name: "x" }));
  hello.data?.at.getTime();
  const create = useMutation(trpc.post.create.mutationOptions({
    onSuccess: () => qc.invalidateQueries({ queryKey: trpc.hello.queryKey() }),
  }));
  void qc.invalidateQueries(trpc.post.pathFilter());
  return <button onClick={() => create.mutate({ title: "t" })}>{hello.data?.msg}</button>;
}
