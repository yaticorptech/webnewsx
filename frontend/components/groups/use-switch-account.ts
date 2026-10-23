"use client";

import { useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { useViewer } from "@/components/providers/viewer-provider";
import { useState } from "react";
import { toast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";

/**
 * "Posting as" (owner 2026-10-23): switch to one of your group accounts, or back to your own (`null`). The server keeps
 * the choice (a cookie) and serves every page as that account, so all cached data is dropped and the page re-renders.
 * On the profile of the account you're leaving, you land on the profile of the one you switch to (owner 2026-10-23:
 * "I switched and the profile still shows my personal account").
 */
export function useSwitchAccount() {
  const router = useRouter();
  const pathname = usePathname();
  const viewer = useViewer();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<string | null>(null);

  const switchTo = async (group: { id: string; name: string; username?: string } | null, then?: string) => {
    if (pending) return;
    setPending(group?.id ?? "me");
    try {
      if (group) await api.groups.switchTo(group.id);
      else await api.groups.switchBack();
      queryClient.clear();
      const nextUsername = group ? group.username : viewer?.actingAs?.member.username;
      const onOwnProfile = Boolean(viewer?.username) && (pathname === `/${viewer?.username}` || pathname.startsWith(`/${viewer?.username}/`));
      if (then) router.push(then);
      else if (onOwnProfile && nextUsername) router.push(`/${nextUsername}`);
      router.refresh();
      toast.success(group ? `Posting as ${group.name}` : "Back on your own account");
    } catch (error) {
      toast.error("Couldn't switch account", { description: errorMessage(error) });
    } finally {
      setPending(null);
    }
  };

  return { switchTo, pending };
}
