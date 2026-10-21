import { permanentRedirect } from "next/navigation";

/** The section was first called Reels, then Newsy; both are gone (owner 2026-10-05): old links land on Home. */
export default function ReelsRedirect() {
  permanentRedirect("/");
}
