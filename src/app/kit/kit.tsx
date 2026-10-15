"use client";
import { Fragment, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { RoleBadge, VerifiedMark } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Fab } from "@/components/ui/fab";
import { Icon } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import { Menu, MenuContent, MenuItem } from "@/components/ui/menu";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Tab, TabsList, TabsPanel, TabsRoot } from "@/components/ui/tabs";
import { TextField } from "@/components/ui/text-field";
import { useToast } from "@/components/ui/toast";

const variants = ["filled", "tonal", "outlined", "text", "elevated"] as const;
const sorts = [
  { value: "new", label: "Newest" },
  { value: "top", label: "Top this week" },
  { value: "discussed", label: "Most discussed" },
] as const;

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-[22px] font-[650] tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

export function Kit() {
  const toast = useToast();
  const [saved, setSaved] = useState(true);
  const [chip, setChip] = useState("all");
  const [sort, setSort] = useState<(typeof sorts)[number]["value"]>("new");
  const [loading, setLoading] = useState(false);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-14 px-5 py-12 sm:px-8">
      <header className="relative overflow-hidden rounded-[32px] bg-primary-container px-8 py-12 text-on-primary-container sm:px-12">
        <div className="absolute -top-16 -right-16 size-64 rounded-full bg-tertiary-container opacity-70" />
        <div className="absolute right-24 -bottom-20 size-40 rounded-[40px] bg-secondary-container opacity-80 rotate-12" />
        <p className="relative text-sm font-semibold tracking-[0.2em] uppercase">
          Material 3 Expressive
        </p>
        <h1
          className="relative mt-3 text-[clamp(40px,7vw,57px)] leading-[1.05] font-[650] tracking-tight"
          style={{ fontVariationSettings: "'wdth' 125" }}
        >
          Alumni Connect
          <br />
          UI kit
        </h1>
        <p className="relative mt-4 max-w-md text-base opacity-80">
          Every component, every variant. Press things — the shapes morph.
        </p>
      </header>

      <Section title="Buttons">
        {(["sm", "md", "lg"] as const).map((size) => (
          <div key={size} className="flex flex-wrap items-center gap-3">
            {variants.map((v) => (
              <Button
                key={v}
                variant={v}
                size={size}
                icon={size === "md" ? "add" : undefined}
              >
                {v[0].toUpperCase() + v.slice(1)}
              </Button>
            ))}
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            loading={loading}
            onClick={() => {
              setLoading(true);
              setTimeout(() => setLoading(false), 1500);
            }}
          >
            {loading ? "Saving" : "Click to load"}
          </Button>
          <Button disabled>Disabled</Button>
          <ButtonLink href="/kit" variant="tonal" icon="link">
            Button link
          </ButtonLink>
        </div>
      </Section>

      <Section title="Icon buttons & FAB">
        <div className="grid w-fit grid-cols-[auto_repeat(4,auto)] items-center gap-x-4 gap-y-3 text-sm text-on-surface-variant">
          <span />
          <span>Standard</span>
          <span>Filled</span>
          <span>Tonal</span>
          <span>Outlined</span>
          {(
            [
              ["Resting", undefined],
              ["Unselected", false],
              ["Selected", true],
            ] as const
          ).map(([row, sel]) => (
            <Fragment key={row}>
              <span>{row}</span>
              {(["standard", "filled", "tonal", "outlined"] as const).map(
                (v) => (
                  <IconButton
                    key={v}
                    icon={sel === undefined ? "more_vert" : "favorite"}
                    label={`${v} ${row.toLowerCase()}`}
                    variant={v}
                    selected={sel}
                  />
                ),
              )}
            </Fragment>
          ))}
          <span>Toggle me</span>
          {(["standard", "filled", "tonal", "outlined"] as const).map((v) => (
            <IconButton
              key={v}
              icon="bookmark"
              label={saved ? "Unsave" : "Save"}
              variant={v}
              selected={saved}
              onClick={() => setSaved(!saved)}
            />
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <Fab icon="edit" aria-label="Compose" />
          <Fab icon="edit" label="New post" />
          <Fab icon="add" href="/kit" />
          <Fab icon="edit" size="lg" aria-label="Compose (large)" />
        </div>
      </Section>

      <Section title="Cards">
        <div className="grid gap-4 sm:grid-cols-3">
          {(["filled", "elevated", "outlined"] as const).map((v) => (
            <Card key={v} variant={v} className="flex flex-col gap-2 p-5">
              <span className="text-sm font-semibold text-on-surface-variant">
                {v}
              </span>
              <p className="text-base">Static card surface.</p>
            </Card>
          ))}
        </div>
        <Card
          variant="elevated"
          interactive
          className="flex gap-4 p-5"
          tabIndex={0}
        >
          <Avatar name="Nusrat Jahan" />
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">Nusrat Jahan</span>
              <VerifiedMark />
              <RoleBadge role="ALUMNUS" />
              <span className="text-sm text-on-surface-variant">· 2h</span>
            </div>
            <p className="text-lg font-[650] tracking-tight">
              Hiring two CSE interns for summer — referrals welcome
            </p>
            <p className="text-sm text-on-surface-variant">
              Interactive card: hover for elevation, press for the shape morph.
            </p>
          </div>
        </Card>
      </Section>

      <Section title="Text fields & select">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Full name"
            description="As it appears on the roster"
          />
          <TextField
            label="University email"
            type="email"
            defaultValue="nusrat@uni.edu"
          />
          <TextField
            label="Student ID"
            error="We couldn't find this ID on the roster"
          />
          <TextField label="Disabled" disabled defaultValue="Read only" />
          <TextField label="Search" placeholder="Try “internship”" />
          <Select
            label="Sort by"
            value={sort}
            onValueChange={setSort}
            items={sorts}
          />
          <TextField
            label="Body"
            multiline
            rows={4}
            className="sm:col-span-2"
          />
        </div>
      </Section>

      <Section title="Tabs">
        <TabsRoot defaultValue="feed">
          <TabsList>
            <Tab value="feed" icon="forum">
              Feed
            </Tab>
            <Tab value="jobs" icon="work">
              Jobs
            </Tab>
            <Tab value="events" icon="event">
              Events
            </Tab>
          </TabsList>
          <TabsPanel value="feed">Latest posts from your batch.</TabsPanel>
          <TabsPanel value="jobs">Openings shared by alumni.</TabsPanel>
          <TabsPanel value="events">Reunions, talks and meetups.</TabsPanel>
        </TabsRoot>
      </Section>

      <Section title="Dialog, menu & toasts">
        <div className="flex flex-wrap items-center gap-3">
          <Dialog.Root>
            <Dialog.Trigger render={<Button variant="tonal" icon="delete" />}>
              Delete post
            </Dialog.Trigger>
            <DialogContent
              title="Delete this post?"
              description="It will be removed from the feed for everyone. This can't be undone."
            >
              <div className="flex justify-end gap-2">
                <Dialog.Close render={<Button variant="text" />}>
                  Cancel
                </Dialog.Close>
                <Dialog.Close
                  render={<Button />}
                  onClick={() => toast.success("Post deleted")}
                >
                  Delete
                </Dialog.Close>
              </div>
            </DialogContent>
          </Dialog.Root>
          <Menu.Root>
            <Menu.Trigger
              render={<Button variant="outlined" icon="more_horiz" />}
            >
              Post actions
            </Menu.Trigger>
            <MenuContent align="start">
              <MenuItem icon="edit" onClick={() => toast.success("Edit")}>
                Edit
              </MenuItem>
              <MenuItem
                icon="share"
                onClick={() => toast.success("Link copied")}
              >
                Copy link
              </MenuItem>
              <MenuItem
                icon="flag"
                destructive
                onClick={() => toast.error("Reported")}
              >
                Report
              </MenuItem>
            </MenuContent>
          </Menu.Root>
          <Button
            variant="filled"
            icon="check"
            onClick={() => toast.success("Profile saved")}
          >
            Success toast
          </Button>
          <Button
            variant="elevated"
            icon="error"
            onClick={() => toast.error("Couldn't reach the server")}
          >
            Error toast
          </Button>
        </div>
      </Section>

      <Section title="Avatars, chips & badges">
        <div className="flex flex-wrap items-center gap-3">
          {[
            "Nusrat Jahan",
            "Arif Hossain",
            "Mei Lin",
            "Kwame Mensah",
            "Sofia",
          ].map((n, i) => (
            <Avatar key={n} name={n} size={32 + i * 8} />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {[
            ["all", "All", "apps"],
            ["jobs", "Jobs", "work"],
            ["events", "Events", "event"],
            ["help", "Help", "help"],
          ].map(([v, l, i]) => (
            <Chip
              key={v}
              label={l}
              icon={i}
              selected={chip === v}
              onClick={() => setChip(v)}
            />
          ))}
          <Chip label="Link chip" icon="link" href="/kit" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RoleBadge role="ALUMNUS" />
          <RoleBadge role="STUDENT" />
          <RoleBadge role="MODERATOR" />
          <RoleBadge role="ADMIN" />
          <VerifiedMark />
        </div>
      </Section>

      <Section title="Progress & empty state">
        <div className="flex items-center gap-6">
          <Spinner />
          <Spinner size={24} />
          <Icon name="hourglass_top" className="text-on-surface-variant" />
        </div>
        <Card variant="outlined">
          <EmptyState
            icon="forum"
            title="No posts yet"
            body="Be the first to start a conversation in your batch."
            action={<Button icon="edit">Write a post</Button>}
          />
        </Card>
      </Section>
    </main>
  );
}
