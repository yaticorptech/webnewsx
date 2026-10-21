"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { validateNewUsername, type UsernameCheck } from "@/lib/shared/contracts";

/** Debounce for the live availability check (SPEC §3.9). */
export const USERNAME_CHECK_DEBOUNCE_MS = 350;

export type UsernameStatus =
  | { state: "idle" }
  /** Typing a value whose format is still incomplete — show the rules hint, no verdict yet. */
  | { state: "typing" }
  | { state: "checking" }
  | { state: "available"; message: string }
  /** The viewer's own current username (settings). */
  | { state: "current" }
  | { state: "unavailable"; message: string; suggestions: string[] }
  | { state: "invalid"; message: string }
  /** Couldn't reach the server (network / rate limit): let the form continue, the server decides. */
  | { state: "error"; message: string };

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/**
 * Live username verdict for `value` (already sanitised: lowercase letters and dots).
 * Format problems are decided locally; reserved/taken/available comes from GET /api/username/check
 * (debounced 350ms, cached per name through `qk.usernameCheck`).
 */
export function useUsernameCheck(value: string, currentUsername?: string | null) {
  const queryClient = useQueryClient();
  const debounced = useDebounced(value, USERNAME_CHECK_DEBOUNCE_MS);
  const settled = debounced === value;
  const format = debounced ? validateNewUsername(debounced) : null;
  const isCurrent = Boolean(currentUsername) && debounced === currentUsername;
  const needsServer = Boolean(debounced) && !isCurrent && format !== null && (format.ok || format.code === "reserved");

  const query = useQuery({
    queryKey: qk.usernameCheck(debounced),
    queryFn: ({ signal }) => api.checkUsername(debounced, signal),
    enabled: needsServer,
    staleTime: 30_000,
    retry: false,
  });

  let status: UsernameStatus;
  if (!value) status = { state: "idle" };
  else if (currentUsername && value === currentUsername) status = { state: "current" };
  else if (!settled) {
    const local = validateNewUsername(value);
    status = local.ok || local.code === "reserved" ? { state: "checking" } : { state: "typing" };
  } else if (format && !format.ok && format.code !== "reserved") status = { state: "invalid", message: format.message };
  else if (query.isError) status = { state: "error", message: "Couldn't check right now — we'll confirm when you continue." };
  else if (!query.data) status = { state: "checking" };
  else status = fromCheck(query.data);

  /** Marks a server-suggested name as available so picking a chip shows ✓ instantly. */
  const primeAvailable = useCallback(
    (username: string) => {
      queryClient.setQueryData<UsernameCheck>(qk.usernameCheck(username), {
        available: true,
        message: "Username is available",
        suggestions: [],
      });
    },
    [queryClient],
  );

  /** Forget a cached verdict (e.g. the server said 409 on submit). */
  const invalidate = useCallback(
    (username: string) => queryClient.invalidateQueries({ queryKey: qk.usernameCheck(username) }),
    [queryClient],
  );

  return { status, primeAvailable, invalidate };
}

function fromCheck(check: UsernameCheck): UsernameStatus {
  if (check.available) return { state: "available", message: check.message || "Username is available" };
  if (check.reason === "invalid") return { state: "invalid", message: check.message };
  return { state: "unavailable", message: check.message || "Username is not available", suggestions: check.suggestions.slice(0, 3) };
}

/** True when the form may move on with this username (the server re-validates on submit). */
export function usernameAccepted(status: UsernameStatus): boolean {
  return status.state === "available" || status.state === "current" || status.state === "error";
}
