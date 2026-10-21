import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StyleGuide } from "./_components/style-guide";

export const metadata: Metadata = {
  title: "Style guide",
  robots: { index: false, follow: false },
};

/** Dev-only living style guide for the WebNEWS design system. 404 in production builds. */
export default function StyleGuidePage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <StyleGuide />;
}
