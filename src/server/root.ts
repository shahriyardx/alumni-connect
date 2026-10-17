import { adminRouter } from "./routers/admin";
import { authRouter } from "./routers/auth";
import { commentRouter } from "./routers/comment";
import { departmentsRouter } from "./routers/departments";
import { filesRouter } from "./routers/files";
import { invitesRouter } from "./routers/invites";
import { moderationRouter } from "./routers/moderation";
import { notificationRouter } from "./routers/notification";
import { peopleRouter } from "./routers/people";
import { platformRouter } from "./routers/platform";
import { postRouter } from "./routers/post";
import { profileRouter } from "./routers/profile";
import { pushRouter } from "./routers/push";
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
  push: pushRouter,
  people: peopleRouter,
  profile: profileRouter,
  moderation: moderationRouter,
  admin: adminRouter,
  platform: platformRouter,
  workspace: workspaceRouter,
  invites: invitesRouter,
  departments: departmentsRouter,
});
export type AppRouter = typeof appRouter;
export const createCaller = createCallerFactory(appRouter);
