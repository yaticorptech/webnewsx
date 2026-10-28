"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DomainCard } from "@/components/presspass/domain-card";
import { api, errorMessage } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import type { PressPassResponse } from "@/lib/shared/contracts";

/** Settings → Your domain (owner 2026-10-28): DNS verification of a Press Pass holder's website. */
export function DomainSettings() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: qk.pressPass, queryFn: ({ signal }) => api.pressPass(signal) });

  if (query.isPending) return <div className="card h-48 animate-pulse" />;
  if (query.isError) return <p className="card px-5 py-8 text-center text-sm text-muted">Couldn&rsquo;t load your domain. {errorMessage(query.error)}</p>;
  const pass = query.data.pressPass;
  if (!pass || pass.status === "revoked") {
    return <p className="card px-5 py-5 text-sm leading-relaxed text-muted sm:px-8">Domain verification is for active Press Pass holders.</p>;
  }
  return <DomainCard domain={pass.domain} onChange={(next) => queryClient.setQueryData<PressPassResponse>(qk.pressPass, { pressPass: next })} />;
}
