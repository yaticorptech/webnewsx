import { viewCopy, type FeedView } from "./feed-views";

/**
 * The feed section's heading. Visually hidden: the masthead's category nav already shows where you are and
 * the ticker's LIVE pill the realtime status, so a visible repeat would only push the first story down.
 */
export function FeedHeader({ view }: { view: FeedView }) {
  return (
    <h1 id="feed-heading" className="sr-only">
      {viewCopy(view).heading}
    </h1>
  );
}
