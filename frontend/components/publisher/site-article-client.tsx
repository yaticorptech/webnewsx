"use client";

import { Check, Link2 } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { countViewNow, recordArticleRead } from "@/components/feed/view-tracker";

/** The story is open on WebNEWS (owner 2026-10-29: that's why publisher stories open here): count the view and the read. */
export function SiteArticleViews({ id }: { id: string }) {
  useEffect(() => {
    void countViewNow(id);
    recordArticleRead(id);
  }, [id]);
  return null;
}

const noopSubscribe = () => () => {};

/** WhatsApp · Facebook · X · copy link (webnews.in's share row). */
export function SiteShare({ title }: { title: string }) {
  const url = useSyncExternalStore(noopSubscribe, () => window.location.href, () => "");
  const [copied, setCopied] = useState(false);
  if (!url) return null;
  const text = encodeURIComponent(title);
  const link = encodeURIComponent(url);
  const button = "inline-flex h-9 items-center gap-1.5 rounded-full border border-gray-200 px-4 text-sm font-semibold text-gray-700 transition hover:border-pub hover:text-pub";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-1 text-[11px] font-bold uppercase tracking-widest text-gray-400">Share</span>
      <a className={button} href={`https://wa.me/?text=${text}%20${link}`} target="_blank" rel="noopener noreferrer">
        WhatsApp
      </a>
      <a className={button} href={`https://www.facebook.com/sharer/sharer.php?u=${link}`} target="_blank" rel="noopener noreferrer">
        Facebook
      </a>
      <a className={button} href={`https://x.com/intent/post?text=${text}&url=${link}`} target="_blank" rel="noopener noreferrer">
        X
      </a>
      <button
        type="button"
        className={button}
        onClick={() =>
          void navigator.clipboard?.writeText(url).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
          })
        }
      >
        {copied ? <Check aria-hidden className="size-4" /> : <Link2 aria-hidden className="size-4" />}
        {copied ? "Copied" : "Copy link"}
      </button>
    </div>
  );
}
