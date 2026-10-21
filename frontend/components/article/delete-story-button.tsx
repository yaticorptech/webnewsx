"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { removeFromAllFeeds } from "@/components/feed/live-state";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { qk } from "@/lib/query-keys";

export type DeleteStoryButtonProps = {
  articleId: string;
  title: string;
  authorUsername: string;
};

/** Owner-only: confirm → DELETE /api/articles/:id → out of every cached feed → toast → home. */
export function DeleteStoryButton({ articleId, title, authorUsername }: DeleteStoryButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="danger" size="sm" leftIcon={<Trash2 aria-hidden />} onClick={() => setOpen(true)}>
        Delete
      </Button>
      <DeleteStoryDialog
        open={open}
        onOpenChange={setOpen}
        articleId={articleId}
        title={title}
        authorUsername={authorUsername}
        // "/" is dynamic, so the navigation fetches a fresh feed (no refresh needed — a refresh right after replace()
        // can cancel the navigation).
        onDeleted={() => router.replace("/")}
      />
    </>
  );
}

export type DeleteStoryDialogProps = DeleteStoryButtonProps & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** After the story is gone (it has already left every cached feed and the author's profile). */
  onDeleted?: () => void;
};

/**
 * "Delete this story?" — the confirmation behind the story page's Delete button and the story ⋮ menu's Delete
 * (owner 2026-10-01). Confirm → DELETE /api/articles/:id → out of every cached feed and the author's profile → toast.
 */
export function DeleteStoryDialog({ open, onOpenChange, articleId, title, authorUsername, onDeleted }: DeleteStoryDialogProps) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    setBusy(true);
    try {
      await api.deleteArticle(articleId);
    } catch (error) {
      setBusy(false);
      toast.error("Couldn't delete the story", { description: errorMessage(error) });
      return;
    }
    removeFromAllFeeds(queryClient, articleId);
    void queryClient.invalidateQueries({ queryKey: qk.userArticles(authorUsername) });
    void queryClient.invalidateQueries({ queryKey: qk.profile(authorUsername) });
    setBusy(false);
    onOpenChange(false);
    toast.success("Story deleted", { description: "It has been taken off the wire everywhere." });
    onDeleted?.();
  };

  return (
    <Modal
      open={open}
      onOpenChange={(value) => !busy && onOpenChange(value)}
      title="Delete this story?"
      description="It disappears from every feed right away, along with its likes and views. This can't be undone."
      size="sm"
      dismissible={!busy}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Keep it
          </Button>
          <Button variant="primary" onClick={() => void confirm()} loading={busy} leftIcon={<Trash2 aria-hidden />}>
            Delete story
          </Button>
        </>
      }
    >
      <p className="line-clamp-3 border-l-4 border-brand pl-4 font-wide text-base font-extrabold leading-snug text-ink">
        {title}
      </p>
    </Modal>
  );
}
