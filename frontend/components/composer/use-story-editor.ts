"use client";

import { CharacterCount, Placeholder } from "@tiptap/extensions";
import { useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useLayoutEffect, useRef } from "react";
import { LIMITS } from "@/lib/shared/contracts";
import { normalizeText } from "./composer-model";
import styles from "./editor.module.css";

/** Only absolute http(s) links (SPEC §5.6); everything else is dropped by the link mark. */
export const isHttpHref = (href: string) => /^https?:\/\/[^\s]+$/i.test(href.trim());

export const LINK_REL = "noopener noreferrer nofollow ugc";

/** DOM id of the contenteditable (toolbar aria-controls, error focus). */
export const STORY_EDITOR_ID = "composer-story";

export type EditorSnapshot = { html: string; text: string };

/** Current body as the composer stores it: "" for an empty editor, collapsed plain text for counting. */
export function snapshotOf(editor: Editor): EditorSnapshot {
  return {
    html: editor.isEmpty ? "" : editor.getHTML(),
    text: normalizeText(editor.getText({ blockSeparator: " " })),
  };
}

type Options = {
  initialHtml: string;
  describedBy?: string;
  onReady: (editor: Editor) => void;
  onChange: (snapshot: EditorSnapshot) => void;
  onLinkShortcut: () => void;
};

/**
 * The composer's Tiptap v3 editor. StarterKit v3 already bundles Link, Underline, UndoRedo,
 * ListKeymap and TrailingNode, so only Placeholder + CharacterCount are added.
 * Created on the client only (`immediatelyRender: false`) to avoid hydration mismatches.
 */
export function useStoryEditor({
  initialHtml,
  describedBy,
  onReady,
  onChange,
  onLinkShortcut,
}: Options): Editor | null {
  // Handlers change every render; the editor is created once, so it calls through a ref.
  const handlers = useRef({ onReady, onChange, onLinkShortcut });
  useLayoutEffect(() => {
    handlers.current = { onReady, onChange, onLinkShortcut };
  });

  return useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: {
          openOnClick: false,
          autolink: true,
          linkOnPaste: true,
          defaultProtocol: "https",
          isAllowedUri: (url) => isHttpHref(url),
          HTMLAttributes: { rel: LINK_REL, target: "_blank" },
        },
      }),
      // No prompt inside the box (owner 2026-10-08); the extension stays so an empty editor keeps its paragraph.
      Placeholder.configure({ placeholder: "" }),
      CharacterCount.configure({ limit: LIMITS.bodyTextMax }),
    ],
    content: initialHtml || "",
    editorProps: {
      attributes: {
        id: STORY_EDITOR_ID,
        class: `prose-news ${styles.content}`,
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": "Story",
        ...(describedBy ? { "aria-describedby": describedBy } : {}),
        spellcheck: "true",
      },
      handleKeyDown: (_view, event) => {
        if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "k") {
          event.preventDefault();
          handlers.current.onLinkShortcut();
          return true;
        }
        return false;
      },
    },
    onCreate: ({ editor }) => handlers.current.onReady(editor),
    onUpdate: ({ editor }) => handlers.current.onChange(snapshotOf(editor)),
  });
}
