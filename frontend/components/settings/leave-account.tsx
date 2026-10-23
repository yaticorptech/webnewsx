"use client";

import { useQueryClient } from "@tanstack/react-query";
import { PauseCircle, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useViewer } from "@/components/providers/viewer-provider";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/toast";
import { api, errorMessage, request } from "@/lib/api";

type Action = "deactivate" | "delete" | "deactivate-group" | "delete-group";

const COPY: Record<Action, { title: string; description: string; button: string; done: string }> = {
  deactivate: {
    title: "Deactivate your account",
    description:
      "Your profile, stories and comments are hidden from everyone and you're logged out. Log in again any time and everything comes back as it was.",
    button: "Deactivate",
    done: "Your account is deactivated. Log in again to bring it back.",
  },
  delete: {
    title: "Delete your account for good",
    description:
      "Your profile, stories, comments, likes, followers, messages and Press Pass are removed permanently. This can't be undone.",
    button: "Delete my account",
    done: "Your account was deleted.",
  },
  "deactivate-group": {
    title: "Deactivate this group",
    description:
      "The group's profile and stories are hidden and nobody can post as it. Bring it back any time from Group accounts → Reactivate.",
    button: "Deactivate group",
    done: "The group is deactivated. Reactivate it from Group accounts.",
  },
  "delete-group": {
    title: "Delete this group for good",
    description: "The group's profile, stories and Press Pass are removed permanently. Its members keep their own accounts.",
    button: "Delete group",
    done: "The group was deleted.",
  },
};

/**
 * The bottom of Edit profile (owner 2026-10-23): deactivate (hidden until you log in again) or delete your account; while
 * posting as a group, its owner deletes the group here instead. Every one asks you to type the @username.
 */
export function LeaveAccount() {
  const viewer = useViewer();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [action, setAction] = useState<Action | null>(null);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  if (!viewer?.username) return null;
  const acting = viewer.actingAs;
  // Editors and writers of a group can't close it.
  if (acting && acting.role !== "owner") return null;
  const username = viewer.username;

  const open = (next: Action) => {
    setAction(next);
    setTyped("");
    setError(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!action || pending) return;
    if (typed.trim().replace(/^@/, "").toLowerCase() !== username.toLowerCase()) {
      setError(`Type ${username} to confirm`);
      return;
    }
    setPending(true);
    try {
      if (action === "delete-group" && acting) await api.groups.delete(acting.groupId);
      else if (action === "deactivate-group" && acting) await api.groups.deactivate(acting.groupId);
      else await request(`/api/me/${action}`, { method: "POST", body: { confirm: typed.trim() } });
      toast.success(COPY[action].done);
      setAction(null);
      queryClient.clear();
      router.replace(action.endsWith("-group") ? "/groups" : "/");
      router.refresh();
    } catch (failed) {
      setError(errorMessage(failed));
    } finally {
      setPending(false);
    }
  };

  return (
    <section aria-labelledby="leave-account" className="card flex flex-col gap-4 border-tint-border px-5 py-6 sm:px-8">
      <div>
        <h2 id="leave-account" className="text-lg font-bold text-ink">
          {acting ? "Deactivate or delete this group" : "Deactivate or delete your account"}
        </h2>
        <p className="mt-1 text-sm text-muted">
          {acting
            ? "Only the owner can do this. Deactivating hides the group until you reactivate it; deleting removes it for good. Members keep their own accounts."
            : "Take a break by deactivating — or remove your account and everything in it for good."}
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        {acting ? (
          <>
            <Button variant="outline" leftIcon={<PauseCircle aria-hidden />} onClick={() => open("deactivate-group")}>
              Deactivate group
            </Button>
            <Button variant="danger" leftIcon={<Trash2 aria-hidden />} onClick={() => open("delete-group")}>
              Delete group
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" leftIcon={<PauseCircle aria-hidden />} onClick={() => open("deactivate")}>
              Deactivate account
            </Button>
            <Button variant="danger" leftIcon={<Trash2 aria-hidden />} onClick={() => open("delete")}>
              Delete account
            </Button>
          </>
        )}
      </div>

      <Modal
        open={action !== null}
        onOpenChange={(value) => {
          if (!value) setAction(null);
        }}
        title={action ? COPY[action].title : ""}
        description={action ? COPY[action].description : undefined}
        size="sm"
      >
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <Field label={`Type ${username} to confirm`} error={error}>
            <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder={username} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setAction(null)}>
              Cancel
            </Button>
            <Button type="submit" variant={action?.startsWith("deactivate") ? "primary" : "danger"} loading={pending}>
              {action ? COPY[action].button : ""}
            </Button>
          </div>
        </form>
      </Modal>
    </section>
  );
}
