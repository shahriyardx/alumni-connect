"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { useTRPC } from "@/lib/trpc";
import { Avatar } from "./ui/avatar";
import { RoleBadge } from "./ui/badge";
import { Menu, MenuContent, MenuItem } from "./ui/menu";
import { focusRing } from "./ui/styles";

export function useMe() {
  const trpc = useTRPC();
  const { data, isLoading } = useQuery(trpc.auth.me.queryOptions());
  return { me: data, isLoading };
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

export function UserMenu() {
  const { me } = useMe();
  const router = useRouter();
  const signOut = useSignOut();
  if (!me) return <div className="size-8" />;
  return (
    <Menu.Root>
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
      <MenuContent className="w-64">
        <div className="mb-1 flex flex-col gap-0.5 px-2.5 pt-2 pb-2.5">
          <span className="truncate text-sm font-semibold">{me.name}</span>
          <span className="truncate text-xs text-muted-foreground">
            {me.email}
          </span>
          <span className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
            <RoleBadge role={me.role} />
            <span className="truncate">{me.universityName}</span>
          </span>
        </div>
        <MenuItem icon="person" onClick={() => router.push(`/u/${me.id}`)}>
          Profile
        </MenuItem>
        {/* Phones have no rail, so the role-gated destinations live here. */}
        {(me.role === "MODERATOR" || me.role === "ADMIN") && (
          <MenuItem
            icon="shield"
            className="min-[840px]:hidden"
            onClick={() => router.push("/mod")}
          >
            Moderation
          </MenuItem>
        )}
        {me.role === "ADMIN" && (
          <MenuItem
            icon="admin_panel_settings"
            className="min-[840px]:hidden"
            onClick={() => router.push("/admin")}
          >
            Admin
          </MenuItem>
        )}
        <MenuItem icon="settings" onClick={() => router.push("/settings")}>
          Settings
        </MenuItem>
        <MenuItem icon="logout" onClick={signOut}>
          Sign out
        </MenuItem>
      </MenuContent>
    </Menu.Root>
  );
}
