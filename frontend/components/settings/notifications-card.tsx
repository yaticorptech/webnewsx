"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BellRing } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import type { PushPermission } from "@/lib/native-app";
import { askPushPermission, pushPermission } from "@/lib/native-push";
import { qk } from "@/lib/query-keys";
import type { AccountSettings } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";

/**
 * Settings → Notifications (owner 2026-10-02, in the WebNEWS app): push notifications on / off for the account —
 * everything the bell shows — and, when the phone itself blocks them, how to allow them again.
 */
export function NotificationsCard({ enabled }: { enabled: boolean }) {
  const queryClient = useQueryClient();
  // undefined = still checking; null = this app build can't do push yet.
  const [permission, setPermission] = useState<PushPermission | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    pushPermission()
      .then((value) => live && setPermission(value))
      .catch(() => live && setPermission(null));
    return () => {
      live = false;
    };
  }, []);

  const save = useMutation({
    mutationFn: (next: boolean) => api.setPushNotifications(next),
    onSuccess: ({ pushNotifications }) => {
      queryClient.setQueryData<AccountSettings>(qk.account, (data) => (data ? { ...data, pushNotifications } : data));
      toast.success(pushNotifications ? "Notifications on" : "Notifications off", {
        description: pushNotifications ? "We'll let you know on this phone." : "You won't get push notifications. The bell still shows everything.",
      });
    },
    onError: (err) => toast.error("Couldn't change your notifications", { description: errorMessage(err) }),
  });

  const allow = async () => {
    const next = await askPushPermission().catch(() => null);
    setPermission(next);
    if (next === "granted" && !enabled) save.mutate(true);
  };

  const blocked = permission === "denied";
  return (
    <section aria-labelledby="settings-notifications" className="card px-5 py-6 sm:px-8">
      <div className="flex items-start gap-3">
        <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-tint text-brand [&_svg]:size-5">
          <BellRing />
        </span>
        <div className="min-w-0">
          <h2 id="settings-notifications" className="font-wide text-lg font-extrabold tracking-[-0.01em] text-ink">
            Notifications
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Everything in your bell, on this phone: new followers, stories from reporters you follow, likes, comments,
            messages and press meets.
          </p>
        </div>
      </div>

      <label className="mt-5 flex cursor-pointer items-center justify-between gap-3 rounded-2xl bg-surface-2 px-4 py-3.5">
        <span className="min-w-0">
          <span className="block text-sm font-bold text-ink">Push notifications</span>
          <span className="block text-xs text-muted">{enabled ? "On" : "Off"}</span>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={enabled}
          disabled={save.isPending}
          onChange={(event) => save.mutate(event.target.checked)}
          className={cn(
            "relative h-6 w-11 shrink-0 cursor-pointer appearance-none rounded-full bg-border-strong transition-colors checked:bg-brand disabled:opacity-60",
            "before:absolute before:left-0.5 before:top-0.5 before:size-5 before:rounded-full before:bg-white before:shadow before:transition-transform checked:before:translate-x-5",
          )}
        />
      </label>

      {enabled && permission === null && (
        <p className="mt-3 text-[0.8125rem] leading-snug text-muted">
          Update the WebNEWS app to get notifications on this phone.
        </p>
      )}
      {enabled && blocked && (
        <p className="mt-3 text-[0.8125rem] leading-snug text-brand-strong">
          Notifications are blocked for WebNEWS on this phone. Turn them on in your phone&rsquo;s Settings → Apps → WebNEWS →
          Notifications.
        </p>
      )}
      {enabled && (permission === "prompt" || permission === "prompt-with-rationale") && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-[0.8125rem] leading-snug text-muted">This phone hasn&rsquo;t allowed notifications yet.</p>
          <Button size="sm" onClick={() => void allow()}>
            Allow notifications
          </Button>
        </div>
      )}
    </section>
  );
}
