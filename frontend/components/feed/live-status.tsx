"use client";

import { useRealtimeStatus } from "@/components/providers/realtime-provider";
import { PulseDot } from "@/components/ui/pulse-dot";

/** "● Live" when the realtime stream is connected (stories arrive without a refresh). */
export function LiveStatus() {
  const status = useRealtimeStatus();
  const live = status === "open";
  return (
    <span className="flex items-center gap-1.5 text-[0.6875rem] font-bold uppercase tracking-[0.14em] text-muted">
      <PulseDot size="xs" pulse={live} tone={live ? "brand" : "ink"} />
      {live ? "Live" : status === "reconnecting" ? "Reconnecting…" : "Connecting…"}
    </span>
  );
}
