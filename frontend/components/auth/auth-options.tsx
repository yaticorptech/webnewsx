"use client";

import Link from "next/link";
import { FormAlert, OrDivider } from "./form-bits";
import { PhoneAuthForm } from "./phone-auth-form";
import { SocialButtons, useSocialLogins } from "./social-buttons";

/*
 * How readers sign up and log in (owner 2026-10-22: "registration through phone number or multiple social media
 * accounts", no email + password): the social logins on top, then the WhatsApp number. Email + password lives on
 * /login?desk=1 for the Editor Desk only.
 */
export function AuthOptions({ next, mode, initialError = null }: { next: string | null; mode: "login" | "signup"; initialError?: string | null }) {
  const social = useSocialLogins();
  return (
    <div className="flex flex-col gap-6">
      <FormAlert message={initialError} />
      <SocialButtons next={next} />
      {social && <OrDivider label="or with your WhatsApp number" />}
      <PhoneAuthForm next={next} mode={mode} />
      {/* One form logs in and signs up (a new number becomes a new account), so no "Create an account" / "Log in" switch. */}
      {mode === "login" && (
        <p className="text-center text-sm">
          <Link href={next ? `/login?desk=1&next=${encodeURIComponent(next)}` : "/login?desk=1"} className="text-muted underline-offset-4 hover:text-ink hover:underline">
            Editor Desk sign-in
          </Link>
        </p>
      )}
    </div>
  );
}
