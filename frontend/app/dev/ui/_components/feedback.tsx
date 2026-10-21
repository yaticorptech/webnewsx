"use client";

import { Minus, Newspaper, Plus, UsersRound } from "lucide-react";
import { useState } from "react";
import { SpeedLines } from "@/components/brand/speed-lines";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { IconButton } from "@/components/ui/icon-button";
import { NumberTicker } from "@/components/ui/number-ticker";
import { Skeleton, SkeletonText, StoryCardSkeleton } from "@/components/ui/skeleton";
import { SpeedLinesLoader } from "@/components/ui/speed-lines-loader";
import { Demo, Section } from "./section";

export function FeedbackSection() {
  const [count, setCount] = useState(1234);
  const [countKey, setCountKey] = useState(0);

  return (
    <Section id="feedback" title="Feedback" lead="Loading uses the icon’s three bars; skeletons shimmer; counts roll.">
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <Demo label="Speed-lines loader" className="flex flex-wrap items-end gap-6">
          <SpeedLinesLoader size="xs" />
          <SpeedLinesLoader size="sm" />
          <SpeedLinesLoader size="md" />
          <SpeedLinesLoader size="lg" />
          <SpeedLinesLoader size="xl" />
          <SpeedLinesLoader size="md" className="text-ink" label="Loading (ink)" />
        </Demo>
        <Demo label="Number ticker · roll" className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <IconButton label="Decrease" variant="outline" size="sm" onClick={() => setCount((c) => Math.max(0, c - 1))}>
              <Minus aria-hidden />
            </IconButton>
            <p className="font-wide text-3xl font-extrabold">
              <NumberTicker value={count} format="plain" />
            </p>
            <IconButton label="Increase" variant="outline" size="sm" onClick={() => setCount((c) => c + 1)}>
              <Plus aria-hidden />
            </IconButton>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted">
            <Button variant="ghost" size="sm" onClick={() => setCount((c) => c + 997)}>
              +997
            </Button>
            compact: <NumberTicker value={count} className="font-bold text-ink" />
          </div>
        </Demo>
        <Demo label="Number ticker · count-up (stats band)" surface={false}>
          <div className="panel-tint flex items-center justify-between gap-2 px-4 py-6 text-ink sm:px-5">
            {[
              ["Articles", 48],
              ["Followers", 12840],
              ["Following", 311],
            ].map(([label, value], i) => (
              <div key={label} className="flex items-center gap-2 sm:gap-4">
                {i > 0 && <SpeedLines className="hidden text-[0.9rem] min-[400px]:inline-block" />}
                <div className="text-center">
                  <p className="font-wide text-xl font-black sm:text-2xl">
                    <NumberTicker key={`${label}-${countKey}`} value={value as number} countUp />
                  </p>
                  <p className="kicker text-[0.625rem] tracking-widest text-muted sm:tracking-[0.16em]">{label}</p>
                </div>
              </div>
            ))}
          </div>
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => setCountKey((k) => k + 1)}>
            Replay count-up
          </Button>
        </Demo>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Demo label="Story card skeleton">
          <StoryCardSkeleton className="py-0" />
        </Demo>
        <div className="flex min-w-0 flex-col gap-6">
          <Demo label="Skeleton primitives" className="flex items-center gap-4">
            <Skeleton shape="circle" className="size-12" />
            <SkeletonText lines={3} className="flex-1" />
          </Demo>
          <Demo label="Empty state · md" surface={false}>
            <EmptyState
              icon={<UsersRound aria-hidden />}
              kicker="Following"
              title="Your Following feed is quiet"
              description="Follow a few publishers and their stories land here the moment they go live."
              action={<Button size="md">Find publishers</Button>}
            />
          </Demo>
          <Demo label="Empty state · sm">
            <EmptyState size="sm" icon={<Newspaper aria-hidden />} title="No drafts yet" description="Drafts you save appear here." as="p" />
          </Demo>
        </div>
      </div>
    </Section>
  );
}
