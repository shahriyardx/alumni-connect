"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { isAdmin, isMod, type Role } from "@/db/schema";
import { authClient } from "@/lib/auth-client";
import { useTRPC } from "@/lib/trpc";
import { ThemeMenuItems } from "./theme-menu";
import { Avatar } from "./ui/avatar";
import { RoleBadge } from "./ui/badge";
import { Icon } from "./ui/icon";
import { Menu, MenuContent, MenuItem, MenuSeparator } from "./ui/menu";
import { focusRing } from "./ui/styles";

export function useMe() {
  const trpc = useTRPC();
  const { data, isLoading } = useQuery(trpc.auth.me.queryOptions());
  return { me: data, isLoading };
}

/** Where an account lands after sign-in: a super admin (no university) runs the platform, OWNER/ADMIN the workspace, everyone else reads the feed. */
export const homeFor = (me: {
  role: Role;
  status: string;
  universityId: string | null;
}) =>
  !me.universityId
    ? "/platform"
    : isAdmin(me.role) && me.status === "ACTIVE"
      ? "/workspace"
      : "/feed";

/** Leave sign-in/sign-up only for a real session; a cookie alone may be stale. `to` defaults to homeFor(me). */
export function useRedirectIfSignedIn(to?: string, enabled = true) {
  const { me } = useMe();
  const router = useRouter();
  useEffect(() => {
    if (enabled && me) router.replace(to ?? homeFor(me));
  }, [enabled, me, router, to]);
}

export function useSignOut() {
  const router = useRouter();
  const queryClient = useQueryClient();
  return async () => {
    await authClient.signOut();
    queryClient.clear();
    router.replace("/sign-in");
  };
}

/** Account menu. "sidebar" is the full-width row at the foot of a sidebar. */
export function UserMenu({
  variant = "avatar",
}: {
  variant?: "avatar" | "sidebar";
}) {
  const { me } = useMe();
  const router = useRouter();
  const signOut = useSignOut();
  if (!me) return <div className="size-8" />;
  const superAdmin = !me.universityId;
  return (
    <Menu.Root>
      {variant === "sidebar" ? (
        <Menu.Trigger
          aria-label="Account"
          className={`${focusRing} flex w-full cursor-pointer items-center gap-2.5 rounded-2xl p-2 text-left transition-colors hover:bg-primary/6 data-[popup-open]:bg-primary/6`}
        >
          <Avatar
            name={me.name}
            src={me.avatarKey ? `/api/files/${me.avatarKey}` : null}
            size={36}
          />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-semibold">{me.name}</span>
            <span className="truncate text-xs text-muted-foreground">
              {me.email}
            </span>
          </span>
          <Icon
            name="unfold_more"
            size={18}
            className="shrink-0 text-muted-foreground"
          />
        </Menu.Trigger>
      ) : (
        <Menu.Trigger
          aria-label="Account"
          className={`${focusRing} cursor-pointer rounded-full transition-opacity hover:opacity-85`}
        >
          <Avatar
            name={me.name}
            src={me.avatarKey ? `/api/files/${me.avatarKey}` : null}
            size={32}
          />
        </Menu.Trigger>
      )}
      <MenuContent
        className={variant === "sidebar" ? "w-56" : "w-64"}
        side={variant === "sidebar" ? "top" : "bottom"}
        align={variant === "sidebar" ? "start" : "end"}
      >
        {/* The sidebar row already shows name and email. */}
        <div
          className={
            variant === "sidebar"
              ? "hidden"
              : "mb-1 flex flex-col gap-0.5 px-2.5 pt-2 pb-2.5"
          }
        >
          <span className="truncate text-sm font-semibold">{me.name}</span>
          <span className="truncate text-xs text-muted-foreground">
            {me.email}
          </span>
          <span className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
            {superAdmin ? "Super admin" : <RoleBadge role={me.role} />}
          </span>
        </div>
        {!superAdmin && (
          <MenuItem icon="person" onClick={() => router.push(`/u/${me.id}`)}>
            Profile
          </MenuItem>
        )}
        {/* Phones have no rail, so the role-gated destinations live here. */}
        {isMod(me.role) && (
          <MenuItem
            icon="space_dashboard"
            className="min-[840px]:hidden"
            onClick={() => router.push("/workspace")}
          >
            Workspace
          </MenuItem>
        )}
        {me.isPlatformAdmin && (
          <MenuItem
            icon="domain"
            className={superAdmin ? undefined : "min-[840px]:hidden"}
            onClick={() => router.push("/platform")}
          >
            Platform
          </MenuItem>
        )}
        {!superAdmin && (
          <MenuItem icon="settings" onClick={() => router.push("/settings")}>
            Settings
          </MenuItem>
        )}
        <MenuSeparator />
        <ThemeMenuItems />
        <MenuSeparator />
        <MenuItem icon="logout" onClick={signOut}>
          Sign out
        </MenuItem>
      </MenuContent>
    </Menu.Root>
  );
}
