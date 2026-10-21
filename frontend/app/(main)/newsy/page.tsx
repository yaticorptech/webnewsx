import { redirect } from "next/navigation";

/**
 * Newsy was removed (owner 2026-10-05): the 9:16 reels are now a layout of Home and every category, picked with the
 * switch beside Home. Old links land on Home.
 */
export default function NewsyRedirect() {
  redirect("/");
}
