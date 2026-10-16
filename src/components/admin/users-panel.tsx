"use client";
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import Link from "next/link";
import { useDeferredValue, useState } from "react";
import { ROLES, type Role } from "@/db/schema";
import { cn } from "@/lib/cn";
import { useTRPC } from "@/lib/trpc";
import { useAccountStatusActions } from "../account-status-actions";
import { Avatar } from "../ui/avatar";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Chip } from "../ui/chip";
import { EmptyState } from "../ui/empty-state";
import { IconButton } from "../ui/icon-button";
import { Menu, MenuContent } from "../ui/menu";
import { Select } from "../ui/select";
import { Spinner } from "../ui/spinner";
import { TextField } from "../ui/text-field";
import { useToast } from "../ui/toast";

const ROLE_LABEL: Record<Role, string> = {
  STUDENT: "Student",
  ALUMNUS: "Alumnus",
  MODERATOR: "Moderator",
  ADMIN: "Admin",
};
const ROLE_ITEMS = ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }));

const STATUS_TONE: Record<string, string> = {
  ACTIVE: "bg-muted text-muted-foreground",
  PENDING: "bg-tonal text-tonal-fg",
  SUSPENDED: "bg-destructive/10 text-destructive",
  BANNED: "bg-destructive/10 text-destructive",
};

export function UsersPanel({ meId }: { meId: string }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [role, setRole] = useState<Role | undefined>();
  const query = useDeferredValue(q.trim());

  const list = useInfiniteQuery(
    trpc.admin.users.infiniteQueryOptions(
      { q: query || undefined, role },
      {
        getNextPageParam: (l) => l.nextCursor,
        placeholderData: keepPreviousData,
      },
    ),
  );
  const setUserRole = useMutation(
    trpc.admin.setRole.mutationOptions({
      onSuccess: () => toast.success("Role updated"),
      onError: (e) => toast.error(e.message),
      onSettled: () => qc.invalidateQueries(trpc.admin.pathFilter()),
    }),
  );
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <TextField
        label="Search members"
        type="search"
        placeholder="Name or email"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        <Chip label="All" selected={!role} onClick={() => setRole(undefined)} />
        {ROLES.map((r) => (
          <Chip
            key={r}
            label={ROLE_LABEL[r]}
            selected={role === r}
            onClick={() => setRole(r)}
          />
        ))}
      </div>

      {list.isLoading ? (
        <div className="grid place-items-center py-16">
          <Spinner />
        </div>
      ) : list.isError ? (
        <p className="py-16 text-center text-sm text-destructive">
          {list.error.message}
        </p>
      ) : items.length === 0 ? (
        <EmptyState icon="person_search" title="No members match" />
      ) : (
        <Card className="p-2">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted-foreground max-sm:sr-only">
              <tr>
                <th className="px-3 pt-2 pb-1 font-medium">Member</th>
                <th className="w-24 px-3 pt-2 pb-1 font-medium">Status</th>
                <th className="w-52 px-3 pt-2 pb-1 font-medium">Role</th>
                <th className="w-12 px-1 pt-2 pb-1">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((u) => (
                <tr
                  key={u.id}
                  className="max-sm:flex max-sm:flex-wrap max-sm:items-center max-sm:gap-2 max-sm:py-2"
                >
                  <td className="px-3 py-2 max-sm:w-full max-sm:py-0">
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar
                        name={u.name}
                        src={u.avatarKey ? `/api/files/${u.avatarKey}` : null}
                        size={36}
                      />
                      <div className="flex min-w-0 flex-col">
                        <Link
                          href={`/u/${u.id}`}
                          className="truncate font-semibold hover:underline"
                        >
                          {u.name}
                          {u.id === meId && (
                            <span className="font-normal text-muted-foreground">
                              {" "}
                              (you)
                            </span>
                          )}
                        </Link>
                        <span className="truncate text-xs text-muted-foreground">
                          {u.email} · Batch {u.batchYear} · {u.department}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 max-sm:ml-12 max-sm:p-0">
                    <span
                      className={cn(
                        "inline-flex h-5 items-center rounded-full px-2 text-xs font-medium",
                        STATUS_TONE[u.status],
                      )}
                    >
                      {u.status.toLowerCase()}
                    </span>
                  </td>
                  <td className="px-3 py-2 max-sm:ml-auto max-sm:p-0">
                    <Select
                      label={`Role for ${u.name}`}
                      hideLabel
                      value={u.role}
                      disabled={u.id === meId || setUserRole.isPending}
                      items={ROLE_ITEMS}
                      onValueChange={(next) =>
                        next !== u.role &&
                        setUserRole.mutate({ userId: u.id, role: next })
                      }
                    />
                  </td>
                  <td className="px-1 py-2 max-sm:p-0">
                    <RowStatusMenu user={u} self={u.id === meId} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {list.hasNextPage && (
        <Button
          variant="tonal"
          className="self-center"
          loading={list.isFetchingNextPage}
          onClick={() => list.fetchNextPage()}
        >
          Load more
        </Button>
      )}
    </div>
  );
}

function RowStatusMenu({
  user,
  self,
}: {
  user: Parameters<typeof useAccountStatusActions>[0];
  self: boolean;
}) {
  const { items, dialogs } = useAccountStatusActions(user);
  return (
    <>
      <Menu.Root>
        <Menu.Trigger
          disabled={self || items.length === 0}
          render={
            <IconButton
              icon="more_vert"
              label={`Account actions for ${user.name}`}
            />
          }
        />
        <MenuContent>{items}</MenuContent>
      </Menu.Root>
      {dialogs}
    </>
  );
}
