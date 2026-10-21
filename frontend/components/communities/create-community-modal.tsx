"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { CommunityFields, type CommunityFormValue } from "./community-form";

const EMPTY: CommunityFormValue = { name: "", description: "", visibility: "public", image: null };

/** "Create community": you become its owner; then invite people from its page. */
export function CreateCommunityModal({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [value, setValue] = useState(EMPTY);

  const create = useMutation({
    mutationFn: () =>
      api.communities.create({
        name: value.name.trim(),
        description: value.description.trim() || undefined,
        visibility: value.visibility,
        image: value.image,
      }),
    onSuccess: ({ id }) => {
      void queryClient.invalidateQueries({ queryKey: qk.communitiesAll });
      void queryClient.invalidateQueries({ queryKey: qk.messagesAll });
      onOpenChange(false);
      setValue(EMPTY);
      toast.success("Community created", { description: "Invite people to join it." });
      router.push(`/communities/${id}`);
    },
    onError: (error) => toast.error("Couldn't create the community", { description: errorMessage(error) }),
  });

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Create community"
      description="A space with its own chat. Invite people, share stories, talk news."
      footer={
        <Button fullWidth disabled={value.name.trim().length < 3} loading={create.isPending} onClick={() => create.mutate()}>
          Create community
        </Button>
      }
    >
      <CommunityFields value={value} onChange={setValue} />
    </Modal>
  );
}
