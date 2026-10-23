import type { Metadata } from "next";
import { ExploreView } from "@/components/explore/explore-view";
import { SITE_NAME } from "@/lib/config";

export const metadata: Metadata = {
  title: "Search",
  description: `Search people and stories on ${SITE_NAME}, and explore stories as posters.`,
  alternates: { canonical: "/explore" },
};

/** /explore — search people and stories; below the field, stories as a grid of posters (owner 2026-09-30). */
export default function ExplorePage() {
  return (
    <>
      <h1 className="sr-only">Search and explore WebNEWS</h1>
      <ExploreView />
    </>
  );
}
