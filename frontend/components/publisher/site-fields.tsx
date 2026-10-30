"use client";

import { Check, Circle } from "lucide-react";
import { COUNTRIES } from "@/components/auth/phone-auth-form";
import { SITE_PASSWORD_RULES } from "@/lib/shared/contracts";

export { COUNTRIES };

/** `+91 9876543210` → country code + digits (no code saved yet: +91). */
export function splitPhone(value: string): { code: string; digits: string } {
  const match = /^(\+\d{1,4})\s*(\d*)$/.exec(value.trim());
  return match ? { code: match[1]!, digits: match[2]! } : { code: "+91", digits: value.replace(/\D/g, "") };
}

/** Back to the saved form; no digits = no phone. */
export const joinPhone = (code: string, digits: string) => (digits ? `${code} ${digits}` : "");

/** Digits only, at most 10 for India (owner 2026-10-30) and 14 elsewhere. */
export const cleanDigits = (code: string, raw: string) => raw.replace(/\D/g, "").slice(0, code === "+91" ? 10 : 14);

/** The country code picker that sits inside a phone input (`prefix`). */
export function CountrySelect({ value, onChange, className }: { value: string; onChange: (code: string) => void; className?: string }) {
  return (
    <select
      aria-label="Country code"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`h-full cursor-pointer bg-transparent pr-1 text-[0.9375rem] font-bold outline-none ${className ?? ""}`}
    >
      {COUNTRIES.map((c) => (
        <option key={c.code} value={c.code}>
          {c.flag} {c.code}
        </option>
      ))}
    </select>
  );
}

/** The password rules, each ticked as it's met (owner 2026-10-30: "validate caps like that"). */
export function PasswordChecklist({ value, className }: { value: string; className?: string }) {
  return (
    <ul className={`grid grid-cols-1 gap-1 text-xs sm:grid-cols-2 ${className ?? ""}`} aria-label="Password rules">
      {SITE_PASSWORD_RULES.map((rule) => {
        const ok = rule.test(value);
        return (
          <li key={rule.id} className={`flex items-center gap-1.5 ${ok ? "font-semibold text-green-700" : "text-gray-500"}`}>
            {ok ? <Check aria-hidden className="size-3.5" strokeWidth={3} /> : <Circle aria-hidden className="size-3" />}
            {rule.label}
            <span className="sr-only">{ok ? "(done)" : "(needed)"}</span>
          </li>
        );
      })}
    </ul>
  );
}
