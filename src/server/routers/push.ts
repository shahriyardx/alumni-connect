import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { pushSubscription } from "@/db/schema";
import { env } from "@/env";
import { isPushEndpoint, pushEnabled } from "../push";
import { memberProcedure, publicProcedure, router } from "../trpc";

export const pushRouter = router({
  /** Null = push isn't configured on this server; the UI hides the switch. */
  config: publicProcedure.query(() => ({
    publicKey: pushEnabled ? (env.VAPID_PUBLIC_KEY as string) : null,
  })),

  subscribe: memberProcedure
    .input(
      z.object({
        endpoint: z.string().max(1000),
        keys: z.object({
          p256dh: z.string().min(1).max(200),
          auth: z.string().min(1).max(100),
        }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!pushEnabled) throw new TRPCError({ code: "NOT_FOUND" });
      if (!isPushEndpoint(input.endpoint))
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Unknown push service",
        });
      // Same browser, another account signed in: the browser moves over.
      // Only a caller holding that browser's secret `auth` key may move it;
      // knowing someone's endpoint URL alone can't take their pushes.
      const values = {
        universityId: ctx.me.universityId,
        userId: ctx.me.id,
        endpoint: input.endpoint,
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
      };
      await ctx.db
        .insert(pushSubscription)
        .values(values)
        .onConflictDoUpdate({
          target: pushSubscription.endpoint,
          set: values,
          setWhere: and(
            eq(pushSubscription.auth, input.keys.auth),
            eq(pushSubscription.p256dh, input.keys.p256dh),
          ),
        });
      return { ok: true as const };
    }),

  unsubscribe: memberProcedure
    .input(z.object({ endpoint: z.string().max(1000) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(pushSubscription)
        .where(
          and(
            eq(pushSubscription.endpoint, input.endpoint),
            eq(pushSubscription.userId, ctx.me.id),
          ),
        );
      return { ok: true as const };
    }),
});
