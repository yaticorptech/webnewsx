"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Clock3, Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSun, Moon, Snowflake, Sun, type LucideIcon } from "lucide-react";
import { createElement, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { isFeedPath } from "@/components/feed/feed-views";
import { cn } from "@/lib/utils";

/*
 * The desktop masthead's utility row, left side (owner 2026-10-15, newspaper reference): Edition 🇮🇳 IN · today's date |
 * a live clock (IST) · the weather where the reader is (owner 2026-10-15: no "English" or city name shown).
 *
 * Location (owner's pick): the reader's own, from the browser — but never a permission prompt on page load. If the
 * browser already allowed it, it is used straight away (no prompt is ever shown); otherwise the weather is Mangaluru's
 * (WebNEWS's home). The coordinates (rounded to ~1 km) go to Open-Meteo for the weather and BigDataCloud for the city name —
 * both free, keyless, cookie-less; nothing is sent to our server. The last place is remembered on this device.
 */

const HOME = { lat: 12.91, lon: 74.86, city: "Mangaluru" };
const STORE = "webnews-masthead-place";
const IST = "Asia/Kolkata";
const DATE = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: IST });
const TIME = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", second: "2-digit", hour12: true, timeZone: IST });

/** One shared one-second tick for the clock (the value is the tick's time, so every reader in a second agrees). */
let clockTick = Date.now();
function subscribeClock(listener: () => void) {
  const timer = setInterval(() => {
    clockTick = Date.now();
    listener();
  }, 1000);
  return () => clearInterval(timer);
}

type Place = { lat: number; lon: number; city: string };

const noopSubscribe = () => () => {};

/**
 * The bar's row (owner 2026-10-15): ≥1024px on the front page (Home and the category / language feeds) the newspaper
 * masthead — utility row, then the logo centred; everywhere else one compact row, logo left and icons right
 * (`data-masthead="compact"` gives it the shorter --bar-h, globals.css). Phones: one row everywhere.
 */
export function MastheadRow({ children }: { children: ReactNode }) {
  const front = isFeedPath(usePathname());
  return (
    <div
      data-masthead={front ? "front" : "compact"}
      className={cn(
        "relative flex h-(--bar-h) items-center gap-2 overflow-x-clip px-4 sm:px-6 lg:px-8",
        // A little room above the utility row (owner 2026-10-15: it sat right under the browser's bookmarks bar).
        front ? "lg:grid lg:grid-cols-[minmax(0,1fr)_auto] lg:grid-rows-[2.75rem_minmax(0,1fr)] lg:gap-x-6 lg:gap-y-0 lg:pt-3" : "lg:gap-6",
      )}
    >
      {children}
    </div>
  );
}

export function MastheadUtility() {
  const front = isFeedPath(usePathname());
  const today = useSyncExternalStore(noopSubscribe, () => DATE.format(new Date()), () => "");
  // A live clock, India time (owner 2026-10-15: in place of "Updated …"), ticking every second.
  const now = useSyncExternalStore(subscribeClock, () => TIME.format(new Date(clockTick)), () => "");
  // The place found this visit, else the one remembered on this device, else Mangaluru.
  const savedRaw = useSyncExternalStore(noopSubscribe, readSaved, () => null);
  const [located, setLocated] = useState<Place | null>(null);
  const place = located ?? parsePlace(savedRaw) ?? HOME;

  // Only if the browser already allows it: the current place, without a prompt.
  useEffect(() => {
    let live = true;
    navigator.permissions
      ?.query({ name: "geolocation" })
      .then((status) => {
        if (live && status.state === "granted") locate((next) => live && setLocated(next));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const weather = useQuery({
    queryKey: ["masthead", "weather", place.lat, place.lon],
    queryFn: async ({ signal }) => {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${place.lat}&longitude=${place.lon}&current=temperature_2m,weather_code,is_day`;
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error("weather");
      const data = (await response.json()) as { current?: { temperature_2m?: number; weather_code?: number; is_day?: number } };
      const current = data.current;
      if (typeof current?.temperature_2m !== "number") throw new Error("weather");
      return { temp: Math.round(current.temperature_2m), code: current.weather_code ?? 0, day: current.is_day !== 0 };
    },
    staleTime: 15 * 60_000,
    retry: false,
  });

  // Only the front page has the utility row (owner 2026-10-15).
  if (!front) return null;

  return (
    // A newspaper dateline (owner 2026-10-15: "make this professional"): small caps, quiet icons, hairline dividers.
    <div className="hidden min-w-0 items-center gap-4 text-[0.75rem] text-ink-2 lg:flex">
      <span className="flex min-w-0 items-center gap-1.5 font-semibold uppercase tracking-[0.08em]" suppressHydrationWarning>
        <CalendarDays aria-hidden className="size-3.5 shrink-0 text-muted" />
        <span className="truncate">{today}</span>
      </span>
      {now && (
        <>
          <Divider />
          <span className="flex shrink-0 items-center gap-1.5 text-muted">
            <Clock3 aria-hidden className="size-3.5 shrink-0" />
            <time className="font-semibold tabular-nums text-ink-2">{now.toUpperCase()} IST</time>
          </span>
        </>
      )}
      {weather.data && (
        <>
          <Divider />
          <span className="flex shrink-0 items-center gap-1.5" title={`Weather in ${place.city}`}>
            <WeatherGlyph code={weather.data.code} day={weather.data.day} />
            <span className="font-semibold text-ink">{weather.data.temp}°C</span>
            <span className="text-muted">{place.city}</span>
          </span>
        </>
      )}
    </div>
  );
}

/** Asks the browser for the reader's position (prompts only on a tap), names the town and remembers it. */
function locate(onPlace: (place: Place) => void, done?: () => void) {
  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const lat = Math.round(position.coords.latitude * 100) / 100;
      const lon = Math.round(position.coords.longitude * 100) / 100;
      let city = "Your location";
      try {
        const response = await fetch(
          `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`,
        );
        const data = (await response.json()) as { city?: string; locality?: string };
        city = data.city || data.locality || city;
      } catch {
        // Keep "Your location".
      }
      const place = { lat, lon, city };
      onPlace(place);
      try {
        localStorage.setItem(STORE, JSON.stringify(place));
      } catch {
        // Not remembered; fine.
      }
      done?.();
    },
    () => done?.(),
    { maximumAge: 30 * 60_000, timeout: 10_000 },
  );
}

function Divider() {
  return <span aria-hidden className="h-3.5 w-px shrink-0 bg-border-strong/70" />;
}

function readSaved(): string | null {
  try {
    return localStorage.getItem(STORE);
  } catch {
    return null;
  }
}

function parsePlace(raw: string | null): Place | null {
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw) as Place;
    return typeof saved.lat === "number" && typeof saved.lon === "number" && saved.city ? saved : null;
  } catch {
    return null;
  }
}

function WeatherGlyph({ code, day }: { code: number; day: boolean }) {
  return createElement(weatherIcon(code, day), { "aria-hidden": true, className: "size-4 text-[#f2a33a]" });
}

/** WMO weather code → icon. */
function weatherIcon(code: number, day: boolean): LucideIcon {
  if (code === 0) return day ? Sun : Moon;
  if (code <= 2) return day ? CloudSun : Cloud;
  if (code === 3) return Cloud;
  if (code === 45 || code === 48) return CloudFog;
  if (code >= 51 && code <= 57) return CloudDrizzle;
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return CloudRain;
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return Snowflake;
  if (code >= 95) return CloudLightning;
  return Cloud;
}
