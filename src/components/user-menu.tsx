"use client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { useTRPC } from "@/lib/trpc";
import { Avatar } from "./ui/avatar";
import { RoleBadge } from "./ui/badge";
import { Menu, MenuContent, MenuItem } from "./ui/menu";
import { stateLayer } from "./ui/styles";

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
  if (!me) return <div className="size-10" />;
  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label="Account"
        className={`${stateLayer} cursor-pointer rounded-full`}
      >
        <Avatar name={me.name} />
      </Menu.Trigger>
      <MenuContent className="w-64">
        <div className="flex flex-col gap-1 px-4 pt-2 pb-3">
          <span className="truncate font-semibold">{me.name}</span>
          <span className="truncate text-xs text-on-surface-variant">
            {me.email}
          </span>
          <span className="mt-1 flex items-center gap-2 text-xs text-on-surface-variant">
            <RoleBadge role={me.role} />
            <span className="truncate">{me.universityName}</span>
          </span>
        </div>
        <MenuItem icon="person" onClick={() => router.push(`/u/${me.id}`)}>
          Profile
        </MenuItem>
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
