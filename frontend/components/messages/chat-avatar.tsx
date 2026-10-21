import { Users } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import type { ChatKind, ChatPerson } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";

export type ChatAvatarProps = {
  kind: ChatKind;
  title: string;
  image: string | null;
  peer: ChatPerson | null;
  preview: ChatPerson[];
  size?: number;
  /** Direct chats: the other person is online — a green dot on the photo's lower right. */
  online?: boolean;
  className?: string;
};

/**
 * A chat's picture: the other person's photo (direct), the group / community photo, or — for a group without one —
 * two members' photos overlapping, like Instagram.
 */
export function ChatAvatar({ kind, title, image, peer, preview, size = 48, online = false, className }: ChatAvatarProps) {
  if (kind === "direct") {
    const photo = <Avatar src={peer?.image} name={peer?.name ?? title} size={size} decorative className={online ? undefined : className} />;
    if (!online) return photo;
    // Online (owner 2026-10-01): a green dot ringed in the page colour, sized with the photo; a soft glow lifts it.
    const dot = Math.max(10, Math.round(size * 0.26));
    return (
      <span className={cn("relative inline-block shrink-0", className)} style={{ width: size, height: size }}>
        {photo}
        <span
          aria-hidden
          className="absolute rounded-full bg-success shadow-[0_0_0_2.5px_var(--surface),0_0_10px_rgb(31_138_76/0.55)]"
          style={{ width: dot, height: dot, right: size * 0.02, bottom: size * 0.02 }}
        />
      </span>
    );
  }
  if (image) return <Avatar src={image} name={title} size={size} decorative className={className} />;
  if (kind === "group" && preview.length >= 2) {
    const small = Math.round(size * 0.72);
    return (
      <span className={cn("relative inline-block shrink-0", className)} style={{ width: size, height: size }} aria-hidden>
        <Avatar src={preview[1]?.image} name={preview[1]?.name ?? ""} size={small} decorative className="absolute right-0 top-0" />
        <Avatar
          src={preview[0]?.image}
          name={preview[0]?.name ?? ""}
          size={small}
          decorative
          className="absolute bottom-0 left-0 ring-2 ring-surface"
        />
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-tint-2 text-brand", className)}
      style={{ width: size, height: size }}
    >
      <Users style={{ width: size * 0.45, height: size * 0.45 }} />
    </span>
  );
}
