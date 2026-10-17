"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { DepartmentField } from "@/components/department-field";
import { ImageUploader } from "@/components/image-uploader";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { TextField } from "@/components/ui/text-field";
import { useToast } from "@/components/ui/toast";
import { useMe, useSignOut } from "@/components/user-menu";
import { type RouterOutputs, useTRPC } from "@/lib/trpc";

const BIO_MAX = 500;

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col gap-4 p-5 sm:p-6">
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      {children}
    </Card>
  );
}

export function SettingsView() {
  const trpc = useTRPC();
  const { me } = useMe();
  const signOut = useSignOut();
  const profile = useQuery(
    trpc.profile.get.queryOptions({ id: me?.id ?? "" }, { enabled: !!me }),
  );

  return (
    <div className="flex flex-col gap-5 pt-4">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      {profile.data ? (
        <>
          <ProfileForm profile={profile.data} />
          <NotificationPrefs />
          <FollowedTags />
          <Button
            variant="destructive"
            icon="logout"
            className="self-start"
            onClick={signOut}
          >
            Sign out
          </Button>
        </>
      ) : (
        <div className="grid place-items-center py-16">
          <Spinner />
        </div>
      )}
    </div>
  );
}

function ProfileForm({
  profile,
}: {
  profile: RouterOutputs["profile"]["get"];
}) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const toast = useToast();
  const departments = useQuery(trpc.departments.list.queryOptions());
  const [name, setName] = useState(profile.name);
  const [department, setDepartment] = useState(profile.department ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const dirty =
    name.trim() !== profile.name ||
    department.trim() !== (profile.department ?? "") ||
    bio.trim() !== (profile.bio ?? "");

  const refresh = () =>
    Promise.all([
      qc.invalidateQueries(trpc.profile.pathFilter()),
      qc.invalidateQueries(trpc.auth.me.pathFilter()),
      qc.invalidateQueries(trpc.post.pathFilter()),
    ]);
  const update = useMutation(
    trpc.profile.update.mutationOptions({
      onSuccess: () => {
        toast.success("Profile saved");
        void refresh();
      },
      onError: (e) => toast.error(e.message),
    }),
  );
  const setAvatar = useMutation(
    trpc.profile.setAvatar.mutationOptions({
      onSuccess: () => {
        toast.success("Photo updated");
        void refresh();
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  return (
    <Section title="Profile">
      <div className="flex items-center gap-4">
        <Avatar
          name={profile.name}
          src={profile.avatarKey ? `/api/files/${profile.avatarKey}` : null}
          size={64}
        />
        <ImageUploader
          kind="avatar"
          onUploaded={({ key }) => setAvatar.mutate({ key })}
        />
      </div>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          update.mutate({
            name: name.trim(),
            department: department.trim(),
            bio: bio.trim(),
          });
        }}
      >
        <TextField
          label="Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          minLength={2}
          maxLength={80}
        />
        <DepartmentField
          value={department}
          departments={departments.data}
          onChange={setDepartment}
        />
        <TextField
          label="Bio"
          multiline
          rows={4}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          maxLength={BIO_MAX}
          description={`${bio.length}/${BIO_MAX}`}
        />
        <Button
          type="submit"
          className="self-start"
          disabled={!dirty}
          loading={update.isPending}
        >
          Save
        </Button>
      </form>
    </Section>
  );
}

function FollowedTags() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const toast = useToast();
  const tags = useQuery(trpc.social.followedTags.queryOptions());
  const unfollow = useMutation(
    trpc.social.followTag.mutationOptions({
      onSettled: () =>
        qc.invalidateQueries(trpc.social.followedTags.pathFilter()),
      onError: (e) => toast.error(e.message),
    }),
  );
  return (
    <Section title="Followed tags">
      {tags.data?.length ? (
        <div className="flex flex-wrap gap-1.5">
          {tags.data.map((t) => (
            <Button
              key={t.name}
              variant="tonal"
              size="sm"
              icon={t.notify ? "close" : "notifications_off"}
              aria-label={`Unfollow #${t.name}`}
              onClick={() => unfollow.mutate({ tag: t.name, on: false })}
            >
              #{t.name}
            </Button>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Follow a tag from its page to get notified about new posts.
        </p>
      )}
    </Section>
  );
}

const PREF_ROWS = [
  { key: "notifyReplyPost", label: "Replies to my posts" },
  { key: "notifyReplyComment", label: "Replies to my comments" },
  { key: "notifyAnnouncements", label: "Announcements" },
  { key: "notifyFollowedTag", label: "Activity on followed tags" },
  { key: "notifyAcceptedAnswer", label: "Accepted answer" },
  { key: "notifyFollowedPost", label: "New comments on posts I follow" },
] as const;

function NotificationPrefs() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const toast = useToast();
  const prefs = useQuery(trpc.notification.prefs.queryOptions());
  const update = useMutation(
    trpc.notification.updatePrefs.mutationOptions({
      onError: (e) => toast.error(e.message),
      onSettled: () =>
        qc.invalidateQueries(trpc.notification.prefs.pathFilter()),
    }),
  );
  if (!prefs.data) return null;
  // Optimistic: show the in-flight value instead of waiting on the round trip.
  const current =
    update.isPending && update.variables ? update.variables : prefs.data;

  return (
    <Section title="Notifications">
      <div className="flex flex-col gap-3">
        {PREF_ROWS.map(({ key, label }) => (
          <div key={key} className="flex items-center justify-between gap-4">
            <span className="text-sm">{label}</span>
            <Switch
              label={label}
              checked={current[key]}
              onCheckedChange={(checked) =>
                update.mutate({ ...current, [key]: checked })
              }
            />
          </div>
        ))}
      </div>
    </Section>
  );
}
