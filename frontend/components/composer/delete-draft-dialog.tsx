"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/toast";
import { api, errorMessage, isApiError } from "@/lib/api";

export type DeleteDraftDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draftId: string;
  title: string;
  onDeleted: () => void;
};

/** Confirm + DELETE /api/articles/:id for the draft being edited. */
export function DeleteDraftDialog({ open, onOpenChange, draftId, title, onDeleted }: DeleteDraftDialogProps) {
  const [deleting, setDeleting] = useState(false);

  const confirm = async () => {
    setDeleting(true);
    try {
      await api.deleteArticle(draftId);
      onDeleted();
    } catch (e) {
      // Already gone (deleted in another tab): treat as done.
      if (isApiError(e) && e.status === 404) onDeleted();
      else toast.error("Couldn't delete the draft", { description: errorMessage(e) });
      setDeleting(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={(next) => !deleting && onOpenChange(next)}
      title="Delete this draft?"
      description={
        <>
          <span className="font-semibold text-ink">“{title.trim() || "Untitled story"}”</span> and its cover will be
          removed for good. This can&rsquo;t be undone.
        </>
      }
      size="sm"
      bodyClassName="py-1"
      dismissible={!deleting}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={deleting}>
            Keep draft
          </Button>
          <Button variant="danger" onClick={confirm} loading={deleting} leftIcon={<Trash2 aria-hidden />}>
            Delete draft
          </Button>
        </>
      }
    />
  );
}
