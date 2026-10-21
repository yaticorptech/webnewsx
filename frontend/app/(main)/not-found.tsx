import { NotFoundView } from "@/components/layout/status-views";

/** 404 inside the app shell (e.g. unknown /[username] or /a/[slug]). */
export default function MainNotFound() {
  return <NotFoundView />;
}
