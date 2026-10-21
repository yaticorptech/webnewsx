"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PeoplePicker } from "@/components/messages/people-picker";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { CHAT_LIMITS, type ChatPerson } from "@/lib/shared/contracts";

/** Invite people to a community: each gets an invitation in their bell to accept or decline. */
export function InviteModal({
  communityId,
  name,
  memberIds,
  open,
  onOpenChange,
}: {
  communityId: string;
  name: string;
  memberIds: ReadonlySet<string>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [people, setPeople] = useState<ChatPerson[]>([]);

  const invite = useMutation({
    mutationFn: () => api.communities.invite(communityId, people.map((p) => p.username)),
    onSuccess: ({ invited }) => {
      void queryClient.invalidateQueries({ queryKey: qk.community(communityId) });
      onOpenChange(false);
      setPeople([]);
      if (invited === 0) toast("No new invitations", { description: "They're already members or already invited." });
      else toast.success(invited === 1 ? "Invitation sent" : `${invited} invitations sent`, { description: "They'll see it in their notifications." });
    },
    onError: (error) => toast.error("Couldn't send the invitations", { description: errorMessage(error) }),
  });

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Invite people"
      description={`They'll get an invitation to join ${name}.`}
      bodyClassName="flex max-h-[60dvh] min-h-80 flex-col"
      footer={
        <Button fullWidth disabled={people.length === 0} loading={invite.isPending} onClick={() => invite.mutate()}>
          {people.length > 1 ? `Invite ${people.length} people` : "Invite"}
        </Button>
      }
    >
      <PeoplePicker selected={people} onChange={setPeople} exclude={memberIds} max={CHAT_LIMITS.invitesPerCallMax} className="min-h-0 flex-1" />
    </Modal>
  );
}
