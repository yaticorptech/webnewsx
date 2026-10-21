"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Editor } from "@tiptap/react";
import { ArrowLeft, ArrowRight, Check, CircleDot, Crown, Eye, FilePen, Link2, Lock, Save, Send, Trash2 } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { draftsPath, useNativeApp } from "@/lib/hooks/use-native-app";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BackButton } from "@/components/layout/back-button";
import { UserHandle } from "@/components/brand/user-handle";
import { useViewer } from "@/components/providers/viewer-provider";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { SpeedLinesLoader } from "@/components/ui/speed-lines-loader";
import { TimeAgo } from "@/components/ui/time-ago";
import { toast } from "@/components/ui/toast";
import { api, errorMessage, isApiError } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import {
  LIMITS,
  BLURB,
  KARNATAKA_DISTRICTS,
  SUBCATEGORIES,
  PRESS_LANGUAGE_LABELS,
  PRESS_LANGUAGE_VALUES,
  categoryPath,
  detectLanguage,
  districtError,
  type ArticlePressMeet,
  type ArticleReview,
  type Category,
  type OwnedArticle,
  type PosterFrame,
  type PosterTemplate,
  type PressLanguage,
  type SaveArticleInput,
  type VideoRef,
} from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";
import {
  MESSAGES,
  badgeLevelOf,
  buildPreviewCard,
  categoryOrEmpty,
  districtOf,
  languageOrEmpty,
  errorsFromApi,
  fieldsFromDraft,
  firstInvalid,
  stepOfField,
  hasDraftContent,
  previewPosterStory,
  posterTemplateOf,
  templateOrEmpty,
  validateForDraft,
  validateForPublish,
  isHttpLink,
  type ComposerAuthor,
  type ComposerCover,
  type ComposerFields,
  type ComposerMedia,
  type FieldErrors,
  type FieldKey,
} from "./composer-model";
import { autosaveKey, clearAutosave, readAutosave, recordHasContent, writeAutosave } from "./composer-storage";
import { SelectBox } from "@/components/presspass/form-controls";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AiWriter } from "./ai-writer";
import { BodyModePicker, type BodyMode } from "./body-mode";
import { PromptHelper } from "./prompt-helper";
import { CategoryPicker, Counter, Section, TitleInput, TITLE_SOFT_MAX } from "./composer-fields";
import { MEDIA_FIELD_ID, MediaUpload } from "./media-upload";
import { DeleteDraftDialog } from "./delete-draft-dialog";
import { LivePreview } from "./live-preview";
import { PreviewPane } from "./preview-pane";
import { PublishSuccess } from "./publish-success";
import { sendSocialPoster } from "./social-poster";
import { PressMeetBanner } from "./press-meet-banner";
import { PressPassGate } from "./press-pass-gate";
import { ReviewBanner } from "./review-banner";
import { Stepper, type ComposerStep } from "./stepper";
import { StoryEditor } from "./story-editor";
import { TemplatePicker } from "./template-picker";
import { LeaveDialog, useUnsavedGuard } from "./use-unsaved-guard";
import { STORY_EDITOR_ID, snapshotOf, useStoryEditor, type EditorSnapshot } from "./use-story-editor";

export type ComposerProps = {
  author: ComposerAuthor;
  /** The draft being edited (`/publish/[id]`), or null for a new story. */
  draft: OwnedArticle | null;
  /** Trainee reporter: "Publish" becomes "Submit for review" and the story goes to the Review Desk (SPEC §3.11). */
  review?: boolean;
  /**
   * A new story from a press meet's "Write your story" (owner 2026-10-05; 2026-10-07: it goes live only once the
   * organizer verifies it): "Publish" becomes "Send to organiser", and the press meet page opens again. A saved press
   * meet story brings its press meet in `draft.pressMeet`.
   */
  pressMeetId?: string | null;
  /**
   * A Reader (owner 2026-10-08): the page shows, but two seconds in — and on Save draft / Publish — it asks for a Press
   * Pass instead of filing.
   */
  needsPressPass?: boolean;
};

type Busy = null | "draft" | "publish";
/** `rev` counts edits; `saved` is the rev the server has. Dirty = they differ. */
type Revisions = { rev: number; saved: number };

/** Composer toasts sit at the bottom on phones, right where bottom sheets put their buttons. */
const COMPOSER_TOASTS = [
  "composer-saved",
  "composer-invalid",
  "composer-restored",
  "composer-draft-empty",
  "composer-save-error",
];
const dismissComposerToasts = () => COMPOSER_TOASTS.forEach((id) => toast.dismiss(id));

const FIELD_DOM_ID: Record<FieldKey, string> = {
  // Both images are set in one popup, opened from one button (owner 2026-10-07).
  cover: MEDIA_FIELD_ID,
  articleMedia: MEDIA_FIELD_ID,
  title: "composer-title",
  category: "composer-category",
  district: "composer-district",
  // The radio group: focus lands on its chosen radio.
  template: "composer-template",
  bodyHtml: STORY_EDITOR_ID,
  linkUrl: "composer-link",
  subcategory: "composer-subcategory",
  blurb: "composer-blurb",
};

/**
 * The publish flow (SPEC §3.8; quick post, owner 2026-10-07): ONE page — cover, headline, story, section, language, the
 * article's image or video and the template, with the live poster preview — then Publish, or an optional Preview
 * first, or Save draft. A published story opens here too (owner
 * 2026-10-02): "Save changes" updates it in place (same link, no second review, no Save draft) and opens it.
 * Server truth comes in as `draft`; unsaved edits are mirrored to localStorage and restored after a
 * refresh. Saving a new story swaps the URL to /publish/<id> in place (history.replaceState) so the
 * editor, its undo history and any in-flight upload survive.
 */
export function Composer({ author, draft, review: trainee = false, pressMeetId = null, needsPressPass = false }: ComposerProps) {
  const router = useRouter();
  // In the app, Drafts lives in Settings (owner 2026-10-09); on the website, on the profile.
  const inApp = useNativeApp();
  const draftsHref = draftsPath(author.username, inApp);
  const queryClient = useQueryClient();
  const reduceMotion = useReducedMotion();
  /** The byline badge readers will see on this story (posters + preview). */
  const account = useViewer();
  const reporterLevel = badgeLevelOf(account);
  /** "Your frame" (owner 2026-10-08): the account's own frame — drafts already on it still preview it (no longer pickable, 2026-10-14). */
  const [frameUrl] = useState<string | null>(account?.posterOverlayUrl ?? null);

  const [initial] = useState(() => fieldsFromDraft(draft));
  /** Editing a story that is already live. */
  const live = draft?.status === "published";
  // 3 steps (owner 2026-10-14): 1 images, 2 the story's details, 3 preview & publish. A draft with both images opens on 2.
  const [step, setStep] = useState<ComposerStep>(draft?.cover && draft.articleImage ? "article" : "poster");
  const [title, setTitle] = useState(initial.title);
  const [cover, setCover] = useState<ComposerCover | null>(initial.cover);
  const [video, setVideo] = useState<VideoRef | null>(initial.video);
  const [articleImage, setArticleImage] = useState<ComposerCover | null>(initial.articleImage);
  const [articleVideo, setArticleVideo] = useState<VideoRef | null>(initial.articleVideo);
  /** The two-image popup (owner 2026-10-07). */
  const [mediaOpen, setMediaOpen] = useState(false);
  const [category, setCategory] = useState<Category | "">(initial.category);
  const [district, setDistrict] = useState(initial.district);
  const [language, setLanguage] = useState<PressLanguage | "">(initial.language);
  const [template, setTemplate] = useState<PosterTemplate | "">(initial.template);
  const [posterFrame, setPosterFrame] = useState<PosterFrame | null>(initial.posterFrame);
  /** Members-only story (owner 2026-10-14): only the reporter's premium members read it in full. */
  const [premium, setPremium] = useState(draft?.premium ?? false);
  const [priceAskOpen, setPriceAskOpen] = useState(false);
  // Always loaded (owner 2026-10-16): the Premium box needs to know before it's ticked whether the reporter qualifies.
  const settings = useQuery({ queryKey: qk.account, queryFn: ({ signal }) => api.account(signal) });
  /** Premium (owner 2026-10-16): the Desk's conditions met, and the price set (a price set earlier still counts). */
  const eligibility = settings.data?.membershipEligibility ?? null;
  const hasMembershipPrice = settings.data?.membershipPrice != null;
  const premiumLocked = !hasMembershipPrice && !(eligibility?.eligible ?? false);
  // Not qualified (once we know): a story can't stay Members only — a draft saved that way, or a tick made before the
  // check loaded, is taken off (owner 2026-10-16).
  if (settings.data && premiumLocked && premium) setPremium(false);
  const [body, setBody] = useState<EditorSnapshot>({ html: initial.bodyHtml, text: "" });
  /** The editor exists and the local autosave has been checked (autosave writes wait for this). */
  const [ready, setReady] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(draft?.id ?? null);
  const [savedAt, setSavedAt] = useState<string | null>(draft?.updatedAt ?? null);
  const [revs, setRevs] = useState<Revisions>({ rev: 0, saved: 0 });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [flash, setFlash] = useState(0);
  const [busy, setBusy] = useState<Busy>(null);
  /** The cover's / the article's image or video is uploading (saving and publishing wait for both). */
  const [coverUploading, setCoverUploading] = useState<ComposerMedia | null>(null);
  const [articleUploading, setArticleUploading] = useState<ComposerMedia | null>(null);
  const uploading = coverUploading ?? articleUploading;
  const [linkOpen, setLinkOpen] = useState(false);
  /**
   * The Description section's three ways (owner 2026-10-14): write it, a "Read more link" instead of a description
   * (the story opens that link), or "Generate with AI" (Gemini writes it into the editor).
   */
  const [bodyMode, setBodyMode] = useState<BodyMode>(draft?.linkUrl && !draft.bodyHtml ? "link" : "text");
  const [promptOpen, setPromptOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState(draft?.linkUrl ?? "");
  const linkArg = bodyMode === "link" ? linkUrl : null;
  /** Sub category (SUBCATEGORIES; Karnataka uses its district) and the 2-line blurb (owner 2026-10-14). */
  const [subcategory, setSubcategory] = useState(draft?.subcategory ?? "");
  const [blurb, setBlurb] = useState(draft?.blurb ?? "");
  const extras = { link: linkArg, subcategory, blurb };
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [previewAt, setPreviewAt] = useState("");
  /** `path` = the story's category page, where the reporter lands (newest first, so it leads). */
  const [published, setPublished] = useState<{ title: string; slug: string; path: string } | null>(null);
  /** Sent to the Review Desk (Trainee "publish"): the success moment, then the profile's Desk. */
  const [submitted, setSubmitted] = useState<{ title: string; message: string } | null>(null);
  /** Review Desk state of this story: saving as a draft withdraws an in-review story (returned notes stay). */
  const [reviewState, setReviewState] = useState<ArticleReview | null>(draft?.review ?? null);
  /** Written for a press meet (owner 2026-10-07): sent to its organizer, who verifies it before it goes live. */
  const [meet, setMeet] = useState<ArticlePressMeet | null>(draft?.pressMeet ?? null);
  const meetId = meet?.id ?? pressMeetId;
  /** Publishing sends it to the press meet's organizer instead (Trainees too: the organizer verifies it). */
  const toOrganizer = meetId !== null && !live;
  /** Publishing goes to the Review Desk. */
  const toReviewDesk = trainee && !toOrganizer;
  const pendingFocus = useRef<FieldKey | null>(null);
  const stepperRef = useRef<HTMLDivElement>(null);

  const dirty = revs.rev !== revs.saved;
  const fields: ComposerFields = {
    title,
    bodyHtml: body.html,
    cover,
    video,
    articleImage,
    articleVideo,
    category,
    district,
    language,
    template,
    posterFrame,
  };
  const textLength = body.text.length;
  const localKey = autosaveKey(author.id, draftId);
  /** The story's reel for the live preview. A reel shows no excerpt or date: typing the story doesn't re-render it. */
  const reelCard = useMemo(
    () =>
      buildPreviewCard({
        // A reel shows the cover, never the article's media.
        fields: { title, bodyHtml: "", cover, video, articleImage: null, articleVideo: null, category, district, language, template, posterFrame },
        text: "",
        author,
        draftId,
        publishedAt: "",
        reporterLevel,
        overlayUrl: frameUrl,
      }),
    [title, cover, video, category, district, language, template, posterFrame, author, draftId, reporterLevel, frameUrl],
  );

  const touch = () => setRevs((r) => ({ ...r, rev: r.rev + 1 }));

  /** Drops an error once its field is fixed (errors only appear after a save/publish attempt). */
  const clearError = (key: FieldKey, stillInvalid: boolean) => {
    if (errors[key] && !stillInvalid) setErrors(({ [key]: _gone, ...rest }) => rest);
  };

  /* ─────────── Editor + local restore ─────────── */

  const restoreLocal = (editor: Editor) => {
    // A new story always starts on a fresh, empty page (owner 2026-10-07: "+" must not bring back an unsaved story).
    if (!draft) {
      clearAutosave(localKey);
      return false;
    }
    const record = readAutosave(localKey);
    if (!record || !recordHasContent(record)) return false;
    // Edits made on top of an older server version are stale: the server copy wins.
    if (draft && record.baseUpdatedAt !== draft.updatedAt) {
      clearAutosave(localKey);
      return false;
    }
    setTitle(record.title);
    setCover(record.cover);
    setVideo(record.cover ? record.video : null);
    setArticleImage(record.articleImage);
    setArticleVideo(record.articleImage ? record.articleVideo : null);
    setCategory(categoryOrEmpty(record.category));
    setDistrict(record.district);
    setLanguage(languageOrEmpty(record.language));
    // No valid pick (none chosen yet, or a record written before templates existed): still not chosen.
    setTemplate(templateOrEmpty(record.template));
    setPosterFrame(record.cover ? record.posterFrame : null);
    editor.commands.setContent(record.bodyHtml || "", { emitUpdate: false });
    setRevs((r) => ({ ...r, rev: r.rev + 1 }));
    toast("Restored your unsaved changes", {
      id: "composer-restored",
      description: draft ? "Picked up where you left off on this device." : "Your story was kept on this device.",
      action: { label: "Discard", onClick: () => discardLocal(editor) },
    });
    return true;
  };

  const discardLocal = (editor: Editor) => {
    clearAutosave(localKey);
    setTitle(initial.title);
    setCover(initial.cover);
    setVideo(initial.video);
    setArticleImage(initial.articleImage);
    setArticleVideo(initial.articleVideo);
    setCategory(initial.category);
    setDistrict(initial.district);
    setLanguage(initial.language);
    setTemplate(initial.template);
    setPosterFrame(initial.posterFrame);
    setErrors({});
    editor.commands.setContent(initial.bodyHtml || "", { emitUpdate: false });
    setBody(snapshotOf(editor));
    setRevs((r) => ({ rev: r.rev + 1, saved: r.rev + 1 }));
  };

  const editor = useStoryEditor({
    initialHtml: initial.bodyHtml,
    describedBy: "composer-story-section-error",
    onReady: (created) => {
      restoreLocal(created);
      setBody(snapshotOf(created));
      setReady(true);
    },
    onChange: (snapshot) => {
      setBody(snapshot);
      touch();
      clearError("bodyHtml", snapshot.text.length < LIMITS.bodyTextMin);
    },
    onLinkShortcut: () => setLinkOpen(true),
  });

  /* ─────────── Autosave to this device ─────────── */

  useEffect(() => {
    if (!ready) return;
    if (!dirty) {
      clearAutosave(localKey);
      return;
    }
    const timer = setTimeout(
      () =>
        writeAutosave(
          localKey,
          { title, bodyHtml: body.html, cover, video, articleImage, articleVideo, category, district, language, template, posterFrame },
          draftId ? savedAt : null,
        ),
      500,
    );
    return () => clearTimeout(timer);
  }, [
    ready,
    dirty,
    localKey,
    title,
    body.html,
    cover,
    video,
    articleImage,
    articleVideo,
    category,
    district,
    language,
    template,
    posterFrame,
    draftId,
    savedAt,
  ]);

  /* ─────────── Focus the first invalid field after validation ─────────── */

  useEffect(() => {
    const key = pendingFocus.current;
    if (!key || step === "preview") return;
    pendingFocus.current = null;
    const frame = requestAnimationFrame(() => {
      const field = document.getElementById(FIELD_DOM_ID[key]);
      // A radio group is focused through its chosen radio (the first one while none is chosen).
      const radio = key === "template" ? (field?.querySelector<HTMLElement>("input:checked") ?? field?.querySelector("input")) : null;
      const el = radio ?? field;
      const section = el?.closest("section") ?? el;
      section?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
      if (key === "bodyHtml") editor?.commands.focus("end", { scrollIntoView: false });
      else el?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [flash, step, editor, reduceMotion]);

  /** The field to focus once the writing page shows (every field is on it). */
  const focusLater = (key: FieldKey | null) => {
    pendingFocus.current = key;
    setStep(key ? stepOfField(key) : "article");
  };

  const showErrors = (problems: FieldErrors) => {
    setErrors(problems);
    setFlash((n) => n + 1);
    focusLater(firstInvalid(problems));
  };

  /* ─────────── Save / publish ─────────── */

  const toInput = (action: "draft" | "publish"): SaveArticleInput => ({
    ...(draftId ? { id: draftId } : {}),
    title: title.trim(),
    bodyHtml: bodyMode === "link" ? "" : body.html,
    cover: cover
      ? { url: cover.url, key: cover.key, width: cover.width, height: cover.height, blurDataUrl: cover.blurDataUrl }
      : null,
    video: cover && video ? { url: video.url, key: video.key, width: video.width, height: video.height, durationMs: video.durationMs } : null,
    articleImage: articleImage
      ? {
          url: articleImage.url,
          key: articleImage.key,
          width: articleImage.width,
          height: articleImage.height,
          blurDataUrl: articleImage.blurDataUrl,
        }
      : null,
    articleVideo:
      articleImage && articleVideo
        ? { url: articleVideo.url, key: articleVideo.key, width: articleVideo.width, height: articleVideo.height, durationMs: articleVideo.durationMs }
        : null,
    // Only "Read more link" stories carry a link (owner 2026-10-14; before: the publisher is the story's source).
    linkUrl: linkArg !== null && isHttpLink(linkArg) ? linkArg.trim() : null,
    category: category || null,
    district: districtOf(fields),
    // "" = automatic: the server reads it from the headline's script.
    language: language || null,
    // Drafts keep "not chosen"; publishing without a pick gives "No template" (owner 2026-10-07).
    template: action === "publish" ? posterTemplateOf(template) : template || null,
    posterFrame: cover ? posterFrame : null,
    // Links a new story to its press meet (a saved one keeps its link).
    pressMeetId: meetId,
    subcategory: category && category !== "karnataka" && subcategory ? subcategory : null,
    blurb: blurb.trim() || null,
    premium,
    action,
  });

  const invalidateLists = (id: string | null) => {
    void queryClient.invalidateQueries({ queryKey: qk.feedAll });
    void queryClient.invalidateQueries({ queryKey: qk.userDrafts(author.username) });
    void queryClient.invalidateQueries({ queryKey: qk.userArticles(author.username) });
    void queryClient.invalidateQueries({ queryKey: qk.profile(author.username) });
    if (id) void queryClient.invalidateQueries({ queryKey: qk.ownedArticle(id) });
  };

  const handleSaveError = (error: unknown, fallbackTitle: string) => {
    if (isApiError(error)) {
      if (error.isUnauthorized) {
        toast.error("Your session has ended", {
          description: "Log in again — this story is kept on this device.",
          action: { label: "Log in", href: `/login?next=${encodeURIComponent(window.location.pathname)}` },
        });
        return;
      }
      const fieldErrors = errorsFromApi(error.fields);
      if (Object.keys(fieldErrors).length > 0) {
        showErrors(fieldErrors);
        toast.error(error.message || fallbackTitle, {
          id: "composer-invalid",
          description: "Fix the highlighted fields and try again.",
        });
        return;
      }
    }
    toast.error(fallbackTitle, { description: errorMessage(error), id: "composer-save-error" });
  };

  /** The Press Pass ask (Readers only). */
  const [gateOpen, setGateOpen] = useState(false);
  useEffect(() => {
    if (!needsPressPass) return;
    const timer = setTimeout(() => setGateOpen(true), 2000);
    return () => clearTimeout(timer);
  }, [needsPressPass]);

  /** Saves the draft; resolves to its id (truthy) or false when it couldn't be saved. */
  const saveDraft = async (): Promise<string | false> => {
    if (needsPressPass) {
      setGateOpen(true);
      return false;
    }
    if (busy || uploading) return false;
    const problems = validateForDraft(fields, textLength);
    if (Object.keys(problems).length > 0) {
      showErrors(problems);
      return false;
    }
    if (!(hasDraftContent(fields, textLength) || (linkArg !== null && linkArg.trim() !== ""))) {
      toast.error(MESSAGES.draftEmpty, { id: "composer-draft-empty" });
      return false;
    }
    setBusy("draft");
    const startRev = revs.rev;
    try {
      const response = await api.saveArticle(toInput("draft"));
      const id = response.article.id;
      if (!draftId) {
        clearAutosave(autosaveKey(author.id, null));
        setDraftId(id);
        window.history.replaceState(null, "", `/publish/${id}`);
      }
      if (response.status === "draft") setSavedAt(response.article.updatedAt);
      setRevs((r) => ({ ...r, saved: startRev }));
      setErrors({});
      invalidateLists(id);
      const withdrawn = reviewState?.state === "in_review";
      if (withdrawn) setReviewState(null);
      const takenBack = meet?.review === "pending";
      if (takenBack) setMeet({ ...meet, review: null });
      toast.success(withdrawn ? "Withdrawn from the Review Desk" : takenBack ? `Taken back from ${meet.organizer.name}` : "Draft saved", {
        id: "composer-saved",
        description: withdrawn
          ? "It's a draft again — submit it for review when you're ready."
          : takenBack
            ? "It's a draft again — send it to the organiser when you're ready."
            : inApp
              ? "It's in Drafts, under Settings — only you can see it."
              : "It's in Drafts on your profile — only you can see it.",
      });
      return id;
    } catch (error) {
      handleSaveError(error, "Couldn't save your draft");
      return false;
    } finally {
      setBusy(null);
    }
  };

  const publish = async () => {
    if (needsPressPass) {
      setGateOpen(true);
      return;
    }
    if (busy || uploading) return;
    const problems = validateForPublish(fields, textLength, extras);
    if (Object.keys(problems).length > 0) {
      showErrors(problems);
      toast.error("Your story isn't ready to publish yet", {
        id: "composer-invalid",
        description: "Fix the highlighted fields and try again.",
      });
      return;
    }
    setBusy("publish");
    try {
      const response = await api.saveArticle(toInput("publish"));
      if (response.status === "sent") {
        // A press meet story: with the organizer now — back to the press meet page.
        clearAutosave(autosaveKey(author.id, null), autosaveKey(author.id, response.article.id));
        if (!draftId) setDraftId(response.article.id);
        setRevs((r) => ({ ...r, saved: r.rev }));
        invalidateLists(response.article.id);
        void queryClient.invalidateQueries({ queryKey: qk.pressMeetsAll });
        toast.success(`Sent to ${meet?.organizer.name ?? "the organiser"}`, { id: "composer-saved", description: response.message });
        router.replace(`/press-meet/${response.pressMeetId}`);
        return;
      }
      if (response.status === "in_review") {
        clearAutosave(autosaveKey(author.id, null), autosaveKey(author.id, response.article.id));
        if (!draftId) setDraftId(response.article.id);
        setRevs((r) => ({ ...r, saved: r.rev }));
        invalidateLists(response.article.id);
        setSubmitted({ title: title.trim(), message: response.message });
        return;
      }
      if (response.status !== "published" || !response.article.slug)
        throw new Error("The story was saved but not published.");
      clearAutosave(autosaveKey(author.id, null), autosaveKey(author.id, response.article.id));
      setRevs((r) => ({ ...r, saved: r.rev }));
      invalidateLists(response.article.id);
      if (live) {
        // The updated story replaces the composer, so Back from it returns to where the edit started.
        void queryClient.invalidateQueries({ queryKey: qk.pressMeetsAll });
        toast.success("Story updated", { id: "composer-live", description: "Readers now see your changes." });
        router.replace(`/a/${response.article.slug}`);
        return;
      }
      const filed = response.article.category;
      // Connected Instagram / Facebook Page: the poster goes to the auto-posts (runs on while the page moves on).
      void sendSocialPoster(response.article).catch(() => {});
      setPublished({
        title: response.article.title,
        slug: response.article.slug,
        path: filed ? categoryPath(filed, response.article.district) : "/?tab=latest",
      });
    } catch (error) {
      handleSaveError(error, toOrganizer ? "Couldn't send your story" : toReviewDesk ? "Couldn't submit your story" : "Couldn't publish your story");
      setBusy(null);
    }
  };

  // "Your story is live" appears when the front page actually replaces the composer (this unmount),
  // so a slow navigation can't let it expire unseen behind the overlay.
  const arrivalToast = useRef<string | null>(null);
  const reviewToast = useRef<string | null>(null);
  useEffect(() => {
    return () => {
      const message = reviewToast.current;
      if (message) {
        toast.success("Sent to the Review Desk", { id: "composer-in-review", description: message, duration: 7000 });
        return;
      }
      const slug = arrivalToast.current;
      if (!slug) return;
      toast.success("Your story is live", {
        id: "composer-live",
        description: "It's at the top of every open feed.",
        action: { label: "View story", href: `/a/${slug}` },
        duration: 7000,
      });
    };
  }, []);

  const finishPublish = () => {
    if (!published) return;
    // Land on the very top of the front page (behind the overlay, so nobody sees the jump).
    window.scrollTo({ top: 0, behavior: "instant" });
    toast.dismiss("composer-saved");
    arrivalToast.current = published.slug;
    // Its category page is chronological, so the new story is guaranteed to lead it (Home is ranked).
    router.push(published.path);
  };

  const finishSubmit = () => {
    if (!submitted) return;
    window.scrollTo({ top: 0, behavior: "instant" });
    toast.dismiss("composer-saved");
    reviewToast.current = submitted.message;
    // Drafts lists it with an "In review" stamp until an editor decides.
    router.push(draftsHref);
  };

  const onDeleted = () => {
    clearAutosave(localKey, autosaveKey(author.id, null));
    setRevs((r) => ({ ...r, saved: r.rev }));
    setDeleteOpen(false);
    invalidateLists(draftId);
    toast.success("Draft deleted", { id: "composer-deleted" });
    router.push(draftsHref);
  };

  /* ─────────── Steps, shortcuts, guard ─────────── */

  /** Both images in (owner 2026-10-16): the story can't move past step 1 — nor be previewed — without them. */
  const imagesReady = Boolean(cover) && Boolean(articleImage);
  /** Stays on step 1 and points at the missing image(s). */
  const needImages = () => {
    const missing: FieldErrors = {};
    if (!cover) missing.cover = "Add a cover image or a video";
    if (!articleImage) missing.articleMedia = "Add an article image or video";
    if (step !== "poster") setStep("poster");
    showErrors(missing);
    toast.error(!cover && !articleImage ? "Add both images first" : !cover ? "Add the cover image first" : "Add the article image first", {
      id: "composer-images-first",
    });
  };

  const goTo = (next: ComposerStep) => {
    if (next === step) return;
    if (next !== "poster" && !imagesReady) {
      needImages();
      return;
    }
    // Preview only with every detail filled (owner 2026-10-16): otherwise show what's missing.
    if (next === "preview" && Object.keys(validateForPublish(fields, textLength, extras)).length > 0) {
      showErrors(validateForPublish(fields, textLength, extras));
      toast.error("Fill in the details first", { id: "composer-details-first", description: "The missing ones are marked in red." });
      return;
    }
    if (next === "preview") setPreviewAt(new Date().toISOString());
    setStep(next);
    // Each step starts at the stepper (just under the nav), like turning a page.
    stepperRef.current?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  };

  /** Owner 2026-10-15: every step is open to browse — only Publish checks the fields. */
  const openPreview = () => goTo("preview");

  /** Readiness checklist → back to that field's step with every publish problem shown, focusing the one clicked. */
  const onFix = (key: FieldKey) => {
    showErrors(validateForPublish(fields, textLength, extras));
    focusLater(key);
  };

  /** Preview's "Change" / "Choose" template link → back to the poster step on the template picker (no validation run). */
  const onChangeTemplate = () => {
    pendingFocus.current = "template";
    setStep("article");
  };

  /** Step 1 → 2: only with both images (owner 2026-10-16). */
  const goNext = () => goTo("article");

  const onStepChange = goTo;

  // ⌘/Ctrl+S saves the draft instead of the browser's "Save page".
  const saveRef = useRef(saveDraft);
  useEffect(() => {
    saveRef.current = saveDraft;
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveRef.current();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const guard = useUnsavedGuard(dirty && !published && !submitted);
  useEffect(() => {
    if (guard.pendingHref || linkOpen || deleteOpen) dismissComposerToasts();
  }, [guard.pendingHref, linkOpen, deleteOpen]);

  const publishProblems = validateForPublish(fields, textLength, extras);
  /** A step gets its tick only once all its fields are filled correctly (owner 2026-10-15). */
  const problemSteps = new Set((Object.keys(publishProblems) as FieldKey[]).map(stepOfField));
  const completeSteps = { poster: !problemSteps.has("poster"), article: !problemSteps.has("article") };
  const publishLabel = live ? (
    "Save changes"
  ) : toOrganizer ? (
    <span>
      Send<span className="max-sm:sr-only"> to organiser</span>
    </span>
  ) : trainee ? (
    <span>
      Submit<span className="max-sm:sr-only"> for review</span>
    </span>
  ) : (
    "Publish"
  );
  const actionsDisabled = Boolean(busy) || uploading !== null;
  /** The one writing page (quick post) — "poster" is its step; "preview" is the optional check before publishing. */
  const writing = step !== "preview";
  // The live poster preview belongs to step 2 (owner 2026-10-16: step 1 is just the uploads); Preview shows the reel itself.
  const livePreview = step === "article";
  /** Preview only once every detail is filled in correctly (owner 2026-10-16). */
  const detailsReady = Object.keys(publishProblems).length === 0;
  /** The live preview's "Adjust photo" (only with a cover: nothing to adjust before). */
  const livePreviewControls = {
    frame: posterFrame,
    onFrameChange: cover
      ? (next: PosterFrame | null) => {
          setPosterFrame(next);
          touch();
        }
      : undefined,
  };

  return (
    // Phones: cancel the shell's tab-bar padding so the action bar ends flush with the page. ≥1024px while writing:
    // full screen (owner 2026-10-08) — the form across the page (its action bar at the end) and the live preview
    // in a sticky column on the right (`data-grid-page` lifts the shell's column limit). Preview is the usual single column.
    <div
      data-composer
      // Step 1 too (owner 2026-10-16: "full screen"): the two image sections across the page.
      data-grid-page={livePreview || step === "poster" ? "" : undefined}
      className={cn(
        "max-md:-mb-[calc(var(--tabbar-h)+1.5rem+env(safe-area-inset-bottom))]",
        livePreview &&
          "w-full lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-x-10 xl:grid-cols-[minmax(0,1fr)_22rem] xl:gap-x-12",
      )}
    >
      <div className="min-w-0 lg:col-start-1">
        <FocusMode />
        <ComposerHeader
          author={author}
          editing={Boolean(draftId)}
          live={live}
          reviewState={reviewState?.state ?? null}
          status={
            <SaveStatus
              busy={busy}
              dirty={dirty}
              savedAt={savedAt}
              uploading={uploading}
              sending={toOrganizer ? "Sending…" : toReviewDesk ? "Submitting…" : "Publishing…"}
              live={live}
            />
          }
          onDelete={draftId && !live ? () => setDeleteOpen(true) : undefined}
          draftsHref={needsPressPass ? undefined : draftsHref}
        />

        {meet && !live ? (
          <PressMeetBanner meet={meet} className="mt-6" />
        ) : (
          <ReviewBanner review={reviewState} trainee={toReviewDesk} className="mt-6" />
        )}

        {/* Where Preview and Edit scroll back to. */}
        <div ref={stepperRef} aria-hidden className="scroll-mt-[calc(var(--nav-h)+0.75rem)]" />
        <div className="mt-3 sm:mt-6">
          <Stepper step={step} complete={completeSteps} onStepChange={onStepChange} disabled={busy === "publish"} />
        </div>

        {/* ONE page (owner 2026-10-07): where it's listed (category, language — first since 2026-10-08), the headline, the
            description, both images (one popup), the template — with Preview, Publish and Save draft at the bottom and, from 1024px, the live previews of the
            poster and the article image on the right. Kept mounted during Preview, so the editor, its undo history and
            uploads survive. */}
        <motion.div
          hidden={!writing}
          initial={false}
          animate={writing ? { opacity: 1, x: 0 } : { opacity: 0, x: -16 }}
          transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
          // Tighter between the fields (owner 2026-10-08: "adjust the gaps").
          className="flex flex-col gap-4 pt-4 sm:gap-8 sm:pt-6"
        >
          {/* STEP 1 (owner 2026-10-14): the images — upload or take a photo. */}
          <div hidden={step !== "poster"} className="flex flex-col gap-4 sm:gap-6">
          {/* Both images at once (owner 2026-10-07): the cover and the article image, in one popup. */}
          <Section id="composer-media-section" label="Images" required error={errors.cover ?? errors.articleMedia} flash={flash}>
            <MediaUpload
              cover={{ cover, video }}
              article={{ cover: articleImage, video: articleVideo }}
              coverUploading={coverUploading !== null}
              articleUploading={articleUploading !== null}
              coverError={errors.cover}
              articleError={errors.articleMedia}
              open={mediaOpen}
              onOpenChange={setMediaOpen}
              onCropOpen={dismissComposerToasts}
              done={Boolean(published)}
              onCoverUploading={setCoverUploading}
              onArticleUploading={setArticleUploading}
              onCoverChange={(next) => {
                // A new photo starts centred again (the old placement was for the old photo).
                if (next.cover?.key !== cover?.key) setPosterFrame(null);
                setCover(next.cover);
                setVideo(next.cover ? next.video : null);
                touch();
                clearError("cover", !next.cover);
              }}
              onArticleChange={(next) => {
                setArticleImage(next.cover);
                setArticleVideo(next.cover ? next.video : null);
                touch();
                clearError("articleMedia", !next.cover);
              }}
            />
          </Section>
          </div>

          {/* STEP 2: where it's listed, the headline, blurb, description, template, premium. */}
          <div hidden={step !== "article"} className="flex flex-col gap-4 sm:gap-8">
          {/* Where it's listed (owner 2026-10-14): Category · Sub category · Language on one line from 640px. */}
          <div className="grid gap-6 sm:grid-cols-3 sm:gap-x-5">
            <Section
              id="composer-category-section"
              label="Category"
              htmlFor="composer-category"
              required
              error={errors.category}
              flash={flash}
            >
              <CategoryPicker
                categoryOnly
                category={category}
                district={district}
                categoryInvalid={Boolean(errors.category)}
                districtInvalid={false}
                describedBy={errors.category ? "composer-category-section-error" : undefined}
                onCategoryChange={(value) => {
                  setCategory(value);
                  touch();
                  clearError("category", !value);
                  clearError("district", Boolean(districtError(value || null, district || null)));
                  clearError("subcategory", false);
                }}
                onDistrictChange={() => {}}
              />
            </Section>

            {/* Always shown (owner 2026-10-14): Karnataka's sub category is its district. */}
            <Section
              id="composer-subcategory-section"
              label="Sub category"
              htmlFor={category === "karnataka" ? "composer-district" : "composer-subcategory"}
              required
              error={errors.district ?? errors.subcategory}
              flash={flash}
            >
              {category === "karnataka" ? (
                <SelectBox
                  id="composer-district"
                  value={district}
                  aria-invalid={Boolean(errors.district) || undefined}
                  onChange={(event) => {
                    setDistrict(event.target.value);
                    touch();
                    clearError("district", Boolean(districtError(category || null, event.target.value || null)));
                  }}
                  className="h-12"
                >
                  <option value="" disabled>
                    Choose the district
                  </option>
                  {KARNATAKA_DISTRICTS.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </SelectBox>
              ) : (
                <SelectBox
                  id="composer-subcategory"
                  value={category && SUBCATEGORIES[category].includes(subcategory) ? subcategory : ""}
                  disabled={!category}
                  aria-invalid={Boolean(errors.subcategory) || undefined}
                  onChange={(event) => {
                    setSubcategory(event.target.value);
                    touch();
                    clearError("subcategory", !event.target.value);
                  }}
                  className="h-12"
                >
                  <option value="" disabled>
                    {category ? "Choose a sub category" : "Choose a category first"}
                  </option>
                  {category &&
                    SUBCATEGORIES[category].map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                </SelectBox>
              )}
            </Section>

            <Section id="composer-language-section" label="Language" htmlFor="composer-language">
              <SelectBox
                id="composer-language"
                value={language}
                onChange={(event) => {
                  setLanguage(languageOrEmpty(event.target.value));
                  touch();
                }}
                className="h-12"
              >
                <option value="">Automatic — {PRESS_LANGUAGE_LABELS[detectLanguage(title)]}</option>
                {PRESS_LANGUAGE_VALUES.map((code) => (
                  <option key={code} value={code}>
                    {PRESS_LANGUAGE_LABELS[code]}
                  </option>
                ))}
              </SelectBox>
            </Section>
          </div>

          <Section
            id="composer-title-section"
            label="Headline"
            htmlFor="composer-title"
            required
            error={errors.title}
            flash={flash}
            aside={<Counter value={title.length} max={TITLE_SOFT_MAX} label="Headline characters" overOnly />}
          >
            <TitleInput
              value={title}
              invalid={Boolean(errors.title)}
              describedBy={errors.title ? "composer-title-section-error" : undefined}
              onChange={(value) => {
                setTitle(value);
                touch();
                clearError("title", !value.trim());
              }}
              onEnter={() => editor?.commands.focus("end")}
            />
            {title.length > TITLE_SOFT_MAX && (
              <p className="text-xs font-semibold text-brand">
                {title.length - TITLE_SOFT_MAX} over {TITLE_SOFT_MAX} characters — the red part may be cut on cards. Shorter reads better.
              </p>
            )}
          </Section>

          {/* Blurb (owner 2026-10-14): at least 2 lines; shown under the headline and on the feed cards. */}
          <Section
            id="composer-blurb-section"
            label="Blurb"
            htmlFor="composer-blurb"
            required
            error={errors.blurb}
            flash={flash}
            aside={<Counter value={blurb.length} max={BLURB.max} label="Blurb characters" overOnly />}
          >
            {/* Past 100 characters is allowed but shown in red (owner 2026-10-15): the text is drawn by the mirror under the
                (transparent) textarea, which grows with it so the two never scroll apart. */}
            <div className="relative">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-px overflow-hidden whitespace-pre-wrap px-3.5 py-3 text-[0.9375rem] leading-relaxed text-ink [overflow-wrap:anywhere]"
              >
                {blurb.slice(0, BLURB.max)}
                {blurb.length > BLURB.max && (
                  <span className="text-brand underline decoration-brand/50 decoration-wavy underline-offset-4">{blurb.slice(BLURB.max)}</span>
                )}
              </div>
              <Textarea
                id="composer-blurb"
                rows={3}
                autoGrow
                maxLength={BLURB.hardMax}
                showCount={false}
                placeholder="A short line that sums up the story — readers see it under the headline and on the cards."
                value={blurb}
                aria-invalid={Boolean(errors.blurb) || undefined}
                textareaClassName="overflow-hidden whitespace-pre-wrap text-transparent caret-ink [overflow-wrap:anywhere] selection:bg-brand/20 placeholder:text-muted-2"
                onChange={(event) => {
                  setBlurb(event.target.value);
                  touch();
                  clearError("blurb", event.target.value.trim().length < BLURB.min);
                }}
              />
            </div>
            {blurb.length > BLURB.max && (
              <p className="text-xs font-semibold text-brand">
                {blurb.length - BLURB.max} over {BLURB.max} characters — allowed, but shorter reads better on the cards.
              </p>
            )}
            {blurb.trim().length < BLURB.min && !errors.blurb && (
              <p className="text-xs text-muted">{BLURB.min - blurb.trim().length} more characters to go</p>
            )}
          </Section>

          <Section
            id="composer-story-section"
            label="Description"
            required
            error={errors.bodyHtml}
            flash={flash}
          >
            <BodyModePicker
              value={bodyMode}
              onChange={(mode) => {
                // "Generate prompt" opens its popup; the story keeps its current way (owner 2026-10-16).
                if (mode === "prompt") {
                  setPromptOpen(true);
                  return;
                }
                setBodyMode(mode);
                touch();
                clearError("bodyHtml", false);
                clearError("linkUrl", false);
              }}
            />
            {bodyMode === "link" && (
              <div className="flex flex-col gap-1.5">
                <Input
                  id="composer-link"
                  type="url"
                  inputMode="url"
                  placeholder="https://example.com/full-story"
                  prefix={<Link2 aria-hidden className="size-4 text-muted" />}
                  value={linkUrl}
                  aria-invalid={Boolean(errors.linkUrl) || undefined}
                  onChange={(event) => {
                    setLinkUrl(event.target.value);
                    touch();
                    clearError("linkUrl", !isHttpLink(event.target.value));
                  }}
                />
                {errors.linkUrl ? (
                  <p className="text-sm font-semibold text-brand">{errors.linkUrl}</p>
                ) : (
                  <p className="text-sm text-muted">No description needed — readers tap “Read more” to open this link.</p>
                )}
              </div>
            )}
            <PromptHelper
              open={promptOpen}
              onOpenChange={setPromptOpen}
              language={language}
              onFill={(story) => {
                // The AI's answer, field by field, into this page (owner 2026-10-16) — the reporter then checks it.
                if (story.category) {
                  setCategory(story.category);
                  setSubcategory(story.subcategory ?? "");
                  setDistrict(story.district ?? "");
                }
                if (story.language) setLanguage(story.language);
                if (story.headline) setTitle(story.headline);
                if (story.blurb) setBlurb(story.blurb);
                if (story.descriptionHtml && editor) {
                  editor.commands.setContent(story.descriptionHtml, { emitUpdate: true });
                  setBody(snapshotOf(editor));
                  setBodyMode("text");
                }
                touch();
                setErrors({});
                const filled = [story.category && "category", story.headline && "headline", story.blurb && "blurb", story.descriptionHtml && "description"].filter(Boolean);
                toast.success("Your story is filled in", { description: `Check the ${filled.join(", ")} — then add images and publish.` });
                stepperRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            />
            {bodyMode === "ai" && (
              <AiWriter
                title={title}
                language={language || null}
                onGenerated={(html) => {
                  editor?.commands.setContent(html, { emitUpdate: true });
                  if (editor) setBody(snapshotOf(editor));
                  setBodyMode("text");
                  touch();
                  clearError("bodyHtml", false);
                }}
              />
            )}
            {/* Kept mounted (the editor keeps its text) and shown for "Description". */}
            <div hidden={bodyMode !== "text"}>
              <StoryEditor
                editor={editor}
                text={body.text}
                invalid={Boolean(errors.bodyHtml)}
                linkOpen={linkOpen}
                onLinkOpenChange={setLinkOpen}
              />
            </div>
          </Section>

          {/* Below 1024px (owner 2026-10-08): the live poster preview first, the template picker under it (tap a design,
              see it right above). Outside the picker's section, so jumping to the picker still centres the picker itself.
              No "Top of your story" preview any more (owner 2026-10-08). */}
          <div className="flex flex-col gap-6">
            <div className="lg:hidden">
              <LivePreview variant="compact" card={reelCard} {...livePreviewControls} />
            </div>
            <Section id="composer-template-section" label="Template" error={errors.template} flash={flash}>
              <TemplatePicker
                // Nothing picked = "No template" (owner 2026-10-07: publishing needs no template).
                value={posterTemplateOf(template)}
                story={previewPosterStory({ title, cover, posterFrame }, author, reporterLevel, frameUrl)}
                labelledBy="composer-template-section-label"
                describedBy={errors.template ? "composer-template-section-error" : undefined}
                invalid={Boolean(errors.template)}
                onChange={(value) => {
                  setTemplate(value);
                  touch();
                  clearError("template", false);
                }}
              />
            </Section>

            {/* Premium (owner 2026-10-14, "like YouTube" members-only): readers see the photo and headline, then "Buy premium". */}
            {!meetId && (
              <Section id="composer-premium-section" label="Premium">
                {/*
                  Members only (owner 2026-10-16): only once the Desk's membership conditions are met AND a price is set.
                  Not yet qualified → can't tick, with the progress and a way to see the conditions. Qualified but no
                  price → ticking opens "Set your membership price" (saves the draft, goes to Settings, comes back).
                */}
                <label
                  className={cn(
                    "flex items-start gap-3 rounded-2xl border px-4 py-3.5",
                    premiumLocked ? "cursor-not-allowed border-border bg-surface-2/50" : "cursor-pointer border-border bg-surface",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={premium}
                    disabled={premiumLocked}
                    onChange={(event) => {
                      if (event.target.checked && !hasMembershipPrice) {
                        // Qualified, no price yet: set it first.
                        if (!premiumLocked) setPriceAskOpen(true);
                        return;
                      }
                      setPremium(event.target.checked);
                      touch();
                    }}
                    className="mt-0.5 size-5 shrink-0 accent-[var(--brand)] disabled:opacity-40"
                  />
                  <span className="min-w-0">
                    <span className={cn("flex items-center gap-1.5 font-bold", premiumLocked ? "text-muted" : "text-ink")}>
                      <Crown aria-hidden className="size-4 text-amber-500" /> Members only
                      {premiumLocked && <Lock aria-hidden className="size-3.5 text-muted" />}
                    </span>
                    <span className="mt-0.5 block text-sm leading-relaxed text-muted">
                      Everyone sees the photo and headline; only your premium members can read the full story.
                    </span>
                    {premiumLocked && eligibility && (
                      <span className="mt-1.5 block text-sm font-semibold text-brand">
                        Unlocks when you meet the membership conditions · {eligibility.rules.filter((rule) => rule.done).length} of{" "}
                        {eligibility.rules.length} done.{" "}
                        <button
                          type="button"
                          onClick={(event) => {
                            event.preventDefault();
                            setPriceAskOpen(true);
                          }}
                          className="font-semibold underline"
                        >
                          See the conditions
                        </button>
                      </span>
                    )}
                    {!premiumLocked && !hasMembershipPrice && (
                      <span className="mt-1.5 block text-sm text-ink-2">You qualify — tick it to set your monthly price.</span>
                    )}
                    {premium && settings.data?.membershipPrice != null && (
                      <span className="mt-1.5 block text-sm text-ink-2">
                        Members pay ₹{settings.data.membershipPrice.toLocaleString("en-IN")} a month.
                      </span>
                    )}
                  </span>
                </label>
              </Section>
            )}
          </div>
          </div>
        </motion.div>

        {/* PREVIEW */}
        {step === "preview" && (
          <motion.div
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
            className="pt-8"
          >
            <PreviewPane
              input={{ fields, text: body.text, author, draftId, publishedAt: previewAt, reporterLevel }}
              problems={publishProblems}
              onFix={onFix}
              onChangeTemplate={onChangeTemplate}
              review={toReviewDesk && !live}
              sendTo={toOrganizer ? (meet?.organizer.name ?? "the organiser") : null}
            />
          </motion.div>
        )}

        <ActionBar>
          {writing ? (
            <>
              {!live && (
                <Button
                  variant="outline"
                  onClick={() => void saveDraft()}
                  loading={busy === "draft"}
                  disabled={actionsDisabled && busy !== "draft"}
                  leftIcon={<Save aria-hidden />}
                  className="px-3.5 sm:px-5"
                >
                  <span className="sm:hidden">Save</span>
                  <span className="hidden sm:inline">Save draft</span>
                </Button>
              )}
              <div className="flex-1" />
              {step === "poster" ? (
                <Button onClick={goNext} disabled={uploading !== null} rightIcon={<ArrowRight aria-hidden />}>
                  Next
                </Button>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    onClick={() => goTo("poster")}
                    disabled={busy === "publish"}
                    leftIcon={<ArrowLeft aria-hidden />}
                    className="px-3 sm:px-5"
                  >
                    <span className="max-[380px]:sr-only">Images</span>
                  </Button>
                  {/* Only once both images are in (owner 2026-10-16). */}
                  {imagesReady && detailsReady && (
                    <Button onClick={openPreview} disabled={busy === "publish"} leftIcon={<Eye aria-hidden />}>
                      Preview
                    </Button>
                  )}
                </>
              )}
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                onClick={() => goTo("article")}
                disabled={busy === "publish"}
                leftIcon={<ArrowLeft aria-hidden />}
                className="px-3 sm:px-5"
              >
                <span className="max-[380px]:sr-only">Edit</span>
              </Button>
              <div className="flex-1" />
              {!live && (
                <Button
                  variant="outline"
                  onClick={() => void saveDraft()}
                  loading={busy === "draft"}
                  disabled={actionsDisabled && busy !== "draft"}
                  leftIcon={<Save aria-hidden />}
                  className="px-3.5 sm:px-5"
                >
                  <span className="sm:hidden">Save</span>
                  <span className="hidden sm:inline">Save draft</span>
                </Button>
              )}
              <Button
                onClick={() => void publish()}
                loading={busy === "publish"}
                disabled={actionsDisabled && busy !== "publish"}
                leftIcon={<Send aria-hidden />}
              >
                {publishLabel}
              </Button>
            </>
          )}
        </ActionBar>

        {uploading && (
          <p className="sr-only" role="status">
            Uploading the {UPLOADING_NOUN[uploading]}. Saving and publishing are available once it finishes.
          </p>
        )}

        {draftId && (
          <DeleteDraftDialog
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            draftId={draftId}
            title={title}
            onDeleted={onDeleted}
          />
        )}
        {needsPressPass && <PressPassGate open={gateOpen} onOpenChange={setGateOpen} />}

        <Modal
          open={priceAskOpen}
          onOpenChange={(open) => !open && busy !== "draft" && setPriceAskOpen(false)}
          title={premiumLocked ? "Unlock premium membership first" : "Set your membership price"}
          description={
            premiumLocked
              ? "Members-only stories open once you meet every condition below. We'll save this story as a draft if you open Settings to see your progress."
              : "We'll save this story as a draft and open Settings. Once your price is saved you come straight back here — everything you've written stays."
          }
          size="sm"
          bodyClassName="py-1"
          footer={
            <div className="flex w-full flex-col gap-2">
              <Button
                loading={busy === "draft"}
                fullWidth
                onClick={async () => {
                  const id = await saveDraft();
                  if (!id) return;
                  setPriceAskOpen(false);
                  router.push(`/settings?section=membership&back=${encodeURIComponent(`/publish/${id}`)}`);
                }}
              >
                {premiumLocked ? "Save draft & see my progress" : "Save draft & set price"}
              </Button>
              <Button variant="ghost" fullWidth disabled={busy === "draft"} onClick={() => setPriceAskOpen(false)}>
                Keep writing
              </Button>
            </div>
          }
        >
          {premiumLocked && eligibility ? (
              <ul className="flex flex-col gap-2 py-1">
                {eligibility.rules.map((rule) => (
                  <li key={rule.metric} className="flex items-center gap-2.5 text-sm">
                    <span
                      aria-hidden
                      className={cn(
                        "flex size-5 shrink-0 items-center justify-center rounded-full",
                        rule.done ? "bg-[#22a35a] text-white" : "bg-surface-2 text-muted ring-1 ring-border ring-inset",
                      )}
                    >
                      {rule.done ? <Check className="size-3" strokeWidth={3.5} /> : <Lock className="size-2.5" />}
                    </span>
                    <span className={cn("min-w-0 flex-1", rule.done ? "text-ink" : "text-ink-2")}>{rule.title}</span>
                    {rule.metric !== "verified" && (
                      <span className="shrink-0 text-xs font-semibold tabular-nums text-muted">
                        {Math.min(rule.current, rule.target).toLocaleString("en-IN")} / {rule.target.toLocaleString("en-IN")}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : undefined}
        </Modal>

        <LeaveDialog
          open={guard.pendingHref !== null}
          canSave={!live && (hasDraftContent(fields, textLength) || (linkArg !== null && linkArg.trim() !== ""))}
          saving={busy === "draft"}
          onStay={guard.cancel}
          onLeave={guard.leave}
          onSaveAndLeave={async () => {
            if (await saveDraft()) guard.leave();
            else guard.cancel();
          }}
        />

        {published && <PublishSuccess title={published.title} onDone={finishPublish} />}
        {submitted && <PublishSuccess variant="review" title={submitted.title} onDone={finishSubmit} />}
      </div>

      {/* ≥1024px, beside the writing page (owner 2026-10-07): the poster and the article image, live; narrower screens
          show them under the template picker. Scrolls on its own when taller than the screen. */}
      {livePreview && (
        <aside
          aria-label="Live preview"
          className="no-scrollbar hidden lg:sticky lg:top-[calc(var(--nav-h)+1.25rem)] lg:col-start-2 lg:row-start-1 lg:flex lg:max-h-[calc(100dvh-var(--nav-h)-2.5rem)] lg:flex-col lg:gap-4 lg:overflow-y-auto lg:pb-4"
        >
          <LivePreview variant="panel" card={reelCard} {...livePreviewControls} />
        </aside>
      )}
    </div>
  );
}

/* ─────────────────────────── Pieces ─────────────────────────── */

/** What an upload is called in the save status ("Uploading article image…"). */
const UPLOADING_NOUN: Record<ComposerMedia, string> = {
  cover: "cover",
  video: "video",
  articleImage: "article image",
  articleVideo: "article video",
};

function ComposerHeader({
  author,
  editing,
  live,
  reviewState,
  status,
  onDelete,
  draftsHref,
}: {
  author: ComposerAuthor;
  editing: boolean;
  live: boolean;
  reviewState: ArticleReview["state"] | null;
  status: ReactNode;
  onDelete?: () => void;
  /** The author's Drafts tab (owner 2026-10-08: "add a Drafts button in New story"); none for Readers, who have none. */
  draftsHref?: string;
}) {
  return (
    // data-own-back: the page's back arrow is this header's (the shell's one is hidden, globals.css). Redesign
    // 2026-10-07: the arrow beside a bold title (like the other app pages), then who's filing and the save status.
    <header data-own-back="" className="flex flex-col gap-2 sm:gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <BackButton fallback="/" plain />
          <h1 className="font-wide text-[1.625rem] font-black leading-tight tracking-tight text-ink max-[359px]:text-2xl sm:text-[2rem]">
            {live
              ? "Edit story"
              : reviewState === "in_review"
                ? "In review"
                : reviewState === "returned"
                  ? "Returned story"
                  : editing
                    ? "Edit draft"
                    : "Publish article"}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {draftsHref && (
            // A link, so the unsaved-changes guard asks before leaving a story with changes.
            <Button href={draftsHref} variant="secondary" size="sm" leftIcon={<FilePen aria-hidden />} className="shrink-0">
              Drafts
            </Button>
          )}
          {onDelete && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              leftIcon={<Trash2 aria-hidden />}
              className="-mr-2 shrink-0 text-muted hover:text-brand"
            >
              <span className="max-[399px]:sr-only">{reviewState === "in_review" ? "Delete story" : "Delete draft"}</span>
            </Button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[0.8125rem] text-muted">
        <span className="inline-flex min-w-0 items-center gap-2 rounded-full bg-surface-2 py-1 pl-1 pr-3">
          <Avatar src={author.image} name={author.name} size="xs" decorative />
          <span className="truncate">
            Publishing as <span className="font-bold text-ink">{author.name}</span> <UserHandle username={author.username} />
          </span>
        </span>
        {status}
      </div>
    </header>
  );
}

function SaveStatus({
  busy,
  dirty,
  savedAt,
  uploading,
  sending,
  live,
}: {
  busy: Busy;
  dirty: boolean;
  savedAt: string | null;
  uploading: ComposerMedia | null;
  /** What Publish shows while it runs ("Publishing…", "Submitting…", "Sending…"). */
  sending: string;
  live: boolean;
}) {
  let content: ReactNode;
  if (busy === "draft" || busy === "publish") {
    content = (
      <>
        <SpeedLinesLoader size="xs" label={null} />
        {busy === "publish" && !live ? sending : "Saving…"}
      </>
    );
  } else if (uploading) {
    content = (
      <>
        <SpeedLinesLoader size="xs" label={null} />
        Uploading {UPLOADING_NOUN[uploading]}…
      </>
    );
  } else if (dirty) {
    content = (
      <>
        <CircleDot aria-hidden className="size-3.5 text-brand" />
        Unsaved changes · kept on this device
      </>
    );
  } else if (live) {
    content = (
      <>
        <span aria-hidden className="size-1.5 rounded-full bg-success" />
        Live · changes show when you save
      </>
    );
  } else if (savedAt) {
    content = (
      <>
        <span aria-hidden className="size-1.5 rounded-full bg-success" />
        Saved to drafts <TimeAgo date={savedAt} className="text-faint" />
      </>
    );
  } else {
    content = "Not saved yet";
  }
  return (
    <p role="status" aria-live="polite" className="flex items-center gap-2">
      {content}
    </p>
  );
}

/**
 * The action row at the END of the form (owner 2026-10-08: shown once the writer reaches it, not stuck to the screen
 * the whole time). Phones: full-bleed along the page's bottom edge with safe-area padding (the app's tab bar steps aside
 * while composing, see FocusMode). ≥768px: a rounded dock under the form.
 */
function ActionBar({ children }: { children: ReactNode }) {
  return (
    <div
      className={cn(
        "-mx-4 mt-10 border-t border-border bg-surface px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:-mx-6 sm:px-6",
        "md:mx-0 md:rounded-2xl md:border md:px-4 md:pb-3 md:shadow-card",
      )}
    >
      <div className="flex items-center gap-2 sm:gap-3">{children}</div>
    </div>
  );
}

/**
 * While filing: the shell's back arrow is hidden (the composer has its own), and on phones the bottom tab bar
 * (Home · Profile) too, so the action bar owns the bottom edge. The side menu stays, as on every other page
 * (owner 2026-10-09: "Home … and all" on the left on desktop; it was hidden here from 2026-10-08). The top nav stays available.
 */
function FocusMode() {
  return <style>{`[data-page-back]{display:none!important}@media (max-width: 767.98px){nav[aria-label="Primary"]{display:none}}`}</style>;
}
