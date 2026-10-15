import { authRouter } from "./routers/auth";
import { commentRouter } from "./routers/comment";
import { filesRouter } from "./routers/files";
import { notificationRouter } from "./routers/notification";
import { postRouter } from "./routers/post";
import { profileRouter } from "./routers/profile";
import { socialRouter } from "./routers/social";
import { createCallerFactory, router } from "./trpc";

export const appRouter = router({
  auth: authRouter,
  post: postRouter,
  comment: commentRouter,
  files: filesRouter,
  social: socialRouter,
  notification: notificationRouter,
  profile: profileRouter,
});
export type AppRouter = typeof appRouter;
export const createCaller = createCallerFactory(appRouter);
