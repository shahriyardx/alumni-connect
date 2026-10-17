"use client";
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useDeferredValue, useState } from "react";
import { ROLES, type Role } from "@/db/schema";
import { cn } from "@/lib/cn";
import { useTRPC } from "@/lib/trpc";
import { useAccountStatusActions } from "../account-status-actions";
import { timeAgo } from "../author-line";
import { DepartmentField } from "../department-field";
import { Avatar } from "../ui/avatar";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Chip } from "../ui/chip";
import { Dialog, DialogContent } from "../ui/dialog";
import { EmptyState } from "../ui/empty-state";
import { IconButton } from "../ui/icon-button";
import { Menu, MenuContent, MenuItem } from "../ui/menu";
import { Select } from "../ui/select";
import { Spinner } from "../ui/spinner";
import { TextField } from "../ui/text-field";
import { useToast } from "../ui/toast";
import { useMe } from "../user-menu";
import { PageHeader } from "./workspace-shell";

const ROLE_LABEL: Record<Role, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MODERATOR: "Moderator",
  STAFF: "Faculty",
  STUDENT: "Student",
  ALUMNUS: "Alumnus",
};
// OWNER is never assignable here (transfer ownership instead); only the OWNER hands out ADMIN.
const roleItems = (viewer: Role, target: Role) =>
  target === "OWNER"
    ? [{ value: "OWNER" as Role, label: ROLE_LABEL.OWNER }]
    : ROLES.filter(
        (r) =>
          r !== "OWNER" &&
          (viewer === "OWNER" || r !== "ADMIN" || target === r),
      ).map((r) => ({ value: r, label: ROLE_LABEL[r] }));

const STATUS_TONE: Record<string, string> = {
  ACTIVE: "bg-muted text-muted-foreground",
  PENDING: "bg-tonal text-tonal-fg",
  SUSPENDED: "bg-destructive/10 text-destructive",
  BANNED: "bg-destructive/10 text-destructive",
};

export function MembersPanel() {
  const { me } = useMe();
  if (!me) return null;
  return (
    <>
      <PageHeader
        title="Members & invites"
        sub="Roles, account status, ownership and staff invites."
        action={<InviteDialog meRole={me.role} />}
      />
      <PendingInvites meRole={me.role} />
      <UsersPanel meId={me.id} meRole={me.role} />
    </>
  );
}

const INVITABLE_ROLES = ["ADMIN", "MODERATOR", "STAFF"] as const;
type InvitableRole = (typeof INVITABLE_ROLES)[number];
// Only the owner hands out admin — same rule as changing a member's role.
const inviteRoleItems = (viewer: Role) =>
  INVITABLE_ROLES.filter((r) => r !== "ADMIN" || viewer === "OWNER").map(
    (r) => ({ value: r, label: ROLE_LABEL[r] }),
  );

function InviteDialog({ meRole }: { meRole: Role }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const blank = {
    email: "",
    role: "STAFF" as InvitableRole,
    department: "",
    title: "",
  };
  const [form, setForm] = useState(blank);
  const departments = useQuery(trpc.departments.list.queryOptions());
  const invite = useMutation(
    trpc.invites.create.mutationOptions({
      onError: (e) =>
        toast.error(e.data?.zod ? "Check the details" : e.message),
      onSettled: () => qc.invalidateQueries(trpc.invites.pathFilter()),
    }),
  );
  const field = (k: keyof typeof blank) => ({
    value: form[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value })),
  });
  const reset = (o: boolean) => {
    setOpen(o);
    if (!o) {
      setForm(blank);
      invite.reset();
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={reset}>
      <Dialog.Trigger render={<Button icon="person_add" />}>
        Invite
      </Dialog.Trigger>
      <DialogContent
        title={invite.data ? "Invite sent" : "Invite a staff member"}
        description={
          invite.data
            ? "We emailed them a link. It works for 7 days."
            : "They set a password and verify their email to join."
        }
      >
        {invite.data ? (
          <div className="flex flex-col gap-4">
            <TextField
              label="Invite link"
              readOnly
              value={invite.data.inviteUrl}
              onFocus={(e) => e.currentTarget.select()}
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                icon="content_copy"
                onClick={() =>
                  navigator.clipboard
                    .writeText(invite.data.inviteUrl)
                    .then(() => toast.success("Copied"))
                }
              >
                Copy
              </Button>
              <Dialog.Close render={<Button />}>Done</Dialog.Close>
            </div>
          </div>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              invite.mutate({
                email: form.email.trim(),
                role: form.role,
                department:
                  form.role === "STAFF" ? form.department.trim() : undefined,
                title: form.title.trim() || undefined,
              });
            }}
          >
            <TextField
              label="Email"
              type="email"
              placeholder="name@university.edu"
              required
              {...field("email")}
            />
            {/* Only faculty belong to a department. */}
            <div
              className={
                form.role === "STAFF" ? "grid gap-4 sm:grid-cols-2" : "grid"
              }
            >
              <Select
                label="Role"
                value={form.role}
                onValueChange={(v) => setForm((f) => ({ ...f, role: v }))}
                items={inviteRoleItems(meRole)}
              />
              {form.role === "STAFF" && (
                <DepartmentField
                  value={form.department}
                  departments={departments.data}
                  minLength={1}
                  onChange={(v) => setForm((f) => ({ ...f, department: v }))}
                />
              )}
            </div>
            <TextField
              label="Title"
              placeholder="Lecturer (optional)"
              maxLength={80}
              {...field("title")}
            />
            <div className="flex justify-end gap-2">
              <Dialog.Close render={<Button variant="ghost" />}>
                Cancel
              </Dialog.Close>
              <Button type="submit" loading={invite.isPending}>
                Send invite
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog.Root>
  );
}

function PendingInvites({ meRole }: { meRole: Role }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const toast = useToast();
  const list = useQuery(trpc.invites.list.queryOptions());
  const revoke = useMutation(
    trpc.invites.revoke.mutationOptions({
      onSuccess: () => toast.success("Invite revoked"),
      onError: (e) => toast.error(e.message),
      onSettled: () => qc.invalidateQueries(trpc.invites.pathFilter()),
    }),
  );
  const open = (list.data ?? []).filter((i) => !i.acceptedAt);
  if (open.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold text-muted-foreground">
        Pending invites
      </h2>
      <Card className="divide-y divide-border p-0">
        {open.map((i) => {
          const expired = new Date(i.expiresAt) < new Date();
          return (
            <div key={i.id} className="flex items-center gap-3 px-4 py-3">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">{i.email}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {ROLE_LABEL[i.role]} · {i.department}
                  {expired
                    ? " · Expired"
                    : ` · Expires ${timeAgo(i.expiresAt)}`}
                </span>
              </div>
              {(i.role !== "ADMIN" || meRole === "OWNER") && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon="close"
                  loading={revoke.isPending && revoke.variables?.id === i.id}
                  onClick={() => revoke.mutate({ id: i.id })}
                >
                  Revoke
                </Button>
              )}
            </div>
          );
        })}
      </Card>
    </div>
  );
}

function UsersPanel({ meId, meRole }: { meId: string; meRole: Role }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const toast = useToast();
  const router = useRouter();
  const department = useSearchParams().get("department") ?? undefined;
  const departments = useQuery(trpc.departments.list.queryOptions());
  const [q, setQ] = useState("");
  const [role, setRole] = useState<Role | undefined>();
  const query = useDeferredValue(q.trim());
  const setDepartment = (v: string) =>
    router.replace(
      v
        ? `/workspace/members?department=${encodeURIComponent(v)}`
        : "/workspace/members",
    );

  const list = useInfiniteQuery(
    trpc.admin.users.infiniteQueryOptions(
      { q: query || undefined, role, department },
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
        hideLabel
        type="search"
        placeholder="Name or email"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Chip label="All" selected={!role} onClick={() => setRole(undefined)} />
        {ROLES.map((r) => (
          <Chip
            key={r}
            label={ROLE_LABEL[r]}
            selected={role === r}
            onClick={() => setRole(r)}
          />
        ))}
        {!!departments.data?.length && (
          <Select
            label="Department"
            hideLabel
            className="ml-auto"
            value={department ?? ""}
            onValueChange={setDepartment}
            items={[
              { value: "", label: "All departments" },
              ...departments.data.map((d) => ({ value: d, label: d })),
            ]}
          />
        )}
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
                          {u.email} ·{" "}
                          {u.batchNumber != null && `Batch ${u.batchNumber} · `}
                          {u.department}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 max-sm:p-0 max-sm:pl-3">
                    {u.platformBanned ? (
                      <span className="inline-flex h-5 items-center rounded-full bg-destructive/10 px-2 text-xs font-medium whitespace-nowrap text-destructive">
                        Banned by platform
                      </span>
                    ) : (
                      <span
                        className={cn(
                          "inline-flex h-5 items-center rounded-full px-2 text-xs font-medium capitalize",
                          STATUS_TONE[u.status],
                        )}
                      >
                        {u.status.toLowerCase()}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 max-sm:min-w-0 max-sm:flex-1 max-sm:p-0">
                    <Select
                      label={`Role for ${u.name}`}
                      hideLabel
                      value={u.role}
                      disabled={
                        u.id === meId ||
                        u.platformBanned ||
                        u.role === "OWNER" ||
                        (u.role === "ADMIN" && meRole !== "OWNER") ||
                        setUserRole.isPending
                      }
                      items={roleItems(meRole, u.role)}
                      onValueChange={(next) =>
                        next !== u.role &&
                        setUserRole.mutate({ userId: u.id, role: next })
                      }
                    />
                  </td>
                  <td className="px-1 py-2 max-sm:p-0">
                    <RowStatusMenu
                      user={u}
                      // Only the platform can act on a platform-banned account.
                      locked={u.id === meId || u.platformBanned}
                      canTransfer={meRole === "OWNER" && u.status === "ACTIVE"}
                    />
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
  locked,
  canTransfer,
}: {
  user: Parameters<typeof useAccountStatusActions>[0];
  locked: boolean;
  canTransfer: boolean;
}) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const toast = useToast();
  const [transfer, setTransfer] = useState(false);
  const { items, dialogs } = useAccountStatusActions(user);
  const move = useMutation(
    trpc.workspace.transferOwnership.mutationOptions({
      onSuccess: () => {
        toast.success(`${user.name} is now the owner`);
        setTransfer(false);
      },
      onError: (e) => toast.error(e.message),
      // My own role changed too: refresh everything role-gated.
      onSettled: () => qc.invalidateQueries(),
    }),
  );
  const all = canTransfer
    ? [
        ...items,
        <MenuItem key="owner" icon="key" onClick={() => setTransfer(true)}>
          Make owner…
        </MenuItem>,
      ]
    : items;
  return (
    <>
      <Menu.Root>
        <Menu.Trigger
          disabled={locked || all.length === 0}
          render={
            <IconButton
              icon="more_vert"
              label={`Account actions for ${user.name}`}
            />
          }
        />
        <MenuContent>{all}</MenuContent>
      </Menu.Root>
      {dialogs}
      <Dialog.Root open={transfer} onOpenChange={setTransfer}>
        <DialogContent
          title={`Make ${user.name} the owner?`}
          description="They get full control, including settings and admin roles. You become an admin."
        >
          <div className="flex justify-end gap-2">
            <Dialog.Close render={<Button variant="ghost" />}>
              Cancel
            </Dialog.Close>
            <Button
              loading={move.isPending}
              onClick={() => move.mutate({ userId: user.id })}
            >
              Transfer ownership
            </Button>
          </div>
        </DialogContent>
      </Dialog.Root>
    </>
  );
}
