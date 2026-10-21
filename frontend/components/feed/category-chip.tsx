import Link from "next/link";
import { CATEGORY_ICONS } from "@/lib/categories";
import { categoryLabel, categoryPath, type Category } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";

export type CategoryChipProps = {
  category: Category;
  /** Karnataka stories: "Mysuru, Karnataka", linking to the district's page. */
  district?: string | null;
  /** Preview: render the label without the link. */
  inert?: boolean;
  className?: string;
};

const CHIP = "kicker inline-flex h-6 min-w-0 max-w-56 items-center gap-1 rounded-full bg-tint pl-1.5 pr-2.5 text-brand";

/** The story's section (icon + red label) → its category page. On feed cards and the article page. */
export function CategoryChip({ category, district = null, inert = false, className }: CategoryChipProps) {
  const Icon = CATEGORY_ICONS[category];
  const content = (
    <>
      <Icon aria-hidden className="size-3.5 shrink-0" strokeWidth={2.5} />
      <span className="truncate">{categoryLabel(category, district)}</span>
    </>
  );
  if (inert) return <span className={cn(CHIP, className)}>{content}</span>;
  return (
    <Link
      href={categoryPath(category, district)}
      className={cn(CHIP, "transition-colors hover:bg-brand hover:text-brand-contrast", className)}
    >
      {content}
    </Link>
  );
}
