"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { isSuspendedNow } from "@/lib/account-status";
import { useTRPC } from "@/lib/trpc";
import { Button } from "./ui/button";
import { Dialog, DialogContent } from "./ui/dialog";
import { MenuItem } from "./ui/menu";
import { Select } from "./ui/select";
import { useToast } from "./ui/toast";

const DAYS = ["1", "3", "7", "30", "90"] as const;
const DAY_ITEMS = DAYS.map((d) => ({
  value: d,
  label: d === "1" ? "1 day" : `${d} days`,
}));

type Target = {
  id: string;
  name: string;
  status: string;
  suspendedUntil?: Date | string | null;
};

/**
 * Suspend / Ban / Restore for moderators and admins. Returns menu items (drop
 * them into any `MenuContent`) plus the dialogs they open — render both.
 * Role limits (mods can't lift bans, act on mods, etc.) are the server's job;
 * its errors surface as toasts.
 */
export function useAccountStatusActions(target: Target) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const toast = useToast();
  const [dialog, setDialog] = useState<"suspend" | "ban" | null>(null);
  const [days, setDays] = useState<(typeof DAYS)[number]>("7");

  const setStatus = useMutation(
    trpc.moderation.setUserStatus.mutationOptions({
      onSuccess: (_, v) => {
        toast.success(
          v.status === "ACTIVE"
            ? `${target.name} restored`
            : v.status === "BANNED"
              ? `${target.name} banned`
              : `${target.name} suspended for ${v.days} day${v.days === 1 ? "" : "s"}`,
        );
        setDialog(null);
      },
      onError: (e) => toast.error(e.message),
      onSettled: () => {
        void qc.invalidateQueries(trpc.admin.users.pathFilter());
        void qc.invalidateQueries(
          trpc.profile.get.queryFilter({ id: target.id }),
        );
      },
    }),
  );

  const banned = target.status === "BANNED";
  const suspended = isSuspendedNow(target);
  const items =
    target.status === "PENDING"
      ? []
      : [
          !banned && (
            <MenuItem
              key="suspend"
              icon="pause_circle"
              onClick={() => setDialog("suspend")}
            >
              {suspended ? "Change suspension…" : "Suspend…"}
            </MenuItem>
          ),
          !banned && (
            <MenuItem
              key="ban"
              icon="block"
              destructive
              onClick={() => setDialog("ban")}
            >
              Ban…
            </MenuItem>
          ),
          (banned || suspended) && (
            <MenuItem
              key="restore"
              icon="settings_backup_restore"
              onClick={() =>
                setStatus.mutate({ userId: target.id, status: "ACTIVE" })
              }
            >
              Restore access
            </MenuItem>
          ),
        ].filter(Boolean);

  const dialogs = (
    <Dialog.Root
      open={dialog !== null}
      onOpenChange={(open) => !open && setDialog(null)}
    >
      <DialogContent
        title={
          dialog === "ban" ? `Ban ${target.name}?` : `Suspend ${target.name}`
        }
        description={
          dialog === "ban"
            ? "They're signed out everywhere and can't use the app until an admin lifts the ban."
            : "They can still sign in but can't use the app until the suspension ends."
        }
      >
        {dialog === "suspend" && (
          <Select
            label="Duration"
            value={days}
            items={DAY_ITEMS}
            onValueChange={setDays}
          />
        )}
        <div className="flex justify-end gap-2">
          <Dialog.Close render={<Button variant="ghost" />}>
            Cancel
          </Dialog.Close>
          <Button
            variant={dialog === "ban" ? "destructive" : undefined}
            loading={setStatus.isPending}
            onClick={() =>
              setStatus.mutate(
                dialog === "ban"
                  ? { userId: target.id, status: "BANNED" }
                  : {
                      userId: target.id,
                      status: "SUSPENDED",
                      days: Number(days),
                    },
              )
            }
          >
            {dialog === "ban" ? "Ban" : "Suspend"}
          </Button>
        </div>
      </DialogContent>
    </Dialog.Root>
  );

  return { items, dialogs };
}
