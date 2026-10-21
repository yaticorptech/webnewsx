"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Send, UserPlus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { PRESS_MEET, type PressMeetDetail, type PressMeetReporter } from "@/lib/shared/contracts";
import { inr } from "../format";
import { ReporterPicker } from "../new/reporter-picker";

/**
 * "Invite more reporters" after booking (owner 2026-10-01): the same picker as step 2 of booking, with everyone
 * already invited marked (someone who declined can be asked again), up to PRESS_MEET.reportersMax in all. New
 * invitees get the bell notification and the email, like the first ones.
 */
export function InviteMore({ meet }: { meet: PressMeetDetail }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<ReadonlyMap<string, PressMeetReporter>>(() => new Map());

  const invited = new Set(meet.invites.filter((i) => i.status !== "declined").map((i) => i.reporter.id));
  const left = Math.max(0, PRESS_MEET.reportersMax - invited.size);
  const chosen = [...selected.values()];
  const total = chosen.reduce((sum, r) => sum + (r.price ?? 0), 0);

  const send = useMutation({
    mutationFn: () => api.pressMeets.inviteMore(meet.id, chosen.map((r) => r.id)),
    onSuccess: ({ invited: count }) => {
      void queryClient.invalidateQueries({ queryKey: qk.pressMeetsAll });
      setOpen(false);
      setSelected(new Map());
      toast.success(count === 1 ? "Invitation sent" : `${count} invitations sent`, {
        description: count > 0 ? "They'll get a notification and an email to accept or decline." : "Everyone you chose was already invited.",
      });
    },
    onError: (error) => toast.error("Couldn't send the invitations", { description: errorMessage(error) }),
  });

  if (meet.status !== "scheduled" && meet.status !== "live") return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={left === 0}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-tint-border px-4 py-3.5 text-sm font-bold text-brand transition-colors hover:border-brand hover:bg-tint disabled:pointer-events-none disabled:opacity-50"
      >
        <UserPlus aria-hidden className="size-4.5" />
        Invite more reporters
        <span className="font-semibold text-muted">
          · {left === 0 ? "full" : `${left} ${left === 1 ? "spot" : "spots"} left`}
        </span>
      </button>

      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Invite more reporters"
        description={`Choose Verified reporters to add. ${left} of ${PRESS_MEET.reportersMax} spots left.`}
        size="lg"
        footer={
          <>
            <p className="mr-auto self-center text-sm text-muted max-sm:hidden">
              {chosen.length > 0 ? (
                <>
                  {chosen.length} chosen · <strong className="font-bold text-ink">{inr(total)}</strong>
                </>
              ) : (
                "No one chosen yet"
              )}
            </p>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => send.mutate()} disabled={chosen.length === 0} loading={send.isPending} leftIcon={<Send aria-hidden />}>
              {chosen.length > 1 ? `Send ${chosen.length} invitations` : "Send invitation"}
            </Button>
          </>
        }
      >
        <ReporterPicker
          selected={selected}
          invited={invited}
          max={left}
          onToggle={(reporter) =>
            setSelected((current) => {
              const next = new Map(current);
              if (next.has(reporter.id)) next.delete(reporter.id);
              else next.set(reporter.id, reporter);
              return next;
            })
          }
        />
      </Modal>
    </>
  );
}
