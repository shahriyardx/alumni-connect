import { authRouter } from "./routers/auth";
import { commentRouter } from "./routers/comment";
import { filesRouter } from "./routers/files";
import { postRouter } from "./routers/post";
import { createCallerFactory, router } from "./trpc";

export const appRouter = router({
  auth: authRouter,
  post: postRouter,
  comment: commentRouter,
  files: filesRouter,
});
export type AppRouter = typeof appRouter;
export const createCaller = createCallerFactory(appRouter);
