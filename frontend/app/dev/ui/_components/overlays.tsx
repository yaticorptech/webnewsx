"use client";

import { ChevronDown, FileText, LogOut, Settings2, Share2, Trash2, UserRound } from "lucide-react";
import { useState } from "react";
import { UserHandle } from "@/components/brand/user-handle";
import { useAuthPrompt } from "@/components/layout/auth-prompt";
import { Button } from "@/components/ui/button";
import { DropdownMenu } from "@/components/ui/dropdown-menu";
import { Field } from "@/components/ui/field";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Modal, Sheet } from "@/components/ui/modal";
import { toast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import { Demo, Section } from "./section";

export function OverlaysSection() {
  const [modal, setModal] = useState(false);
  const [sheet, setSheet] = useState(false);
  const authPrompt = useAuthPrompt();

  return (
    <Section id="overlays" title="Overlays" lead="Dialogs trap focus and close on Esc; below 640px they become draggable bottom sheets.">
      <div className="grid gap-6 lg:grid-cols-2">
        <Demo label="Modal · Sheet · Auth prompt" className="flex flex-wrap items-center gap-3">
          <Button variant="danger" leftIcon={<Trash2 aria-hidden />} onClick={() => setModal(true)}>
            Delete story
          </Button>
          <Button variant="outline" onClick={() => setSheet(true)}>
            Open sheet
          </Button>
          <Button variant="secondary" onClick={() => authPrompt.open("Log in to like and follow publishers")}>
            Auth prompt
          </Button>
        </Demo>
        <Demo label="Toasts" className="flex flex-wrap items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => toast("Link copied")}>
            Default
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => toast.success("Your story is live", { action: { label: "View story", href: "/dev/ui#overlays" } })}
          >
            Success + action
          </Button>
          <Button variant="outline" size="sm" onClick={() => toast.error("Couldn’t follow maya.reports", { description: "Network error — check your connection and try again." })}>
            Error
          </Button>
          <Button variant="outline" size="sm" onClick={() => toast.live("2 new stories", { description: "Scroll up to read them." })}>
            Live
          </Button>
        </Demo>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Demo label="Dropdown menu" className="flex min-h-72 items-start justify-between gap-3">
          <DropdownMenu
            label="Account menu"
            align="start"
            triggerClassName="inline-flex h-10 items-center gap-2 rounded-full border border-border px-4 text-sm font-bold hover:border-border-strong aria-expanded:border-ink"
            trigger={
              <>
                Account <ChevronDown aria-hidden className="size-4" />
              </>
            }
            header={<p className="text-xs text-muted">Signed in as <UserHandle username="maya.reports" className="font-bold text-ink" /></p>}
            items={[
              { type: "separator" },
              { label: "View profile", href: "/dev/ui#overlays", icon: <UserRound aria-hidden /> },
              { label: "Drafts", href: "/dev/ui#overlays", icon: <FileText aria-hidden /> },
              { label: "Edit profile", onSelect: () => toast("Edit profile"), icon: <Settings2 aria-hidden /> },
              { type: "separator" },
              { label: "Log out", onSelect: () => toast.warning("Logged out (demo)"), icon: <LogOut aria-hidden />, danger: true },
            ]}
          />
          <Tooltip content="Share this story">
            <IconButton label="Share" variant="outline">
              <Share2 aria-hidden />
            </IconButton>
          </Tooltip>
        </Demo>
        <Demo label="Tooltip" className="flex min-h-40 flex-wrap items-center justify-center gap-4">
          <Tooltip content="4 min read · 1.2K views">
            <Button variant="ghost">Hover or focus me</Button>
          </Tooltip>
          <Tooltip content="Below the trigger" side="bottom">
            <Button variant="outline" size="sm">
              Bottom
            </Button>
          </Tooltip>
        </Demo>
      </div>

      <Modal
        open={modal}
        onOpenChange={setModal}
        title="Delete this story?"
        description="It disappears from every feed immediately. This can’t be undone."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setModal(false);
                toast.success("Story deleted");
              }}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-muted">“Night buses return to the harbour district after a six-year pause”</p>
      </Modal>

      <Sheet open={sheet} onOpenChange={setSheet} title="Share story" description="Send it anywhere.">
        <Field label="Link">
          <Input readOnly value="https://webnews.local/a/night-buses-return-x7k2qa" />
        </Field>
      </Sheet>
    </Section>
  );
}
