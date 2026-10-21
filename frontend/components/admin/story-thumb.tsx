import { SpeedBarsSvg } from "@/components/brand/speed-lines";
import { cn } from "@/lib/utils";

type StoryThumbProps = {
  src: string | null;
  blur?: string | null;
  /** Tailwind size classes (default 16:9, 96px wide). */
  className?: string;
};

/** Small 16:9 cover with the blur placeholder behind it (decorative: the title sits next to it). */
export function StoryThumb({ src, blur, className }: StoryThumbProps) {
  return (
    <span
      aria-hidden
      className={cn("relative block aspect-video w-24 shrink-0 overflow-hidden rounded-lg bg-surface-2 bg-cover bg-center", className)}
      style={blur ? { backgroundImage: `url("${blur}")` } : undefined}
    >
      {src ? (
        <img src={src} alt="" loading="lazy" decoding="async" draggable={false} className="absolute inset-0 size-full object-cover" />
      ) : (
        <SpeedBarsSvg className="absolute left-1/2 top-1/2 w-6 -translate-x-1/2 -translate-y-1/2 text-muted-2 opacity-60" />
      )}
    </span>
  );
}
