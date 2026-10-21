"use client";

import { useEditorState, type Editor } from "@tiptap/react";
import {
  Bold,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Underline,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { Fragment, useRef, useState, type KeyboardEvent } from "react";
import { useMounted } from "@/lib/hooks/use-mounted";
import { cn } from "@/lib/utils";
import { STORY_EDITOR_ID } from "./use-story-editor";

type ToolState = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  h2: boolean;
  h3: boolean;
  bullet: boolean;
  ordered: boolean;
  quote: boolean;
  link: boolean;
  canUndo: boolean;
  canRedo: boolean;
};

type Tool = {
  id: keyof ToolState | "undo" | "redo";
  label: string;
  icon: LucideIcon;
  /** Human shortcut, `Mod` = ⌘ on Apple, Ctrl elsewhere. */
  keys: string;
  /** aria-keyshortcuts value (Mod → Meta/Control). */
  aria: string;
  toggle: boolean;
  run: (editor: Editor) => void;
};

const TOOL_GROUPS: Tool[][] = [
  [
    {
      id: "bold",
      label: "Bold",
      icon: Bold,
      keys: "Mod+B",
      aria: "Mod+B",
      toggle: true,
      run: (e) => e.chain().focus().toggleBold().run(),
    },
    {
      id: "italic",
      label: "Italic",
      icon: Italic,
      keys: "Mod+I",
      aria: "Mod+I",
      toggle: true,
      run: (e) => e.chain().focus().toggleItalic().run(),
    },
    {
      id: "underline",
      label: "Underline",
      icon: Underline,
      keys: "Mod+U",
      aria: "Mod+U",
      toggle: true,
      run: (e) => e.chain().focus().toggleUnderline().run(),
    },
    {
      id: "strike",
      label: "Strikethrough",
      icon: Strikethrough,
      keys: "Mod+Shift+S",
      aria: "Mod+Shift+S",
      toggle: true,
      run: (e) => e.chain().focus().toggleStrike().run(),
    },
  ],
  [
    {
      id: "h2",
      label: "Heading",
      icon: Heading2,
      keys: "Mod+Alt+2",
      aria: "Mod+Alt+2",
      toggle: true,
      run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
    },
    {
      id: "h3",
      label: "Subheading",
      icon: Heading3,
      keys: "Mod+Alt+3",
      aria: "Mod+Alt+3",
      toggle: true,
      run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
    },
  ],
  [
    {
      id: "bullet",
      label: "Bulleted list",
      icon: List,
      keys: "Mod+Shift+8",
      aria: "Mod+Shift+8",
      toggle: true,
      run: (e) => e.chain().focus().toggleBulletList().run(),
    },
    {
      id: "ordered",
      label: "Numbered list",
      icon: ListOrdered,
      keys: "Mod+Shift+7",
      aria: "Mod+Shift+7",
      toggle: true,
      run: (e) => e.chain().focus().toggleOrderedList().run(),
    },
    {
      id: "quote",
      label: "Quote",
      icon: Quote,
      keys: "Mod+Shift+B",
      aria: "Mod+Shift+B",
      toggle: true,
      run: (e) => e.chain().focus().toggleBlockquote().run(),
    },
  ],
  [{ id: "link", label: "Link", icon: Link2, keys: "Mod+K", aria: "Mod+K", toggle: true, run: () => undefined }],
  [
    {
      id: "undo",
      label: "Undo",
      icon: Undo2,
      keys: "Mod+Z",
      aria: "Mod+Z",
      toggle: false,
      run: (e) => e.chain().focus().undo().run(),
    },
    {
      id: "redo",
      label: "Redo",
      icon: Redo2,
      keys: "Mod+Shift+Z",
      aria: "Mod+Shift+Z",
      toggle: false,
      run: (e) => e.chain().focus().redo().run(),
    },
  ],
];

const TOOLS = TOOL_GROUPS.flat();
const TOOL_INDEX = new Map(TOOLS.map((tool, index) => [tool.id, index]));

function readState(editor: Editor | null): ToolState | null {
  if (!editor) return null;
  return {
    bold: editor.isActive("bold"),
    italic: editor.isActive("italic"),
    underline: editor.isActive("underline"),
    strike: editor.isActive("strike"),
    h2: editor.isActive("heading", { level: 2 }),
    h3: editor.isActive("heading", { level: 3 }),
    bullet: editor.isActive("bulletList"),
    ordered: editor.isActive("orderedList"),
    quote: editor.isActive("blockquote"),
    link: editor.isActive("link"),
    canUndo: editor.can().undo(),
    canRedo: editor.can().redo(),
  };
}

function isApple(): boolean {
  if (typeof navigator === "undefined") return false;
  return /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent);
}

export type EditorToolbarProps = {
  editor: Editor | null;
  onLink: () => void;
  className?: string;
};

/**
 * Formatting toolbar (WAI-ARIA toolbar: one tab stop, arrow keys move between buttons). Buttons keep
 * the editor selection (mousedown is prevented) and expose aria-pressed + aria-keyshortcuts.
 */
export function EditorToolbar({ editor, onLink, className }: EditorToolbarProps) {
  const state = useEditorState({ editor, selector: ({ editor: current }) => readState(current) });
  const mounted = useMounted();
  const apple = mounted && isApple();
  const [focusIndex, setFocusIndex] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  const format = (keys: string) =>
    keys
      .split("+")
      .map((k) =>
        k === "Mod"
          ? apple
            ? "⌘"
            : "Ctrl"
          : k === "Shift"
            ? apple
              ? "⇧"
              : "Shift"
            : k === "Alt"
              ? apple
                ? "⌥"
                : "Alt"
              : k,
      )
      .join(apple ? "" : "+");
  const ariaKeys = (keys: string) => keys.replace("Mod", apple ? "Meta" : "Control");

  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys: Record<string, (i: number) => number> = {
      ArrowRight: (i) => (i + 1) % TOOLS.length,
      ArrowLeft: (i) => (i - 1 + TOOLS.length) % TOOLS.length,
      Home: () => 0,
      End: () => TOOLS.length - 1,
    };
    const next = keys[event.key];
    if (!next) return;
    event.preventDefault();
    const backwards = event.key === "ArrowLeft" || event.key === "End";
    // Skip disabled buttons (undo/redo with an empty history).
    let index = next(focusIndex);
    for (let tries = 0; tries < TOOLS.length && buttons.current[index]?.disabled; tries++) {
      index = (index + (backwards ? -1 : 1) + TOOLS.length) % TOOLS.length;
    }
    setFocusIndex(index);
    const button = buttons.current[index];
    button?.focus();
    button?.scrollIntoView({ block: "nearest", inline: "nearest" });
  };

  return (
    <div
      role="toolbar"
      aria-label="Text formatting"
      aria-controls={STORY_EDITOR_ID}
      onKeyDown={move}
      className={cn("no-scrollbar flex items-center gap-0.5 overflow-x-auto overscroll-x-contain", className)}
    >
      {TOOL_GROUPS.map((group, groupIndex) => (
        <Fragment key={group[0]!.id}>
          {groupIndex > 0 && <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-border" />}
          {group.map((tool) => {
            const index = TOOL_INDEX.get(tool.id) ?? 0;
            const active = tool.toggle && tool.id !== "undo" && tool.id !== "redo" ? Boolean(state?.[tool.id]) : false;
            const disabled =
              !editor || (tool.id === "undo" && !state?.canUndo) || (tool.id === "redo" && !state?.canRedo);
            const Icon = tool.icon;
            return (
              <button
                key={tool.id}
                ref={(node) => {
                  buttons.current[index] = node;
                }}
                type="button"
                tabIndex={index === focusIndex ? 0 : -1}
                aria-label={tool.label}
                aria-pressed={tool.toggle ? active : undefined}
                aria-keyshortcuts={ariaKeys(tool.aria)}
                title={`${tool.label} (${format(tool.keys)})`}
                disabled={disabled}
                onMouseDown={(event) => event.preventDefault()}
                onFocus={() => setFocusIndex(index)}
                onClick={() => {
                  if (!editor) return;
                  if (tool.id === "link") onLink();
                  else tool.run(editor);
                }}
                className={cn(
                  "relative inline-flex size-11 shrink-0 items-center justify-center rounded-lg transition-[color,background-color,transform] duration-150 ease-snap sm:size-9",
                  "active:scale-90 disabled:pointer-events-none disabled:opacity-35 motion-reduce:active:scale-100 [&_svg]:size-4.5",
                  active ? "bg-tint-2 text-brand" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                )}
              >
                <Icon aria-hidden strokeWidth={active ? 2.5 : 2} />
                {active && <span aria-hidden className="absolute inset-x-2.5 bottom-1 h-0.5 rounded-full bg-brand" />}
              </button>
            );
          })}
        </Fragment>
      ))}
    </div>
  );
}
