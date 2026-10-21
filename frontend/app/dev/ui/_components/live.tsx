"use client";

import { Heart, Radio } from "lucide-react";
import { useState } from "react";
import { SpeedLinesBurst, SpeedLinesSweep } from "@/components/brand/speed-lines-motion";
import { TrendingCard } from "@/components/feed/trending-card";
import { Ticker } from "@/components/layout/ticker";
import { useRealtimeEmit, useRealtimeStatus } from "@/components/providers/realtime-provider";
import { Button } from "@/components/ui/button";
import { PulseDot } from "@/components/ui/pulse-dot";
import { DEMO_HEADLINES, makeDemoCard } from "./demo-data";
import { Demo, Section } from "./section";

export function LiveSection() {
  const emit = useRealtimeEmit();
  const status = useRealtimeStatus();
  const [liked, setLiked] = useState(false);
  const [burst, setBurst] = useState(0);
  const [sweep, setSweep] = useState(0);
  const [flash, setFlash] = useState(0);

  return (
    <Section
      id="live"
      title="Live & motion"
      lead="Realtime surfaces update without refresh. “Simulate publish” emits a local article.published event (no network) into the same bus the SSE stream feeds."
    >
      <div className="flex flex-wrap items-center gap-3">
        <Button leftIcon={<Radio aria-hidden />} onClick={() => emit("article.published", makeDemoCard())}>
          Simulate publish
        </Button>
        <span className="flex items-center gap-2 text-sm text-muted">
          <PulseDot size="sm" pulse={status === "open"} tone={status === "open" ? "brand" : "ink"} />
          Stream: <span className="font-bold text-ink">{status}</span>
        </span>
      </div>

      <Demo label="Ticker" surface={false} className="overflow-hidden rounded-2xl border border-border">
        <Ticker initial={DEMO_HEADLINES} />
      </Demo>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="flex min-w-0 flex-col gap-5">
          <TrendingCard />
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          <Demo label="Like pop + speed-lines burst" className="flex items-center gap-4">
            <button
              type="button"
              aria-pressed={liked}
              aria-label={liked ? "Unlike" : "Like"}
              onClick={() => {
                setLiked((v) => !v);
                if (!liked) setBurst((b) => b + 1);
              }}
              className="relative inline-flex size-12 items-center justify-center rounded-full transition-transform hover:bg-surface-2 active:scale-90"
            >
              {burst > 0 && liked && <SpeedLinesBurst key={burst} size={52} />}
              <Heart aria-hidden className={liked ? "size-6 fill-brand text-brand" : "size-6"} />
            </button>
            <p className="text-sm text-muted">Tap the heart.</p>
          </Demo>
          <Demo label="Publish success sweep" className="relative flex min-h-40 items-center justify-center overflow-hidden">
            {sweep > 0 && <SpeedLinesSweep key={sweep} />}
            <div className="relative flex flex-col items-center gap-3">
              <p
                key={`stamp-${sweep}`}
                className="kicker -rotate-6 border-2 border-brand px-3 py-1.5 text-base text-brand-strong animate-fade-up"
              >
                You’re live
              </p>
              <Button variant="outline" size="sm" onClick={() => setSweep((s) => s + 1)}>
                Play sweep
              </Button>
            </div>
          </Demo>
          <Demo label="Realtime insert flash" className="flex flex-col gap-3">
            <div key={flash} className="rounded-lg border border-border px-4 py-3 text-sm font-semibold animate-flash-highlight">
              Newly arrived story row
            </div>
            <Button variant="ghost" size="sm" className="self-start" onClick={() => setFlash((f) => f + 1)}>
              Replay flash
            </Button>
          </Demo>
        </div>
      </div>
    </Section>
  );
}
