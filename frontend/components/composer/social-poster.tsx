"use client";

import { posterJpeg } from "@/components/poster/poster-jpeg";
import { toPosterStory } from "@/components/poster/story-poster";
import { api } from "@/lib/api";
import type { ArticleCard } from "@/lib/shared/contracts";

/**
 * Auto-posting (owner 2026-09-30): right after a verified reporter publishes, their connected Instagram / Facebook Page
 * get the story's poster exactly as the feed shows it (with the small WebNEWS mark, owner 2026-10-05), drawn off
 * screen at 1080 × 1920 and sent to the backend, which posts it. Only when auto-posts are waiting; best effort (if this
 * fails, the backend uses the story's cover after a couple of minutes).
 */
export async function sendSocialPoster(story: ArticleCard): Promise<void> {
  const { wanted } = await api.social.posterWanted(story.id);
  if (!wanted) return;
  await api.social.uploadPoster(story.id, await posterJpeg(story.template, toPosterStory(story)));
}
