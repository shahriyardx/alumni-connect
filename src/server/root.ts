import { adminRouter } from "./routers/admin";
import { authRouter } from "./routers/auth";
import { commentRouter } from "./routers/comment";
import { filesRouter } from "./routers/files";
import { invitesRouter } from "./routers/invites";
import { moderationRouter } from "./routers/moderation";
import { notificationRouter } from "./routers/notification";
import { platformRouter } from "./routers/platform";
import { postRouter } from "./routers/post";
import { profileRouter } from "./routers/profile";
import { socialRouter } from "./routers/social";
import { workspaceRouter } from "./routers/workspace";
import { createCallerFactory, router } from "./trpc";

export const appRouter = router({
  auth: authRouter,
  post: postRouter,
  comment: commentRouter,
  files: filesRouter,
  social: socialRouter,
  notification: notificationRouter,
  profile: profileRouter,
  moderation: moderationRouter,
  admin: adminRouter,
  platform: platformRouter,
  workspace: workspaceRouter,
  invites: invitesRouter,
});
export type AppRouter = typeof appRouter;
export const createCaller = createCallerFactory(appRouter);
