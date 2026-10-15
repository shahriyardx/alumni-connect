import { initTRPC, TRPCError } from "@trpc/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import superjson from "superjson";
import { z } from "zod";
import { auth } from "./auth";
export async function createContext(opts: { headers: Headers }) {
  const session = await auth.api.getSession({ headers: opts.headers });
  return { session };
}
const t = initTRPC.context<Awaited<ReturnType<typeof createContext>>>().create({ transformer: superjson });
export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.session) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx: { session: ctx.session, user: ctx.session.user } });
});
export const appRouter = router({
  hello: publicProcedure.input(z.object({ name: z.string() })).query(({ input }) => ({ msg: `hi ${input.name}`, at: new Date() })),
  me: protectedProcedure.query(({ ctx }) => ctx.user),
  post: router({ create: protectedProcedure.input(z.object({ title: z.string().min(1) })).mutation(async ({ input }) => ({ id: "1", ...input })) }),
});
export type AppRouter = typeof appRouter;
// app/api/trpc/[trpc]/route.ts
const handler = (req: Request) => fetchRequestHandler({ endpoint: "/api/trpc", req, router: appRouter, createContext: () => createContext({ headers: req.headers }) });
export { handler as GET, handler as POST };
// server caller (RSC / server actions)
const createCaller = createCallerFactory(appRouter);
export async function serverCaller(headers: Headers) { return createCaller(await createContext({ headers })); }
