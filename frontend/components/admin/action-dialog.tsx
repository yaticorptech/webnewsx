"use client";

import { useId, useRef, useState, type FormEvent, type ReactNode, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/textarea";

export type NoteConfig = {
  label: string;
  placeholder?: string;
  hint?: ReactNode;
  /** Required notes block the confirm button until filled (e.g. a return note or suspension reason). */
  required?: boolean;
  requiredMessage?: string;
  maxLength?: number;
  defaultValue?: string;
};

export type ActionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel: string;
  confirmIcon?: ReactNode;
  cancelLabel?: string;
  note?: NoteConfig;
  /** Can't-be-undone actions (Delete account): the confirm button waits until this exact phrase is typed. */
  typeToConfirm?: { phrase: string; label: ReactNode };
  /** Resolve to close the dialog; reject to keep it open (the action already showed an error toast). */
  onConfirm: (note: string) => Promise<unknown> | void;
  /** Summary of what is affected (story, person, order). */
  children?: ReactNode;
};

/**
 * Confirm dialog for desk actions: optional/required note, keyboard operable (Modal: focus trap,
 * Esc), busy state while the call runs. Bottom sheet on phones.
 */
export function ActionDialog(props: ActionDialogProps) {
  const { open, onOpenChange, title, description } = props;
  const noteRef = useRef<HTMLTextAreaElement>(null);
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={title} description={description} size="md" initialFocus={props.note ? noteRef : undefined}>
      <ActionForm {...props} noteRef={noteRef} />
    </Modal>
  );
}

/** Mounted only while the dialog is open, so the note resets every time. */
function ActionForm({
  onOpenChange,
  confirmLabel,
  confirmIcon,
  cancelLabel = "Cancel",
  note,
  typeToConfirm,
  onConfirm,
  children,
  noteRef,
}: ActionDialogProps & { noteRef: RefObject<HTMLTextAreaElement | null> }) {
  const formId = useId();
  const [value, setValue] = useState(note?.defaultValue ?? "");
  const [typed, setTyped] = useState("");
  const phraseMatches = !typeToConfirm || typed.trim().toLowerCase() === typeToConfirm.phrase.toLowerCase();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = value.trim();
    if (note?.required && !trimmed) {
      setError(note.requiredMessage ?? "Add a note first");
      return;
    }
    if (!phraseMatches) return;
    setBusy(true);
    try {
      await onConfirm(trimmed);
      onOpenChange(false);
    } catch {
      // The action's own error toast explains what went wrong; keep the dialog (and the note) open.
    } finally {
      setBusy(false);
    }
  };

  return (
    <form id={formId} onSubmit={submit} className="flex flex-col gap-5" noValidate>
      {children}
      {note && (
        <Field label={note.label} hint={note.hint} error={error} required={note.required}>
          <Textarea
            ref={noteRef}
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              if (error) setError(null);
            }}
            placeholder={note.placeholder}
            maxLength={note.maxLength ?? 500}
            rows={3}
            autoGrow
            maxRows={8}
          />
        </Field>
      )}
      {typeToConfirm && (
        <Field label={typeToConfirm.label}>
          <Input
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            placeholder={typeToConfirm.phrase}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
          />
        </Field>
      )}
      <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
        <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
          {cancelLabel}
        </Button>
        <Button type="submit" loading={busy} leftIcon={confirmIcon} disabled={!phraseMatches}>
          {confirmLabel}
        </Button>
      </div>
    </form>
  );
}
