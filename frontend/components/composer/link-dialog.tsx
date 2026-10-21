"use client";

import type { Editor } from "@tiptap/react";
import { Link2, Unlink } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { LIMITS } from "@/lib/shared/contracts";
import { isHttpHref } from "./use-story-editor";

export type LinkDialogProps = {
  editor: Editor | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Add / edit / remove a link on the current selection (http and https only). */
export function LinkDialog({ editor, open, onOpenChange }: LinkDialogProps) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={editor?.isActive("link") ? "Edit link" : "Add link"}
      description="Link to a source, a document or related coverage. Only http:// and https:// addresses are allowed."
      size="sm"
    >
      {open && editor && <LinkForm editor={editor} onDone={() => onOpenChange(false)} />}
    </Modal>
  );
}

function LinkForm({ editor, onDone }: { editor: Editor; onDone: () => void }) {
  const active = editor.isActive("link");
  const [value, setValue] = useState<string>(() => (editor.getAttributes("link").href as string | undefined) ?? "");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    let href = value.trim();
    if (href && !/^[a-z][a-z0-9+.-]*:/i.test(href)) href = `https://${href}`;
    if (!href || !isHttpHref(href) || href.length > LIMITS.linkMax) {
      setError("Enter a full web address, e.g. https://example.com/report");
      inputRef.current?.focus();
      return;
    }
    const chain = editor.chain().focus();
    if (editor.state.selection.empty && !active) {
      // Links are inclusive while autolink is on: drop the stored mark so the next words aren't linked too.
      chain
        .insertContent({ type: "text", text: href, marks: [{ type: "link", attrs: { href } }] })
        .unsetMark("link")
        .run();
    } else {
      chain.extendMarkRange("link").setLink({ href }).run();
    }
    onDone();
  };

  const remove = () => {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    onDone();
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <Field label="Web address" error={error}>
        <Input
          ref={inputRef}
          type="url"
          inputMode="url"
          autoComplete="url"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="https://"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            if (error) setError(null);
          }}
          prefix={<Link2 className="size-4" />}
        />
      </Field>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
        {active && (
          <Button variant="ghost" onClick={remove} leftIcon={<Unlink aria-hidden />} className="sm:mr-auto">
            Remove link
          </Button>
        )}
        <Button variant="ghost" onClick={onDone} className={active ? undefined : "sm:ml-auto"}>
          Cancel
        </Button>
        <Button type="submit">{active ? "Update link" : "Add link"}</Button>
      </div>
    </form>
  );
}
