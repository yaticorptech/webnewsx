"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FolderInput } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CategoryPicker } from "@/components/composer/composer-fields";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/toast";
import { api, errorMessage, isApiError } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { DISTRICT_CATEGORY, categoryLabel, districtError, type Category } from "@/lib/shared/contracts";
import { patchInAllFeeds } from "./live-state";

export type CategoryDialogProps = {
  article: { id: string; title: string; category?: Category | null; district?: string | null };
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type Problems = { category?: string; district?: string };

/**
 * "Change category" (owner 2026-09-26): published stories can't be edited, but their author — or the Editor
 * Desk — can move one to another section (and, for Karnataka, district) → `PATCH /api/articles/:id/category`.
 * Stories published before categories existed start in Others.
 */
export function CategoryDialog({ article, open, onOpenChange }: CategoryDialogProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [category, setCategory] = useState<Category | "">(article.category ?? "");
  const [district, setDistrict] = useState(article.district ?? "");
  const [problems, setProblems] = useState<Problems>({});

  // Start from the story's current section every time the sheet opens (adjusting state during render).
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setCategory(article.category ?? "");
      setDistrict(article.district ?? "");
      setProblems({});
    }
  }

  const mutation = useMutation({
    mutationFn: (input: { category: Category; district: string | null }) => api.setCategory(article.id, input),
    onSuccess: (result) => {
      patchInAllFeeds(queryClient, result.id, { category: result.category, district: result.district });
      // Category pages load their new member (and drop the old one) the next time they're opened.
      void queryClient.invalidateQueries({ queryKey: qk.feedAll, refetchType: "none" });
      toast.success("Category changed", { id: "category-changed", description: `Now in ${categoryLabel(result.category, result.district)}.` });
      onOpenChange(false);
      router.refresh();
    },
    onError: (error) => {
      if (isApiError(error) && (error.fields?.category || error.fields?.district)) {
        setProblems({ category: error.fields.category, district: error.fields.district });
        return;
      }
      toast.error("Couldn't change the category", { id: "category-changed", description: errorMessage(error) });
    },
  });

  const submit = () => {
    const next: Problems = {};
    if (!category) next.category = "Choose a category";
    const districtIssue = districtError(category || null, district || null);
    if (districtIssue) next.district = districtIssue;
    setProblems(next);
    if (!category || districtIssue) return;
    mutation.mutate({ category, district: category === DISTRICT_CATEGORY ? district : null });
  };

  const busy = mutation.isPending;
  const unchanged = category === (article.category ?? "") && (category !== DISTRICT_CATEGORY || district === (article.district ?? ""));
  const error = problems.category ?? problems.district;

  return (
    <Modal
      open={open}
      onOpenChange={(value) => !busy && onOpenChange(value)}
      title="Change category"
      description="Move this story to the section where readers will look for it. It stays on Home either way."
      size="md"
      dismissible={!busy}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy} disabled={unchanged} leftIcon={<FolderInput aria-hidden />}>
            Move story
          </Button>
        </>
      }
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className="flex flex-col gap-4"
      >
        <p className="line-clamp-2 border-l-4 border-brand pl-3 font-wide text-[0.9375rem] font-extrabold leading-snug text-ink">
          {article.title}
        </p>
        <div className="flex flex-col gap-2">
          <label htmlFor="move-category" className="text-[0.8125rem] font-bold text-ink">
            Category<span aria-hidden className="ml-0.5 text-brand">*</span>
          </label>
          <CategoryPicker
            idPrefix="move"
            category={category}
            district={district}
            categoryInvalid={Boolean(problems.category)}
            districtInvalid={Boolean(problems.district)}
            describedBy={error ? "move-category-error" : undefined}
            onCategoryChange={(value) => {
              setCategory(value);
              setProblems({});
            }}
            onDistrictChange={(value) => {
              setDistrict(value);
              setProblems({});
            }}
          />
          <div aria-live="polite">
            {error && (
              <p id="move-category-error" className="text-xs font-semibold text-brand">
                {error}
              </p>
            )}
          </div>
        </div>
      </form>
    </Modal>
  );
}
