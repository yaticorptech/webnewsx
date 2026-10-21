import type { Metadata } from "next";
import { param, pick } from "@/components/admin/server-loaders";
import { StoriesView, type StoryFilters } from "@/components/admin/stories-view";
import { getAdminPins, getAdminStories } from "@/lib/server-api";
import { requireAdmin } from "@/lib/session";
import { isCategory, type AdminStoryStatusFilter } from "@/lib/shared/contracts";

export const metadata: Metadata = { title: "Stories" };

const STATUSES = ["all", "published", "hidden", "in_review", "returned", "draft"] as const satisfies readonly AdminStoryStatusFilter[];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function AdminStoriesPage({ searchParams }: PageProps<"/admin/stories">) {
  await requireAdmin();
  const sp = await searchParams;
  const from = param(sp.from);
  const to = param(sp.to);
  const category = param(sp.category);
  const filters: StoryFilters = {
    status: pick(param(sp.status), STATUSES, "all"),
    q: param(sp.q)?.slice(0, 100),
    reporter: param(sp.reporter)?.replace(/^@/, "").slice(0, 31),
    category: isCategory(category) ? category : undefined,
    from: from && DATE.test(from) ? from : undefined,
    to: to && DATE.test(to) ? to : undefined,
  };
  // Only the default view is server-rendered; filtered deep links load on the client (the date
  // range needs the same inclusive → exclusive conversion the view applies).
  const isDefault = !filters.q && !filters.reporter && !filters.category && !filters.from && !filters.to;
  const [initial, pins] = await Promise.all([
    isDefault ? getAdminStories({ status: filters.status }) : Promise.resolve(null),
    getAdminPins(),
  ]);
  return <StoriesView initialFilters={filters} initial={initial} initialPins={pins} />;
}
