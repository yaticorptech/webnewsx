import { ArticleSkeleton } from "@/components/article/article-skeleton";

function ArticleLoadingContent() {
  return <ArticleSkeleton />;
}

/** In the Android app the loading skeleton stays hidden (owner 2026-10-10; globals.css [data-route-loading]). */
export default function ArticleLoading() {
  return (
    <div data-route-loading="" className="contents">
      <ArticleLoadingContent />
    </div>
  );
}
