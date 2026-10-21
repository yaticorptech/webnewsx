"use client";

import { AtSign, CircleCheck, Lock, Mail, Send } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { api, errorMessage, isApiError } from "@/lib/api";
import { CONTACT_MESSAGE_MAX, CONTACT_MESSAGE_MIN } from "@/lib/shared/contracts";
import { cn } from "@/lib/utils";

/**
 * Contact us (owner 2026-10-02): the signed-in member's email and username, shown read-only (they come from the
 * account; the server uses those, never anything typed here), and their message.
 */
export function ContactForm({ email, username }: { email: string; username: string }) {
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const length = message.trim().length;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (sending) return;
    if (length < CONTACT_MESSAGE_MIN) {
      setError(`Tell us a little more (at least ${CONTACT_MESSAGE_MIN} characters).`);
      return;
    }
    setSending(true);
    setError(null);
    try {
      await api.contact(message.trim());
      setSent(true);
      setMessage("");
    } catch (err) {
      if (isApiError(err) && err.fields?.message) setError(err.fields.message);
      else toast.error("Couldn't send your message", { description: errorMessage(err) });
    } finally {
      setSending(false);
    }
  };

  if (sent) {
    return (
      <div role="status" className="card flex flex-col items-center gap-4 px-6 py-12 text-center sm:px-10">
        <span className="flex size-14 items-center justify-center rounded-full bg-success-soft text-success-strong">
          <CircleCheck aria-hidden className="size-7" />
        </span>
        <div>
          <p className="font-wide text-xl font-extrabold text-ink">Message sent</p>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">
            Thanks — we&rsquo;ll reply to <strong className="font-semibold text-ink">{email}</strong>, usually within 2 working days.
          </p>
        </div>
        <Button variant="outline" onClick={() => setSent(false)}>
          Send another message
        </Button>
      </div>
    );
  }

  return (
    <form noValidate onSubmit={submit} className="card flex flex-col gap-5 px-5 py-6 sm:px-8 sm:py-8" aria-label="Contact us">
      <div className="grid gap-4 sm:grid-cols-2">
        <ReadOnly label="Email" icon={<Mail aria-hidden />} value={email} />
        <ReadOnly label="Username" icon={<AtSign aria-hidden />} value={username} />
      </div>
      <p className="-mt-2 flex items-center gap-1.5 text-xs text-muted">
        <Lock aria-hidden className="size-3.5" /> From your account — we&rsquo;ll reply to this email.
      </p>

      <Field
        label="Your message"
        required
        error={error}
        labelAside={
          <span className={cn("text-xs tabular-nums", length > CONTACT_MESSAGE_MAX ? "text-brand" : "text-muted")}>
            {length.toLocaleString("en-IN")} / {CONTACT_MESSAGE_MAX.toLocaleString("en-IN")}
          </span>
        }
        hint="A question about a story, a takedown request, your Press Pass, a problem with the app — anything."
      >
        <Textarea
          value={message}
          maxLength={CONTACT_MESSAGE_MAX}
          rows={7}
          autoGrow
          placeholder="Write your message…"
          onChange={(event) => {
            setMessage(event.target.value);
            if (error) setError(null);
          }}
        />
      </Field>

      <div className="flex justify-end">
        <Button type="submit" size="lg" loading={sending} leftIcon={<Send aria-hidden />} className="max-sm:w-full">
          Send message
        </Button>
      </div>
    </form>
  );
}

function ReadOnly({ label, icon, value }: { label: string; icon: ReactNode; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-sm font-semibold text-ink">{label}</span>
      <div
        aria-readonly="true"
        title={value}
        className="flex h-11 min-w-0 items-center gap-2.5 rounded-xl border border-border bg-surface-2 px-3.5 text-[0.9375rem] text-ink-2 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted"
      >
        {icon}
        <span className="min-w-0 truncate">{value}</span>
      </div>
    </div>
  );
}
