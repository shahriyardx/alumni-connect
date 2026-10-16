"use client";
import { AuditPanel } from "@/components/admin/audit-panel";
import { PendingPanel } from "@/components/admin/pending-panel";
import { RosterPanel } from "@/components/admin/roster-panel";
import { StatsPanel } from "@/components/admin/stats-panel";
import { UsersPanel } from "@/components/admin/users-panel";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";
import { Tab, TabsList, TabsPanel, TabsRoot } from "@/components/ui/tabs";
import { useMe } from "@/components/user-menu";
import { isAdmin } from "@/db/schema";

export function AdminView() {
  const { me, isLoading } = useMe();
  if (isLoading)
    return (
      <div className="grid place-items-center py-24">
        <Spinner />
      </div>
    );
  if (!me || !isAdmin(me.role))
    return (
      <EmptyState
        icon="block"
        title="403 · Admins only"
        body="You don't have access to the admin console."
      />
    );

  return (
    <div className="flex flex-col gap-5 pt-4">
      <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
      <TabsRoot defaultValue="overview">
        <TabsList>
          <Tab value="overview">Overview</Tab>
          <Tab value="roster">Roster</Tab>
          <Tab value="pending">Pending</Tab>
          <Tab value="members">Members</Tab>
          <Tab value="audit">Audit log</Tab>
        </TabsList>
        <TabsPanel value="overview">
          <StatsPanel />
        </TabsPanel>
        <TabsPanel value="roster">
          <RosterPanel />
        </TabsPanel>
        <TabsPanel value="pending">
          <PendingPanel />
        </TabsPanel>
        <TabsPanel value="members">
          <UsersPanel meId={me.id} />
        </TabsPanel>
        <TabsPanel value="audit">
          <AuditPanel />
        </TabsPanel>
      </TabsRoot>
    </div>
  );
}
