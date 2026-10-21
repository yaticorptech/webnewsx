"use client";

import { useEffect, useState } from "react";

let context: AudioContext | null = null;

/** One AudioContext for the speaking indicators (resumed by the Join tap — browsers start it suspended). */
export function levelContext(): AudioContext | null {
  if (typeof AudioContext === "undefined") return null;
  context ??= new AudioContext();
  return context;
}

export function resumeLevels(): void {
  void levelContext()?.resume().catch(() => {});
}

/** True while the stream's audio is above a speaking level (checked 5× a second). */
export function useSpeaking(stream: MediaStream | null, enabled = true): boolean {
  const [speaking, setSpeaking] = useState(false);
  const track = stream?.getAudioTracks()[0] ?? null;
  useEffect(() => {
    const ctx = levelContext();
    if (!ctx || !stream || !track || !enabled) return;
    let source: MediaStreamAudioSourceNode;
    try {
      source = ctx.createMediaStreamSource(new MediaStream([track]));
    } catch {
      return;
    }
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    let quietTicks = 0;
    const timer = setInterval(() => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const value of data) sum += (value - 128) ** 2;
      const rms = Math.sqrt(sum / data.length) / 128;
      if (rms > 0.045) {
        quietTicks = 0;
        setSpeaking(true);
      } else if (++quietTicks > 3) {
        setSpeaking(false);
      }
    }, 200);
    return () => {
      clearInterval(timer);
      source.disconnect();
      analyser.disconnect();
      setSpeaking(false);
    };
  }, [stream, track, enabled]);
  return enabled && track !== null && speaking;
}
