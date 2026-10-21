"use client";

import { Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { handleText } from "@/components/brand/user-handle";
import { useAuthPrompt } from "@/components/layout/auth-prompt";
import { useAdminVisit } from "@/components/layout/admin-visit";
import { useViewer } from "@/components/providers/viewer-provider";
import { Button, type ButtonProps } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";

/** "Message" on someone's profile (like Instagram): opens your chat with them (logged out: the log-in prompt). */
export function MessageButton({ username, className, size }: { username: string; className?: string; size?: ButtonProps["size"] }) {
  const viewer = useViewer();
  const authPrompt = useAuthPrompt();
  const adminVisit = useAdminVisit();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const open = async () => {
    if (!viewer || adminVisit) {
      authPrompt.open(`Log in to message ${handleText(username)}`);
      return;
    }
    if (!viewer.onboarded) {
      router.push("/onboarding");
      return;
    }
    setBusy(true);
    try {
      const { id } = await api.messages.direct(username);
      router.push(`/messages/${id}`);
    } catch (error) {
      toast.error("Couldn't open the chat", { description: errorMessage(error), id: "open-chat" });
      setBusy(false);
    }
  };

  return (
    <Button variant="secondary" size={size} title="Message" loading={busy} leftIcon={<Send aria-hidden />} onClick={() => void open()} className={className}>
      Message
    </Button>
  );
}
