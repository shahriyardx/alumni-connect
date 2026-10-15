import { authRouter } from "./routers/auth";
import { createCallerFactory, router } from "./trpc";

export const appRouter = router({ auth: authRouter });
export type AppRouter = typeof appRouter;
export const createCaller = createCallerFactory(appRouter);
