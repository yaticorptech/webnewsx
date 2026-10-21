"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRealtimeEvent, useRealtimeReconnect } from "@/components/providers/realtime-provider";
import { qk } from "@/lib/query-keys";

/** Keeps every press meet query fresh: refetch on `meet.changed` (only ever the viewer's own) and after reconnects. */
export function usePressMeetLive(): void {
  const queryClient = useQueryClient();
  const refresh = () => void queryClient.invalidateQueries({ queryKey: qk.pressMeetsAll });
  useRealtimeEvent("meet.changed", refresh);
  useRealtimeReconnect(refresh);
}
