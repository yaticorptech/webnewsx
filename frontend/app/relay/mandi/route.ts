/**
 * Farm prices relay (owner 2026-11-07: "i need live arecanut price coconut price"). data.gov.in doesn't answer the API
 * server (Railway, Europe), so the backend (routes/mandi.ts) asks for AGMARKNET's daily Karnataka mandi prices here
 * instead: this runs in Mumbai (bom1) and passes the one dataset through. It holds no key — the caller sends its own —
 * and it only ever fetches that dataset for Karnataka, so it can't be used to reach anything else.
 */
export const runtime = "nodejs";
export const preferredRegion = "bom1";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const RESOURCE = "https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070";

export async function GET(request: Request): Promise<Response> {
  const query = new URL(request.url).searchParams;
  const key = query.get("api-key") ?? "";
  const limit = Math.min(1000, Math.max(1, Number(query.get("limit")) || 1000));
  const offset = Math.max(0, Number(query.get("offset")) || 0);
  if (!/^[A-Za-z0-9]{20,80}$/.test(key)) return Response.json({ error: "api-key required" }, { status: 400 });
  const params = new URLSearchParams({ "api-key": key, format: "json", limit: String(limit), offset: String(offset), "filters[state.keyword]": "Karnataka" });
  const upstream = await fetch(`${RESOURCE}?${params}`, { signal: AbortSignal.timeout(25_000), cache: "no-store" }).catch(() => null);
  if (!upstream) return Response.json({ error: "data.gov.in did not answer" }, { status: 504 });
  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
