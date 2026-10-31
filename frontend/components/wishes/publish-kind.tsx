import { Cake, Newspaper } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * The top of the + page for Press Pass holders (owner 2026-10-31): Article (the story composer) or Birthday wish /
 * invitation (the wish composer with all its designs). A link per choice, so each has its own address.
 */
export function PublishKind({ value, className }: { value: "article" | "wish"; className?: string }) {
  const options = [
    { key: "article", href: "/publish", label: "Article", short: "Article", Icon: Newspaper },
    { key: "wish", href: "/publish?type=wish", label: "Birthday wish / invitation", short: "Birthday", Icon: Cake },
  ] as const;
  return (
    <nav aria-label="What are you posting?" className={cn("inline-flex w-full rounded-full bg-surface-2 p-1 sm:w-auto sm:self-start", className)}>
      {options.map(({ key, href, label, short, Icon }) => {
        const on = value === key;
        return (
          <Link
            key={key}
            href={href}
            replace
            aria-current={on ? "page" : undefined}
            className={cn(
              "flex min-w-0 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold transition-all sm:flex-none",
              on ? "bg-surface text-brand shadow-[0_1px_3px_rgb(16_24_40/0.12)]" : "text-muted hover:text-ink",
            )}
          >
            <Icon aria-hidden className="size-4 shrink-0" />
            <span className="truncate sm:hidden">{short}</span>
            <span className="hidden truncate sm:inline">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
