"use client";

import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { OwnedArticle } from "@/lib/shared/contracts";
import { Composer } from "./composer";
import type { ComposerAuthor } from "./composer-model";

export type ComposerRootProps = {
  author: ComposerAuthor;
  draft: OwnedArticle | null;
  /** Trainee reporter: "Publish" submits to the Review Desk (SPEC §3.11). */
  review?: boolean;
  /** Written for this press meet: sent to its organizer once published. */
  pressMeetId?: string | null;
  /** A Reader (no Press Pass): the composer shows, but asks for a Press Pass instead of filing. */
  needsPressPass?: boolean;
  /** At the top of the images step: Article | Birthday wish / invitation (owner 2026-10-31). */
  kindSwitch?: ReactNode;
};

/**
 * Route entry for /publish and /publish/[id].
 *
 * The first save of a new story rewrites the URL to /publish/<id> with history.replaceState (no
 * navigation, nothing remounts). If the writer then follows a link back to /publish ("Publish" in
 * the nav), Next reuses this same page, so the composer is remounted blank here.
 */
export function ComposerRoot({ author, draft, review = false, pressMeetId = null, needsPressPass = false, kindSwitch = null }: ComposerRootProps) {
  const pathname = usePathname();
  const [session, setSession] = useState(0);
  const [lastPath, setLastPath] = useState(pathname);

  if (pathname !== lastPath) {
    setLastPath(pathname);
    if (!draft && pathname === "/publish" && lastPath.startsWith("/publish/")) setSession((n) => n + 1);
  }

  return <Composer key={`${draft?.id ?? "new"}:${session}`} author={author} draft={draft} review={review} pressMeetId={pressMeetId} needsPressPass={needsPressPass} kindSwitch={kindSwitch} />;
}
