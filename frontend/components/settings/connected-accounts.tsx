"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, CircleCheck, Clock } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { FacebookIcon, InstagramIcon } from "@/components/feed/share-glyphs";
import { Button, buttonClasses } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TimeAgo } from "@/components/ui/time-ago";
import { toast } from "@/components/ui/toast";
import { api, errorMessage } from "@/lib/api";
import { isNativeApp, openInPhoneBrowser } from "@/lib/native-app";
import { qk } from "@/lib/query-keys";
import { SOCIAL_PROVIDER_LABELS, type SocialConnection, type SocialProvider, type SocialStatus } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";

const PROVIDERS: { provider: SocialProvider; Icon: (props: { size?: number }) => ReactNode; what: string; needs: string }[] = [
  {
    provider: "instagram",
    Icon: InstagramIcon,
    what: "Each story you publish is posted to your Instagram Story as its poster.",
    needs: "Needs an Instagram Professional account (Business or Creator — free to switch in the Instagram app).",
  },
  {
    provider: "facebook",
    Icon: FacebookIcon,
    what: "Each story you publish is posted to your Facebook Page as a photo with the headline and link.",
    needs: "Needs a Facebook Page you manage (Meta doesn't allow posting to personal profiles).",
  },
];

/**
 * Edit profile → Connected accounts (owner 2026-09-30, verified reporters): Connect Instagram / Connect Facebook, then
 * auto-post every story you publish there. Connect goes through Meta's own login and comes back here with the result
 * (`?social=…&result=…`); each account has an Auto-post switch, the Page choice (Facebook) and Disconnect, and shows
 * how the latest auto-post went.
 */
export function ConnectedAccounts() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  // Refreshes when you come back to the page / the app (after connecting in the phone's browser).
  const status = useQuery({ queryKey: qk.social, queryFn: ({ signal }) => api.social.status(signal), refetchOnWindowFocus: "always" });

  // Back from Meta's login: say how it went, then tidy the address.
  const social = params.get("social");
  const result = params.get("result");
  const reason = params.get("reason");
  useEffect(() => {
    if (!social || !result) return;
    const name = SOCIAL_PROVIDER_LABELS[social as SocialProvider] ?? "Account";
    if (result === "connected") toast.success(`${name} connected`, { id: "social-result", description: "Your next story will be posted there automatically." });
    else if (result === "error") toast.error(`Couldn't connect ${name}`, { id: "social-result", description: reason ?? undefined, duration: 10_000 });
    router.replace(`${pathname}#connected-accounts`, { scroll: false });
    void queryClient.invalidateQueries({ queryKey: qk.social });
  }, [social, result, reason, router, pathname, queryClient]);

  const setStatus = (next: SocialStatus) => queryClient.setQueryData(qk.social, next);
  const update = useMutation({
    mutationFn: ({ provider, ...input }: { provider: SocialProvider; autoPost?: boolean; pageId?: string }) => api.social.update(provider, input),
    onSuccess: setStatus,
    onError: (error) => toast.error("Couldn't save that", { description: errorMessage(error) }),
  });
  const disconnect = useMutation({
    mutationFn: (provider: SocialProvider) => api.social.disconnect(provider),
    onSuccess: (next, provider) => {
      setStatus(next);
      toast(`${SOCIAL_PROVIDER_LABELS[provider]} disconnected`);
    },
    onError: (error) => toast.error("Couldn't disconnect", { description: errorMessage(error) }),
  });

  if (status.data && !status.data.eligible) return null;

  /** The app: a one-time pass, then Meta's login in the phone's browser; the list refreshes when you come back. */
  async function connectInPhoneBrowser(provider: SocialProvider) {
    try {
      const { ticket } = await api.social.ticket(provider);
      await openInPhoneBrowser(`${window.location.origin}${api.social.connectUrl(provider)}?ticket=${encodeURIComponent(ticket)}`);
      toast(`Finish in your browser`, {
        id: "social-browser",
        description: `Log in to ${SOCIAL_PROVIDER_LABELS[provider]} there, then come back to the app.`,
        duration: 8_000,
      });
    } catch (error) {
      toast.error(`Couldn't open ${SOCIAL_PROVIDER_LABELS[provider]}`, { description: errorMessage(error) });
    }
  }

  return (
    <section id="connected-accounts" aria-labelledby="settings-social" className="card scroll-mt-nav px-5 py-6 sm:px-8">
      <h2 id="settings-social" className="font-wide text-lg font-extrabold tracking-[-0.01em] text-ink">
        Connected accounts
      </h2>
      <p className="mt-1 text-[0.9375rem] leading-relaxed text-muted">
        Connect your Instagram and Facebook once — every story you publish on WebNEWS is then posted there automatically.
      </p>

      <ul className="mt-5 flex flex-col gap-3">
        {PROVIDERS.map(({ provider, Icon, what, needs }) => {
          const connection = status.data?.connections.find((c) => c.provider === provider) ?? null;
          const configured = status.data?.configured[provider] ?? false;
          return (
            <li key={provider} className="rounded-2xl border border-border p-4">
              {/* Phones: the button gets its own full-width line under the name; from 640px it sits on the right. */}
              <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
                <span className="flex size-10 shrink-0 items-center justify-center">
                  <Icon size={40} />
                </span>
                <div className="min-w-0">
                  <p className="font-bold text-ink">{SOCIAL_PROVIDER_LABELS[provider]}</p>
                  {status.isPending ? (
                    <Skeleton className="mt-1 h-3.5 w-40 rounded-sm" />
                  ) : connection ? (
                    <p className="truncate text-[0.8125rem] font-semibold text-ink-2">
                      {provider === "instagram" ? `@${connection.accountName}` : connection.accountName}
                    </p>
                  ) : (
                    <p className="text-[0.8125rem] text-muted">Not connected</p>
                  )}
                </div>
                {status.isPending ? null : connection ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="col-span-2 w-full sm:col-span-1 sm:w-auto"
                    loading={disconnect.isPending && disconnect.variables === provider}
                    onClick={() => {
                      if (window.confirm(`Disconnect ${SOCIAL_PROVIDER_LABELS[provider]}? Stories won't be posted there any more.`)) disconnect.mutate(provider);
                    }}
                  >
                    Disconnect
                  </Button>
                ) : configured ? (
                  // A plain page load (not client routing): the API sends the browser to Meta's login and back here. In the
                  // phone app it opens in the phone's browser instead (Meta blocks its login inside apps).
                  <a
                    href={api.social.connectUrl(provider)}
                    onClick={(event) => {
                      if (!isNativeApp()) return;
                      event.preventDefault();
                      void connectInPhoneBrowser(provider);
                    }}
                    className={buttonClasses({ size: "sm", className: "col-span-2 w-full sm:col-span-1 sm:w-auto" })}
                  >
                    <Icon size={18} />
                    Connect {SOCIAL_PROVIDER_LABELS[provider]}
                  </a>
                ) : (
                  <Button size="sm" disabled leftIcon={<Icon size={18} />} className="col-span-2 w-full sm:col-span-1 sm:w-auto">
                    Connect {SOCIAL_PROVIDER_LABELS[provider]}
                  </Button>
                )}
              </div>

              {connection ? (
                <ConnectionDetails
                  connection={connection}
                  busy={update.isPending}
                  onAutoPost={(autoPost) => update.mutate({ provider, autoPost })}
                  onPage={(pageId) => update.mutate({ provider, pageId })}
                />
              ) : (
                <div className="mt-3 text-[0.8125rem] leading-relaxed text-muted">
                  <p>{what}</p>
                  <p className="mt-1">{needs}</p>
                  {!status.isPending && !configured && (
                    <p className="mt-2 font-semibold text-ink-2">Coming soon — connecting isn&rsquo;t switched on for this site yet.</p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ConnectionDetails({
  connection,
  busy,
  onAutoPost,
  onPage,
}: {
  connection: SocialConnection;
  busy: boolean;
  onAutoPost: (on: boolean) => void;
  onPage: (pageId: string) => void;
}) {
  const last = connection.lastPost;
  return (
    <div className="mt-3 flex flex-col gap-3 border-t border-border pt-3">
      {connection.needsReconnect && (
        <p className="flex items-start gap-2 rounded-xl bg-tint px-3 py-2 text-[0.8125rem] font-semibold text-brand-strong">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          Meta stopped accepting this connection. Disconnect and connect again to keep auto-posting.
        </p>
      )}

      {connection.provider === "facebook" && connection.pages.length > 1 && (
        <label className="flex flex-wrap items-center gap-2 text-[0.8125rem] font-semibold text-ink-2">
          Post to Page
          <select
            value={connection.accountId}
            disabled={busy}
            onChange={(event) => onPage(event.target.value)}
            className="h-9 min-w-0 flex-1 rounded-lg border border-border-strong bg-surface px-2.5 text-sm text-ink outline-none focus:border-brand"
          >
            {connection.pages.map((page) => (
              <option key={page.id} value={page.id}>
                {page.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="flex cursor-pointer items-center justify-between gap-3">
        <span className="text-sm font-semibold text-ink">Auto-post my stories</span>
        <input
          type="checkbox"
          role="switch"
          checked={connection.autoPost}
          disabled={busy}
          onChange={(event) => onAutoPost(event.target.checked)}
          className={cn(
            "relative h-6 w-11 shrink-0 cursor-pointer appearance-none rounded-full bg-border-strong transition-colors checked:bg-brand disabled:opacity-60",
            "before:absolute before:left-0.5 before:top-0.5 before:size-5 before:rounded-full before:bg-white before:shadow before:transition-transform checked:before:translate-x-5",
          )}
        />
      </label>

      {last && (
        <p
          className={cn(
            "flex items-start gap-2 text-[0.8125rem] leading-snug",
            last.status === "failed" ? "text-brand-strong" : last.status === "posted" ? "text-success-strong" : "text-muted",
          )}
        >
          {last.status === "posted" ? (
            <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
          ) : last.status === "failed" ? (
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          ) : (
            <Clock aria-hidden className="mt-0.5 size-4 shrink-0" />
          )}
          <span className="min-w-0">
            {last.status === "posted" ? "Posted" : last.status === "failed" ? "Not posted" : "Posting"} &ldquo;{last.storyTitle}&rdquo;
            {" · "}
            <TimeAgo date={last.at} variant="short" />
            {last.status === "failed" && last.error && <span className="mt-0.5 block text-muted">{last.error}</span>}
          </span>
        </p>
      )}
    </div>
  );
}
