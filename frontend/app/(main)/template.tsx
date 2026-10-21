import type { ReactNode } from "react";

/** Route transition: each page fades in with an 8px rise (CSS, so it runs before hydration; off under reduced motion). */
export default function MainTemplate({ children }: { children: ReactNode }) {
  return <div className="animate-fade-up">{children}</div>;
}
