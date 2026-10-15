"use client";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useSyncExternalStore } from "react";
import { useToast } from "@/components/ui/toast";
import { useTRPC } from "./trpc";

type LiveEvent = {
  kind: "post" | "comment" | "notification";
  postId?: string;
};

// "N new posts" counter: a module store instead of a context provider — one
// app shell, one counter, no tree wiring.
let newPosts = 0;
const listeners = new Set<() => void>();
function setNewPosts(n: number) {
  newPosts = n;
  for (const l of listeners) l();
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useNewPosts(): [number, () => void] {
  const n = useSyncExternalStore(
    subscribe,
    () => newPosts,
    () => 0,
  );
  return [n, () => setNewPosts(0)];
}

/** Opens the SSE stream once (in AppShell) and fans events out to the query cache. */
export function useLiveEvents(enabled: boolean) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const toast = useToast();

  useEffect(() => {
    if (!enabled) return;
    // EventSource reconnects on its own after network drops.
    const es = new EventSource("/api/events");
    es.onmessage = (m) => {
      let e: LiveEvent;
      try {
        e = JSON.parse(m.data);
      } catch {
        return;
      }
      if (e.kind === "post") {
        setNewPosts(newPosts + 1);
        void qc.invalidateQueries(trpc.post.feed.pathFilter());
      } else if (e.kind === "comment" && e.postId) {
        void qc.invalidateQueries({
          queryKey: trpc.comment.list.queryKey({ postId: e.postId }),
        });
        void qc.invalidateQueries({
          queryKey: trpc.post.byId.queryKey({ id: e.postId }),
        });
      } else if (e.kind === "notification") {
        void qc.invalidateQueries(trpc.notification.pathFilter());
        toast.success("New notification");
      }
    };
    return () => es.close();
  }, [enabled, trpc, qc, toast]);
}
