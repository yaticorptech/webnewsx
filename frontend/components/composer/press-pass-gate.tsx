"use client";

import { BadgeCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

/**
 * A Reader on the composer (owner 2026-10-08): they may look and write, never file — this asks them to create a Press
 * Pass first. "Create" navigates with the router, not a link, so the unsaved-changes guard doesn't stop it (the story
 * stays in this device's autosave for when they come back with their pass).
 */
export function PressPassGate({
  open,
  onOpenChange,
  title = "Create a Press Pass to publish",
  description = "Only Press Pass holders can file stories on WebNEWS. Create yours — it takes a minute — then publish your story.",
  cta = "Create",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  cta?: string;
}) {
  const router = useRouter();
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Not now
          </Button>
          <Button
            onClick={() => {
              onOpenChange(false);
              router.push("/press-pass");
            }}
            leftIcon={<BadgeCheck aria-hidden />}
          >
            {cta}
          </Button>
        </>
      }
    />
  );
}
