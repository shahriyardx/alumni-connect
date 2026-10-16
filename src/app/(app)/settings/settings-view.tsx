"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ImageUploader } from "@/components/image-uploader";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
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
          <FollowedTags />
          <Section title="Appearance">
            <p className="text-sm text-muted-foreground">
              The theme follows your system's light or dark setting.
            </p>
          </Section>
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
  const [name, setName] = useState(profile.name);
  const [department, setDepartment] = useState(profile.department ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");

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
        <TextField
          label="Department"
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          required
          minLength={2}
          maxLength={80}
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
        <Button type="submit" className="self-start" loading={update.isPending}>
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
              key={t}
              variant="tonal"
              size="sm"
              icon="close"
              aria-label={`Unfollow #${t}`}
              onClick={() => unfollow.mutate({ tag: t, on: false })}
            >
              #{t}
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
