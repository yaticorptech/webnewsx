"use client";

import { useEffect, useState } from "react";
import type { SiteLanguage } from "@/lib/shared/contracts";
import { WEATHER_KN, tr } from "./site-i18n";

type Weather = { temp: number; code: number; humidity: number; wind: number; hi: number; lo: number; rain: number };

/** WMO weather code → icon + label (webnews.in LocalWidget). */
function describe(code: number): { icon: string; label: string } {
  if (code === 0) return { icon: "☀️", label: "Clear sky" };
  if (code <= 2) return { icon: "🌤️", label: "Partly cloudy" };
  if (code === 3) return { icon: "☁️", label: "Cloudy" };
  if (code <= 48) return { icon: "🌫️", label: "Foggy" };
  if (code <= 57) return { icon: "🌦️", label: "Drizzle" };
  if (code <= 67) return { icon: "🌧️", label: "Rain" };
  if (code <= 82) return { icon: "🌧️", label: "Rain showers" };
  if (code >= 95) return { icon: "⛈️", label: "Thunderstorm" };
  return { icon: "🌡️", label: "Weather" };
}

/**
 * The site's city weather card (webnews.in LocalWidget, keyless Open-Meteo): the city is found by name, then today's
 * conditions. No city set: the card isn't shown.
 */
export function WeatherWidget({ city, lang }: { city: string | null; lang: SiteLanguage }) {
  const [weather, setWeather] = useState<Weather | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!city) return;
    let alive = true;
    (async () => {
      try {
        const geo = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&country=IN`).then((r) => r.json());
        const place = geo?.results?.[0];
        if (!place) throw new Error("no place");
        const d = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&forecast_days=1&timezone=auto`,
        ).then((r) => r.json());
        if (!alive || !d?.current) return;
        setWeather({
          temp: Math.round(d.current.temperature_2m),
          code: d.current.weather_code,
          humidity: Math.round(d.current.relative_humidity_2m),
          wind: Math.round(d.current.wind_speed_10m),
          hi: Math.round(d.daily?.temperature_2m_max?.[0] ?? d.current.temperature_2m),
          lo: Math.round(d.daily?.temperature_2m_min?.[0] ?? d.current.temperature_2m),
          rain: Math.round(d.daily?.precipitation_probability_max?.[0] ?? 0),
        });
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [city]);

  if (!city || failed) return null;
  const found = weather ? describe(weather.code) : null;
  const cond = found ? { ...found, label: lang === "kn" ? (WEATHER_KN[found.label] ?? found.label) : found.label } : null;

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center justify-between gap-3 bg-gradient-to-br from-pub/10 to-pub/5 px-5 py-4">
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wide text-pub">📍 {city}</div>
          <div className="mt-0.5 truncate text-[11px] text-gray-500">{cond ? cond.label : tr(lang, "loading")}</div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-3xl leading-none" aria-hidden>
            {cond?.icon ?? "🌡️"}
          </span>
          <span className="font-pub-head text-3xl font-extrabold tabular-nums text-pub-ink">{weather ? `${weather.temp}°` : "—"}</span>
        </div>
      </div>
      {weather && (
        <>
          <div className="flex items-center justify-around border-b border-gray-100 px-5 py-2 text-[11px] text-gray-500">
            <span>
              💧 {tr(lang, "humidity")} <b className="text-gray-700">{weather.humidity}%</b>
            </span>
            <span className="h-3 w-px bg-gray-200" />
            <span>
              🌬️ {tr(lang, "wind")} <b className="text-gray-700">{weather.wind} km/h</b>
            </span>
          </div>
          <p className="px-5 py-3 text-sm font-medium leading-snug text-pub-ink">
            {cond?.label} · {weather.lo}°–{weather.hi}° · {weather.rain}% {tr(lang, "rainChance")}
          </p>
        </>
      )}
    </div>
  );
}
