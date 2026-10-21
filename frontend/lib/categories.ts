import {
  BriefcaseBusiness,
  Clapperboard,
  Cpu,
  Film,
  Flag,
  Flame,
  Gavel,
  Globe,
  GraduationCap,
  House,
  IndianRupee,
  Landmark,
  LayoutGrid,
  MapPin,
  Megaphone,
  MoonStar,
  Shapes,
  Trophy,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { CATEGORY_LABELS, categoryPath, type Category } from "@/lib/shared/contracts";

/*
 * The category nav (owner 2026-09-26, design "C · Icon chips"): Home · Following · the main sections ·
 * Karnataka ▾ (31 districts) · Astrology · More ▾. Labels and slugs come from the shared contract; the
 * icons live here (UI only).
 */

export const CATEGORY_ICONS: Record<Category, LucideIcon> = {
  national: Flag,
  world: Globe,
  sports: Trophy,
  entertainment: Clapperboard,
  technology: Cpu,
  karnataka: MapPin,
  astrology: MoonStar,
  business: IndianRupee,
  crime: Gavel,
  education: GraduationCap,
  cinema: Film,
  others: Shapes,
  politics: Landmark,
  "press-releases": Megaphone,
  jobs: BriefcaseBusiness,
};

export type NavKey = "home" | "following" | "trending" | Category;
export type NavItem = { key: NavKey; label: string; href: string; icon: LucideIcon };

const categoryItem = (category: Category): NavItem => ({
  key: category,
  label: CATEGORY_LABELS[category],
  href: categoryPath(category),
  icon: CATEGORY_ICONS[category],
});

export const NAV_HOME: NavItem = { key: "home", label: "Home", href: "/", icon: House };
export const NAV_FOLLOWING: NavItem = { key: "following", label: "Following", href: "/?tab=following", icon: UsersRound };
/** Trending isn't a category: it opens the automatic "most read right now" list. */
export const NAV_TRENDING: NavItem = { key: "trending", label: "Trending", href: "/trending", icon: Flame };

/** The "More" chip's own icon (it borrows the section's icon while one of its sections is open). */
export const MORE_ICON: LucideIcon = LayoutGrid;

/** Chips in the row (Karnataka opens the district panel). */
export const NAV_MAIN: readonly NavItem[] = (["national", "world", "sports", "entertainment", "technology", "karnataka", "astrology"] as const).map(
  categoryItem,
);
/** The "More" panel, in the owner's order. */
export const NAV_MORE: readonly NavItem[] = [
  ...(["business", "crime", "education", "cinema", "others", "politics", "press-releases"] as const).map(categoryItem),
  NAV_TRENDING,
  categoryItem("jobs"),
];
