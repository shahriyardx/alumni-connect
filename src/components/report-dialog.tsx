"use client";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useTRPC } from "@/lib/trpc";
import { Button } from "./ui/button";
import { Dialog, DialogContent } from "./ui/dialog";
import { TextField } from "./ui/text-field";
import { useToast } from "./ui/toast";

// `reason` is what moderators read; the server wants at least 5 characters.
const PRESETS = [
  { label: "Spam", reason: "Spam or advertising" },
  { label: "Scam or fake offer", reason: "Scam or fake offer" },
  { label: "Harassment", reason: "Harassment" },
  { label: "Off-topic", reason: "Off-topic" },
  { label: "Other", reason: "Other" },
] as const;
type Preset = (typeof PRESETS)[number]["label"];

const NOUN = { POST: "post", COMMENT: "comment", USER: "user" } as const;

/**
 * Report a post, comment or user. Pass `trigger` to render its own opener,
 * or control it with `open`/`onOpenChange` (e.g. from a menu item, which
 * unmounts as soon as the menu closes).
 */
export function ReportDialog({
  targetType,
  targetId,
  trigger,
  open,
  onOpenChange,
}: {
  targetType: keyof typeof NOUN;
  targetId: string;
  trigger?: React.ReactElement;
  open?: boolean;
  onOpenChange?(open: boolean): void;
}) {
  const trpc = useTRPC();
  const toast = useToast();
  const [innerOpen, setInnerOpen] = useState(false);
  const isOpen = open ?? innerOpen;
  const setOpen = (v: boolean) => {
    setInnerOpen(v);
    onOpenChange?.(v);
  };
  const [preset, setPreset] = useState<Preset | null>(null);
  const [details, setDetails] = useState("");

  const report = useMutation(
    trpc.moderation.report.mutationOptions({
      onSuccess: () => {
        toast.success("Report sent to moderators");
        setOpen(false);
        setPreset(null);
        setDetails("");
      },
      onError: (e) => toast.error(e.message),
    }),
  );

  const needsDetails = preset === "Other" && details.trim().length < 5;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const p = PRESETS.find((x) => x.label === preset);
    if (!p || needsDetails) return;
    const extra = details.trim();
    report.mutate({
      targetType,
      targetId,
      reason: (extra ? `${p.reason}: ${extra}` : p.reason).slice(0, 500),
    });
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={setOpen}>
      {trigger && <Dialog.Trigger render={trigger} />}
      <DialogContent
        title={`Report this ${NOUN[targetType]}`}
        description="Moderators review every report. The person you report isn't told who reported them."
      >
        <form onSubmit={submit} className="flex flex-col gap-5">
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1.5 text-sm font-medium">Reason</legend>
            {PRESETS.map((p) => (
              <label
                key={p.label}
                className="flex h-10 cursor-pointer items-center gap-3 rounded-xl px-3 text-sm hover:bg-muted has-[:checked]:bg-tonal has-[:checked]:text-tonal-fg"
              >
                <input
                  type="radio"
                  name="reason"
                  value={p.label}
                  checked={preset === p.label}
                  onChange={() => setPreset(p.label)}
                  className="size-4 accent-primary"
                />
                {p.label}
              </label>
            ))}
          </fieldset>
          <TextField
            label={preset === "Other" ? "Details" : "Details (optional)"}
            multiline
            rows={3}
            maxLength={400}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Anything that helps a moderator understand"
            description={
              preset === "Other" ? "At least 5 characters." : undefined
            }
          />
          <div className="flex justify-end gap-2">
            <Dialog.Close render={<Button variant="ghost" />}>
              Cancel
            </Dialog.Close>
            <Button
              type="submit"
              disabled={!preset || needsDetails}
              loading={report.isPending}
            >
              Send report
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog.Root>
  );
}
