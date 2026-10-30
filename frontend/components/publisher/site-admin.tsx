"use client";

import { BarChart3, Eye, EyeOff, ExternalLink, ImagePlus, KeyRound, LayoutDashboard, LogOut, Megaphone, Newspaper, Plus, Settings, Trash2, Upload, Zap } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { api, errorMessage, isApiError, uploadSiteFile } from "@/lib/api";
import {
  SITE_AD_POSITIONS,
  SITE_LIMITS,
  sitePasswordOk,
  sitePhoneProblem,
  type SiteAd,
  type SiteAdPosition,
  type SiteAdminData,
  type SiteAdminStory,
  type Category,
  type SiteLanguage,
} from "@/lib/shared/contracts";
import { siteUrl } from "@/lib/config";
import { PUB_FONTS } from "./fonts";
import { MenuCard } from "./site-menu-card";
import { CountrySelect, PasswordChecklist, cleanDigits, joinPhone, splitPhone } from "./site-fields";
import { relativeTime } from "./site-parts";

type Tab = "dashboard" | "ads" | "stories" | "settings";
const TABS: { key: Tab; label: string; icon: ReactNode }[] = [
  { key: "dashboard", label: "Dashboard", icon: <LayoutDashboard aria-hidden className="size-4" /> },
  { key: "ads", label: "Advertisements", icon: <Megaphone aria-hidden className="size-4" /> },
  { key: "stories", label: "Stories", icon: <Newspaper aria-hidden className="size-4" /> },
  { key: "settings", label: "Site settings", icon: <Settings aria-hidden className="size-4" /> },
];

const tokenKey = (domain: string) => `wn_site_admin:${domain}`;
function readToken(domain: string): string | null {
  try {
    return window.localStorage.getItem(tokenKey(domain));
  } catch {
    return null;
  }
}
function writeToken(domain: string, token: string | null) {
  try {
    if (token) window.localStorage.setItem(tokenKey(domain), token);
    else window.localStorage.removeItem(tokenKey(domain));
  } catch {
    /* private mode: the session lasts this page only */
  }
}

const input =
  "h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-pub-ink outline-none transition focus:border-pub focus:ring-2 focus:ring-pub/15";
const primary =
  "inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-pub px-5 text-sm font-bold text-white transition hover:bg-pub-dark disabled:cursor-not-allowed disabled:opacity-60";
const secondary =
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 transition hover:border-pub hover:text-pub disabled:opacity-60";

/**
 * `<domain>/admin` (owner 2026-10-29): the site's own admin — a separate email + password set during setup. Ads (the
 * webnews.in positions, managed like its admin's Ad slots), the stories on the site (hide / Breaking), site settings.
 */
const noopSubscribe = () => () => {};

export function SiteAdmin({ domain }: { domain: string }) {
  // The saved token (read after hydration); `override` once they log in / out here.
  const ready = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const stored = useSyncExternalStore(noopSubscribe, () => readToken(domain), () => null);
  const [override, setOverride] = useState<string | null | undefined>(undefined);
  const token = override === undefined ? stored : override;
  const setToken = (next: string | null) => {
    writeToken(domain, next);
    setOverride(next);
  };
  const [data, setData] = useState<SiteAdminData | null>(null);
  const [tab, setTab] = useState<Tab>("dashboard");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloads, setReloads] = useState(0);

  const signOut = useCallback(() => {
    writeToken(domain, null);
    setOverride(null);
    setData(null);
  }, [domain]);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    api.sites
      .admin(domain, token)
      .then((next) => {
        if (!alive) return;
        setData(next);
        setLoadError(null);
      })
      .catch((error) => {
        if (!alive) return;
        if (isApiError(error) && error.status === 401) signOut();
        else setLoadError(errorMessage(error));
      });
    return () => {
      alive = false;
    };
  }, [domain, token, signOut, reloads]);
  const load = async () => setReloads((n) => n + 1);

  if (!ready) return null;
  if (!token) {
    return (
      <LoginScreen domain={domain} onToken={setToken} />
    );
  }

  return (
    <div className={`${PUB_FONTS} min-h-dvh bg-gray-50 font-pub-sans text-pub-ink`}>
      <header className="sticky top-0 z-30 border-b border-gray-200 bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4">
          {data?.site.logoUrl ? (
            <img src={data.site.logoUrl} alt="" className="h-9 w-auto max-w-[140px] object-contain" />
          ) : null}
          <div className="min-w-0">
            <p className="truncate font-pub-head text-lg font-extrabold leading-tight">{data?.site.title ?? domain}</p>
            <p className="text-[11px] font-bold uppercase tracking-widest text-pub">Admin</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <a href="/" target="_blank" rel="noopener" className={`${secondary} max-sm:px-3`}>
              <ExternalLink aria-hidden className="size-4" />
              <span className="max-sm:hidden">View site</span>
            </a>
            <button type="button" onClick={signOut} className={`${secondary} max-sm:px-3`}>
              <LogOut aria-hidden className="size-4" />
              <span className="max-sm:hidden">Log out</span>
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 [scrollbar-width:none]">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              aria-current={tab === t.key ? "page" : undefined}
              className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-semibold transition ${
                tab === t.key ? "border-pub text-pub" : "border-transparent text-gray-600 hover:text-pub"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        {loadError && <p className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</p>}
        {!data ? (
          <div className="h-48 animate-pulse rounded-xl bg-white" />
        ) : tab === "dashboard" ? (
          <Dashboard data={data} onTab={setTab} />
        ) : tab === "ads" ? (
          <AdsPanel domain={domain} token={token} ads={data.ads} onChange={load} />
        ) : tab === "stories" ? (
          <StoriesPanel domain={domain} token={token} />
        ) : (
          <SettingsPanel
            domain={domain}
            token={token}
            data={data}
            onSaved={setData}
            onToken={setToken}
          />
        )}
      </main>
    </div>
  );
}

function LoginScreen({ domain, onToken }: { domain: string; onToken: (token: string) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onToken((await api.sites.login(domain, { email, password })).token);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`${PUB_FONTS} flex min-h-dvh items-center justify-center bg-gray-50 px-4 font-pub-sans text-pub-ink`}>
      <form onSubmit={(e) => void submit(e)} className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-7 shadow-sm">
        <p className="text-[11px] font-bold uppercase tracking-widest text-pub">{domain}</p>
        <h1 className="mt-1 font-pub-head text-3xl font-extrabold">Admin login</h1>
        <p className="mt-1 text-sm text-gray-500">Use the admin email and password set up for this site.</p>
        <label className="mt-6 block text-sm font-semibold">
          Email
          <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className={`${input} mt-1.5`} />
        </label>
        <label className="mt-4 block text-sm font-semibold">
          Password
          <SecretInput autoComplete="current-password" required value={password} onChange={setPassword} />
        </label>
        {error && <p className="mt-4 text-sm font-semibold text-pub">{error}</p>}
        <button type="submit" disabled={busy} className={`${primary} mt-6 w-full`}>
          {busy ? "Logging in…" : "Log in"}
        </button>
        <p className="mt-4 text-center text-xs text-gray-400">Forgot it? The site&apos;s owner can set a new one on WebNEWS.</p>
      </form>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-500">
        {icon}
        {label}
      </div>
      <p className="mt-2 font-pub-head text-4xl font-extrabold tabular-nums">{value}</p>
    </div>
  );
}

function Dashboard({ data, onTab }: { data: SiteAdminData; onTab: (tab: Tab) => void }) {
  const fmt = (n: number) => n.toLocaleString("en-IN");
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat icon={<Newspaper aria-hidden className="size-4" />} label="Stories" value={fmt(data.stats.stories)} />
        <Stat icon={<BarChart3 aria-hidden className="size-4" />} label="Total views" value={fmt(data.stats.views)} />
        <Stat icon={<Megaphone aria-hidden className="size-4" />} label="Live ads" value={fmt(data.stats.activeAds)} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <button type="button" onClick={() => onTab("ads")} className="rounded-xl border border-gray-200 bg-white p-5 text-left transition hover:border-pub">
          <Megaphone aria-hidden className="size-6 text-pub" />
          <p className="mt-3 font-pub-head text-xl font-extrabold">Run an ad</p>
          <p className="mt-1 text-sm text-gray-500">Put an image or video ad in any of the {SITE_AD_POSITIONS.length} positions on your site.</p>
        </button>
        <button type="button" onClick={() => onTab("stories")} className="rounded-xl border border-gray-200 bg-white p-5 text-left transition hover:border-pub">
          <Zap aria-hidden className="size-6 text-pub" />
          <p className="mt-3 font-pub-head text-xl font-extrabold">Breaking news</p>
          <p className="mt-1 text-sm text-gray-500">Mark stories as Breaking to lead the home page and the ticker, or hide one from the site.</p>
        </button>
      </div>
    </div>
  );
}

/* ─────────────── Advertisements ─────────────── */

function runsUntil(iso: string | null): string {
  if (!iso) return "No end date";
  const end = new Date(iso);
  const when = end.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  const days = Math.ceil((end.getTime() - Date.now()) / 86_400_000);
  if (days < 0) return `Ended ${when}`;
  if (days === 0) return `Ends today (${when})`;
  return `Until ${when} · ${days} day${days > 1 ? "s" : ""} left`;
}

const isLive = (ad: SiteAd) => new Date(ad.startsAt) <= new Date() && (!ad.endsAt || new Date(ad.endsAt) > new Date());

function AdsPanel({ domain, token, ads, onChange }: { domain: string; token: string; ads: SiteAd[]; onChange: () => Promise<void> }) {
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const remove = async (ad: SiteAd) => {
    if (!window.confirm(`Remove "${ad.title}" from your site?`)) return;
    setRemoving(ad.id);
    try {
      await api.sites.removeAd(domain, token, ad.id);
      await onChange();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-pub-head text-3xl font-extrabold">Advertisements</h1>
          <p className="mt-1 text-sm text-gray-500">Several ads in one position take turns every few seconds.</p>
        </div>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className={primary}>
            <Plus aria-hidden className="size-4" /> New ad
          </button>
        )}
      </div>
      {error && <p className="text-sm font-semibold text-pub">{error}</p>}
      {adding && (
        <AdForm
          domain={domain}
          token={token}
          onCancel={() => setAdding(false)}
          onSaved={async () => {
            setAdding(false);
            await onChange();
          }}
        />
      )}

      {SITE_AD_POSITIONS.map((position) => {
        const here = ads.filter((ad) => ad.position === position.key);
        return (
          <section key={position.key} className="rounded-xl border border-gray-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-5 py-3">
              <div>
                <h2 className="text-sm font-bold">{position.label}</h2>
                <p className="text-xs text-gray-500">
                  {position.recW}×{position.recH}px · {position.ratio.replace(/ /g, "")}
                  {position.video ? " · image or video" : " · image"}
                </p>
              </div>
              <span className="text-xs font-semibold text-gray-500">{here.filter(isLive).length} live</span>
            </div>
            {here.length === 0 ? (
              <p className="px-5 py-4 text-sm text-gray-400">No ads here.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {here.map((ad) => (
                  <li key={ad.id} className="flex items-center gap-4 px-5 py-3">
                    <AdThumb ad={ad} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{ad.title}</p>
                      <p className={`text-xs ${isLive(ad) ? "text-green-700" : "text-gray-400"}`}>
                        {new Date(ad.startsAt) > new Date() ? `Starts ${new Date(ad.startsAt).toLocaleDateString("en-IN")}` : runsUntil(ad.endsAt)}
                      </p>
                      {ad.targetUrl && <p className="truncate text-xs text-gray-400">{ad.targetUrl}</p>}
                    </div>
                    <button type="button" onClick={() => void remove(ad)} disabled={removing === ad.id} className={secondary} aria-label={`Remove ${ad.title}`}>
                      <Trash2 aria-hidden className="size-4" />
                      <span className="max-sm:hidden">Remove</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function AdThumb({ ad }: { ad: Pick<SiteAd, "creativeUrl" | "video"> }) {
  const box = "h-12 w-20 shrink-0 rounded-md border border-gray-200";
  if (!ad.creativeUrl) return <div className={`${box} flex items-center justify-center bg-gray-50 text-[10px] font-semibold uppercase text-gray-400`}>Text</div>;
  if (ad.video) return <video src={ad.creativeUrl} muted playsInline preload="metadata" className={`${box} bg-black object-cover`} />;
  return <img src={ad.creativeUrl} alt="" className={`${box} bg-white object-contain`} />;
}

const today = () => new Date().toISOString().slice(0, 10);

function AdForm({ domain, token, onCancel, onSaved }: { domain: string; token: string; onCancel: () => void; onSaved: () => Promise<void> }) {
  const [position, setPosition] = useState<SiteAdPosition>("hero-right");
  const [title, setTitle] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [start, setStart] = useState(today());
  const [end, setEnd] = useState("");
  const [creative, setCreative] = useState<{ url: string; key: string; video: boolean } | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const spec = SITE_AD_POSITIONS.find((p) => p.key === position)!;

  const upload = async (file: File) => {
    if (file.type === "video/mp4" && !spec.video) {
      setError("This position takes images only.");
      return;
    }
    setError(null);
    setProgress(0);
    try {
      setCreative(await uploadSiteFile(domain, token, file, setProgress));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setProgress(null);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.sites.addAd(domain, token, {
        position,
        title,
        creativeUrl: creative?.url ?? null,
        creativeKey: creative?.key ?? null,
        video: creative?.video ?? false,
        targetUrl,
        startsAt: new Date(`${start}T00:00:00`).toISOString(),
        endsAt: end ? new Date(`${end}T23:59:59`).toISOString() : null,
      });
      await onSaved();
    } catch (err) {
      setError(isApiError(err) && err.fields ? Object.values(err.fields)[0]! : errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="grid gap-5 rounded-xl border-2 border-pub/30 bg-white p-5 sm:grid-cols-2">
      <label className="block text-sm font-semibold sm:col-span-2">
        Position
        <select value={position} onChange={(e) => setPosition(e.target.value as SiteAdPosition)} className={`${input} mt-1.5`}>
          {SITE_AD_POSITIONS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs font-normal text-gray-500">
          Best size {spec.recW}×{spec.recH}px{spec.video ? " · image or MP4 video" : " · image only"}
        </span>
      </label>
      <label className="block text-sm font-semibold">
        Ad name
        <input required maxLength={SITE_LIMITS.adTitleMax} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Diwali sale — City Mall" className={`${input} mt-1.5`} />
      </label>
      <label className="block text-sm font-semibold">
        Link (optional)
        <input type="url" value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} placeholder="https://" className={`${input} mt-1.5`} />
      </label>
      <label className="block text-sm font-semibold">
        Start
        <input type="date" required value={start} onChange={(e) => setStart(e.target.value)} className={`${input} mt-1.5`} />
      </label>
      <label className="block text-sm font-semibold">
        End (optional)
        <input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} className={`${input} mt-1.5`} />
      </label>
      <div className="sm:col-span-2">
        <p className="text-sm font-semibold">Creative</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-4">
          {creative ? <AdThumb ad={{ creativeUrl: creative.url, video: creative.video }} /> : null}
          <input
            ref={fileRef}
            type="file"
            accept={spec.video ? "image/*,video/mp4" : "image/*"}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void upload(file);
            }}
          />
          <button type="button" onClick={() => fileRef.current?.click()} disabled={progress !== null} className={secondary}>
            <Upload aria-hidden className="size-4" />
            {progress !== null ? `Uploading ${Math.round(progress * 100)}%` : creative ? "Replace" : "Upload image / video"}
          </button>
          {creative && (
            <button type="button" onClick={() => setCreative(null)} className="text-sm font-semibold text-gray-500 hover:text-pub">
              Remove
            </button>
          )}
        </div>
        <p className="mt-1 text-xs text-gray-500">No creative: the ad shows its name as text.</p>
      </div>
      {error && <p className="text-sm font-semibold text-pub sm:col-span-2">{error}</p>}
      <div className="flex gap-2 sm:col-span-2">
        <button type="submit" disabled={busy || progress !== null} className={primary}>
          {busy ? "Saving…" : "Publish ad"}
        </button>
        <button type="button" onClick={onCancel} className={secondary}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/* ─────────────── Stories ─────────────── */

function StoriesPanel({ domain, token }: { domain: string; token: string }) {
  const [stories, setStories] = useState<SiteAdminStory[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    api.sites
      .stories(domain, token)
      .then((r) => setStories(r.stories))
      .catch((err) => setError(errorMessage(err)));
  }, [domain, token]);

  const set = async (story: SiteAdminStory, flags: { hidden?: boolean; breaking?: boolean }) => {
    setBusy(story.id);
    try {
      setStories((await api.sites.setStory(domain, token, story.id, flags)).stories);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-pub-head text-3xl font-extrabold">Stories</h1>
          <p className="mt-1 text-sm text-gray-500">Published on WebNEWS. Breaking stories lead your home page and the ticker; hidden ones stay on WebNEWS only.</p>
        </div>
        {/* Owner 2026-10-30: write in the WebNEWS composer (signed in as the site's WebNEWS account); the story then shows
            on WebNEWS and on this site at once. */}
        <a
          href={`${siteUrl}/publish`}
          target="_blank"
          rel="noopener"
          className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-pub px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-pub-dark max-sm:w-full max-sm:justify-center"
        >
          <Plus aria-hidden className="size-4" strokeWidth={2.5} />
          Post a new story
        </a>
      </div>
      <p className="-mt-1 text-xs text-gray-500">
        Opens the WebNEWS composer in a new tab — sign in there with the WebNEWS account behind this site. Published stories appear here and on your
        site automatically.
      </p>
      {error && <p className="text-sm font-semibold text-pub">{error}</p>}
      {!stories ? (
        <div className="h-48 animate-pulse rounded-xl bg-white" />
      ) : stories.length === 0 ? (
        <p className="rounded-xl border border-gray-200 bg-white px-5 py-10 text-center text-sm text-gray-500">No published stories yet.</p>
      ) : (
        <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
          {stories.map((story) => (
            <li key={story.id} className={`flex items-center gap-4 px-4 py-3 ${story.hidden ? "opacity-60" : ""}`}>
              <div className="h-12 w-20 shrink-0 rounded bg-gray-100 bg-cover bg-center" style={story.coverUrl ? { backgroundImage: `url(${story.coverUrl})` } : undefined} />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm font-semibold">{story.title}</p>
                <p className="text-xs text-gray-500">
                  {relativeTime(story.publishedAt, "en")} · {story.viewCount.toLocaleString("en-IN")} views
                  {story.breaking && <span className="ml-2 rounded bg-pub px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">Breaking</span>}
                  {story.hidden && <span className="ml-2 rounded bg-gray-200 px-1.5 py-0.5 text-[10px] font-bold uppercase text-gray-600">Hidden</span>}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  disabled={busy === story.id || story.hidden}
                  onClick={() => void set(story, { breaking: !story.breaking })}
                  className={`${secondary} ${story.breaking ? "border-pub text-pub" : ""} max-sm:px-3`}
                  aria-pressed={story.breaking}
                >
                  <Zap aria-hidden className="size-4" />
                  <span className="max-sm:hidden">{story.breaking ? "Breaking" : "Mark breaking"}</span>
                </button>
                <button type="button" disabled={busy === story.id} onClick={() => void set(story, { hidden: !story.hidden, ...(story.hidden ? {} : { breaking: false }) })} className={`${secondary} max-sm:px-3`}>
                  {story.hidden ? <Eye aria-hidden className="size-4" /> : <EyeOff aria-hidden className="size-4" />}
                  <span className="max-sm:hidden">{story.hidden ? "Show" : "Hide"}</span>
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ─────────────── Settings ─────────────── */

function SettingsPanel({
  domain,
  token,
  data,
  onSaved,
  onToken,
}: {
  domain: string;
  token: string;
  data: SiteAdminData;
  onSaved: (data: SiteAdminData) => void;
  onToken: (token: string) => void;
}) {
  const [form, setForm] = useState({
    title: data.site.title,
    tagline: data.site.tagline ?? "",
    city: data.site.city ?? "",
    contactEmail: data.site.contactEmail ?? "",
    phoneCode: splitPhone(data.site.contactPhone ?? "").code,
    phoneDigits: splitPhone(data.site.contactPhone ?? "").digits,
    address: data.site.address ?? "",
  });
  const [logo, setLogo] = useState<{ url: string | null; key: string | null }>({ url: data.site.logoUrl, key: null });
  const [navCategories, setNavCategories] = useState<Category[] | null>(data.navCategories);
  const [language, setLanguage] = useState<SiteLanguage>(data.site.language);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const uploadLogo = async (file: File) => {
    setUploading(true);
    try {
      const up = await uploadSiteFile(domain, token, file, undefined, "logo");
      setLogo({ url: up.url, key: up.key });
    } catch (err) {
      setMessage(errorMessage(err));
    } finally {
      setUploading(false);
    }
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    const { phoneCode, phoneDigits, ...rest } = form;
    const contactPhone = joinPhone(phoneCode, phoneDigits);
    const phoneProblem = contactPhone ? sitePhoneProblem(contactPhone) : null;
    // Logo, title and tagline are required (owner 2026-10-30).
    const missing = !logo.url ? "Add your logo" : rest.title.trim().length < 2 ? "Add your site's title" : rest.tagline.trim().length < 2 ? "Add your tagline" : null;
    if (missing || phoneProblem) {
      setMessage(missing ?? phoneProblem);
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      onSaved(await api.sites.saveSettings(domain, token, { ...rest, contactPhone, logoUrl: logo.url ?? "", logoKey: logo.key, navCategories, language }));
      setMessage("Saved");
    } catch (err) {
      setMessage(isApiError(err) && err.fields ? Object.values(err.fields)[0]! : errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-8">
      <form onSubmit={(e) => void save(e)} className="rounded-xl border border-gray-200 bg-white p-5">
        <h1 className="font-pub-head text-3xl font-extrabold">Site settings</h1>
        <div className="mt-5 flex flex-wrap items-center gap-4">
          <div className="flex h-16 min-w-32 items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3">
            {logo.url ? (
              <img src={logo.url} alt="Logo" className="h-12 w-auto max-w-[200px] object-contain" />
            ) : (
              <span className="text-xs text-gray-400">No logo</span>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void uploadLogo(file);
            }}
          />
          <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className={secondary}>
            <ImagePlus aria-hidden className="size-4" />
            {uploading ? "Uploading…" : logo.url ? "Change logo" : "Add logo"}
          </button>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-semibold">
            Title <span className="text-pub">*</span>
            <input required maxLength={SITE_LIMITS.titleMax} value={form.title} onChange={set("title")} className={`${input} mt-1.5`} />
          </label>
          <label className="block text-sm font-semibold">
            Tagline <span className="text-pub">*</span>
            <input required minLength={2} maxLength={SITE_LIMITS.taglineMax} value={form.tagline} onChange={set("tagline")} className={`${input} mt-1.5`} />
          </label>
          <label className="block text-sm font-semibold">
            City (weather)
            <input maxLength={SITE_LIMITS.cityMax} value={form.city} onChange={set("city")} placeholder="e.g. Mangaluru" className={`${input} mt-1.5`} />
          </label>
          <label className="block text-sm font-semibold">
            Contact phone
            <span className={`${input} mt-1.5 flex items-center gap-2 focus-within:border-pub focus-within:ring-2 focus-within:ring-pub/15`}>
              <CountrySelect
                value={form.phoneCode}
                onChange={(code) => setForm((f) => ({ ...f, phoneCode: code, phoneDigits: cleanDigits(code, f.phoneDigits) }))}
                className="text-sm text-pub-ink"
              />
              <input
                type="tel"
                inputMode="numeric"
                value={form.phoneDigits}
                onChange={(e) => setForm((f) => ({ ...f, phoneDigits: cleanDigits(f.phoneCode, e.target.value) }))}
                placeholder={form.phoneCode === "+91" ? "98765 43210" : "Mobile number"}
                className="min-w-0 flex-1 bg-transparent font-normal outline-none"
              />
            </span>
            {form.phoneCode === "+91" && <span className="mt-1 block text-xs font-normal text-gray-500">{form.phoneDigits.length}/10 digits</span>}
          </label>
          <label className="block text-sm font-semibold sm:col-span-2">
            Contact email
            <input type="email" value={form.contactEmail} onChange={set("contactEmail")} className={`${input} mt-1.5`} />
          </label>
          <label className="block text-sm font-semibold sm:col-span-2">
            Address
            <textarea maxLength={SITE_LIMITS.addressMax} rows={3} value={form.address} onChange={set("address")} className={`${input} mt-1.5 h-auto py-2`} />
          </label>
        </div>
        {/* The menu and language (owner 2026-10-30: "choose categories to display in navbar" here too). */}
        <div className="mt-6">
          <MenuCard
            posted={data.postedCategories}
            chosen={navCategories}
            onChosen={setNavCategories}
            language={language}
            onLanguage={setLanguage}
          />
        </div>
        <div className="mt-5 flex items-center gap-3">
          <button type="submit" disabled={busy || uploading} className={primary}>
            {busy ? "Saving…" : "Save"}
          </button>
          {message && <span className={`text-sm font-semibold ${message === "Saved" ? "text-green-700" : "text-pub"}`}>{message}</span>}
        </div>
      </form>
      <PasswordForm domain={domain} token={token} email={data.adminEmail} onToken={onToken} />
    </div>
  );
}

function PasswordForm({ domain, token, email, onToken }: { domain: string; token: string; email: string; onToken: (token: string) => void }) {
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!sitePasswordOk(newPassword)) {
      setMessage("The new password doesn't meet every rule");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      onToken((await api.sites.changePassword(domain, token, { currentPassword, newPassword })).token);
      setCurrent("");
      setNext("");
      setMessage("Password changed");
    } catch (err) {
      setMessage(isApiError(err) && err.fields ? Object.values(err.fields)[0]! : errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="flex items-center gap-2 font-pub-head text-2xl font-extrabold">
        <KeyRound aria-hidden className="size-5 text-pub" /> Admin password
      </h2>
      <p className="mt-1 text-sm text-gray-500">Admin email: {email}</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-semibold">
          Current password
          <SecretInput autoComplete="current-password" required value={currentPassword} onChange={setCurrent} />
        </label>
        <label className="block text-sm font-semibold">
          New password
          <SecretInput autoComplete="new-password" required value={newPassword} onChange={setNext} />
        </label>
      </div>
      {newPassword && <PasswordChecklist value={newPassword} className="mt-3" />}
      <div className="mt-5 flex items-center gap-3">
        <button type="submit" disabled={busy} className={primary}>
          {busy ? "Saving…" : "Change password"}
        </button>
        {message && <span className={`text-sm font-semibold ${message === "Password changed" ? "text-green-700" : "text-pub"}`}>{message}</span>}
      </div>
    </form>
  );
}

/** A password field with show / hide (owner 2026-10-30). */
function SecretInput({ value, onChange, autoComplete, required }: { value: string; onChange: (value: string) => void; autoComplete: string; required?: boolean }) {
  const [visible, setVisible] = useState(false);
  return (
    <span className={`${input} mt-1.5 flex items-center gap-2 pr-1 focus-within:border-pub focus-within:ring-2 focus-within:ring-pub/15`}>
      <input
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        autoCapitalize="none"
        spellCheck={false}
        required={required}
        maxLength={SITE_LIMITS.passwordMax}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 flex-1 bg-transparent font-normal outline-none"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className="flex size-9 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-pub-ink"
      >
        {visible ? <EyeOff aria-hidden className="size-4" /> : <Eye aria-hidden className="size-4" />}
      </button>
    </span>
  );
}
