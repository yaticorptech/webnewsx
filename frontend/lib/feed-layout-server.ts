import "server-only";
import { cookies } from "next/headers";
import { FEED_LAYOUT_COOKIE, parseFeedLayout, type FeedLayout } from "./feed-layout";

/** The visitor's feed layout (grid / reel) from their cookie. */
export async function getFeedLayout(): Promise<FeedLayout> {
  return parseFeedLayout((await cookies()).get(FEED_LAYOUT_COOKIE)?.value);
}
