"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, KeyRound, Plug, Plus, Trash2, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { TimeAgo } from "@/components/ui/time-ago";
import { toast } from "@/components/ui/toast";
import { api, errorMessage, type ApiKeyRow, type ApiKeysResponse } from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

/**
 * Settings → Publishing API (owner 2026-11-04: "same like Meta"): a Press Pass holder makes a key, adds it to their own
 * website / CMS, and every story they post there is published on WebNewsX too (backend routes/publish-api.ts).
 */
export function PublishingApiCard() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: qk.apiKeys, queryFn: ({ signal }) => api.apiKeys.list(signal) });
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<{ name: string; key: string } | null>(null);
  const [removing, setRemoving] = useState<ApiKeyRow | null>(null);

  const create = useMutation({
    mutationFn: (keyName: string) => api.apiKeys.create(keyName),
    onSuccess: ({ key, ...row }) => {
      queryClient.setQueryData<ApiKeysResponse>(qk.apiKeys, (data) => (data ? { ...data, keys: [row, ...data.keys] } : data));
      setFresh({ name: row.name, key });
      setName("");
    },
    onError: (err) => toast.error("Couldn't make the key", { description: errorMessage(err) }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.apiKeys.remove(id),
    onSuccess: (_, id) => {
      queryClient.setQueryData<ApiKeysResponse>(qk.apiKeys, (data) => (data ? { ...data, keys: data.keys.filter((k) => k.id !== id) } : data));
      setRemoving(null);
      toast.success("Key deleted", { description: "Websites using it can't post any more." });
    },
    onError: (err) => toast.error("Couldn't delete the key", { description: errorMessage(err) }),
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = name.trim();
    if (!value) {
      setNameError("Name the key, e.g. the website it's for");
      return;
    }
    create.mutate(value);
  };

  if (query.isPending) return <Skeleton className="h-72 w-full rounded-2xl" />;
  if (query.isError) return <p className="card px-5 py-8 text-center text-sm text-muted">Couldn&rsquo;t load your API keys. {errorMessage(query.error)}</p>;
  const { keys, posts, endpoint } = query.data;

  return (
    <div className="flex flex-col gap-5">
      <section aria-labelledby="settings-api" className="card overflow-hidden">
        <div className="border-b border-border bg-surface-2/60 px-5 py-6 sm:px-8">
          <div className="flex items-start gap-3">
            <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-full bg-tint text-brand [&_svg]:size-5">
              <Plug />
            </span>
            <div className="min-w-0">
              <h2 id="settings-api" className="font-wide text-lg font-extrabold tracking-[-0.01em] text-ink">
                Publishing API
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">
                Connect your own website, app or CMS. Add a key there, and every story you post on it is published on WebNewsX under your
                name too — same rules as the composer.
              </p>
            </div>
          </div>
          <ol className="mt-5 grid gap-2 text-sm sm:grid-cols-3">
            {["Make a key below", "Paste it into your website's code", "Post a story there — it's live here"].map((step, i) => (
              <li key={step} className="flex items-center gap-2.5 rounded-xl bg-surface px-3 py-2.5 ring-1 ring-border">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-tint text-xs font-bold text-brand">{i + 1}</span>
                <span className="font-semibold text-ink-2">{step}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="px-5 py-6 sm:px-8">
          <form onSubmit={submit} noValidate className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <Field label="New key name" error={nameError} className="min-w-0 flex-1 sm:max-w-sm">
              <Input
                value={name}
                maxLength={60}
                placeholder="e.g. My WordPress site"
                onChange={(event) => {
                  setName(event.target.value);
                  if (nameError) setNameError(null);
                }}
              />
            </Field>
            <Button type="submit" className="sm:mt-7" loading={create.isPending} leftIcon={<Plus aria-hidden />} disabled={keys.length >= 5}>
              Create key
            </Button>
          </form>

          <h3 className="mt-7 text-xs font-bold uppercase tracking-[0.08em] text-muted">Your keys</h3>
          {keys.length === 0 ? (
            <p className="mt-2 rounded-xl border border-dashed border-border px-4 py-5 text-sm text-muted">No keys yet. Make one to connect a website.</p>
          ) : (
            <ul className="mt-2 divide-y divide-border rounded-xl ring-1 ring-border">
              {keys.map((key) => (
                <li key={key.id} className="flex items-center gap-3 px-4 py-3">
                  <KeyRound aria-hidden className="size-4 shrink-0 text-muted" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-ink">{key.name}</p>
                    <p className="text-xs text-muted">
                      <code className="font-mono">{key.prefix}…</code> · made <TimeAgo date={key.createdAt} /> ·{" "}
                      {key.lastUsedAt ? (
                        <>
                          last used <TimeAgo date={key.lastUsedAt} />
                        </>
                      ) : (
                        "never used"
                      )}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => setRemoving(key)} leftIcon={<Trash2 aria-hidden />} aria-label={`Delete key ${key.name}`}>
                    <span className="max-sm:sr-only">Delete</span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {keys.length >= 5 && <p className="mt-2 text-xs text-muted">You can have 5 keys. Delete one to make another.</p>}
        </div>
      </section>

      <ApiGuide endpoint={endpoint} />

      {posts.length > 0 && (
        <section aria-labelledby="settings-api-posts" className="card px-5 py-6 sm:px-8">
          <h2 id="settings-api-posts" className="font-wide text-base font-extrabold text-ink">
            Posted through the API
          </h2>
          <ul className="mt-3 divide-y divide-border">
            {posts.map((post) => (
              <li key={post.id} className="flex items-center gap-3 py-2.5 text-sm">
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[0.6875rem] font-bold uppercase tracking-wide",
                    post.status === "published" ? "bg-success-soft text-success-strong" : "bg-surface-2 text-ink-2",
                  )}
                >
                  {post.status === "in_review" ? "In review" : post.status}
                </span>
                {post.status === "published" && post.slug ? (
                  <Link href={`/a/${post.slug}`} className="min-w-0 flex-1 truncate font-semibold text-ink hover:text-brand">
                    {post.title}
                  </Link>
                ) : (
                  <span className="min-w-0 flex-1 truncate font-semibold text-ink-2">{post.title}</span>
                )}
                <span className="shrink-0 text-xs text-muted">
                  <TimeAgo date={post.createdAt} variant="short" />
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Modal
        open={fresh !== null}
        onOpenChange={(open) => {
          if (!open) setFresh(null);
        }}
        title="Your new API key"
        description={fresh ? `“${fresh.name}”. Copy it now — for your safety it's shown only this once.` : undefined}
        size="md"
        dismissible
      >
        {fresh && (
          <div className="flex flex-col gap-4">
            <CopyBox value={fresh.key} />
            <p className="flex gap-2 rounded-xl bg-tint px-3 py-2.5 text-xs leading-relaxed text-ink-2">
              <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-brand" />
              Anyone with this key can publish stories as you. Keep it on your website&rsquo;s server, never in public pages. Lost it? Delete it
              and make a new one.
            </p>
            <div className="flex justify-end">
              <Button onClick={() => setFresh(null)}>I&rsquo;ve copied it</Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title="Delete this key?"
        description={removing ? `Websites using “${removing.name}” stop posting at once. Stories already published stay.` : undefined}
        size="sm"
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setRemoving(null)}>
            Cancel
          </Button>
          <Button variant="danger" loading={remove.isPending} onClick={() => removing && remove.mutate(removing.id)}>
            Delete key
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function CopyBox({ value, multiline = false }: { value: string; multiline?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(value).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      },
      () => toast.error("Couldn't copy — select it and copy by hand"),
    );
  };
  return (
    <div className="relative rounded-xl bg-surface-2 text-ink ring-1 ring-border">
      <pre className={cn("overflow-x-auto px-4 py-3 pr-14 font-mono text-[0.8125rem] leading-relaxed", !multiline && "whitespace-nowrap")}>{value}</pre>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "Copied" : "Copy"}
        className="absolute right-2 top-2 flex size-9 items-center justify-center rounded-lg bg-surface text-ink-2 ring-1 ring-border transition hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        {copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
      </button>
    </div>
  );
}

const LANGS = ["cURL", "JavaScript", "PHP"] as const;

function samples(endpoint: string): Record<(typeof LANGS)[number], string> {
  const body = `{
  "externalId": "post-123",
  "title": "Heavy rain closes schools in Udupi today",
  "body": "<p>First paragraph…</p><p>Second paragraph…</p>",
  "imageUrl": "https://yoursite.com/uploads/rain.jpg",
  "category": "karnataka",
  "district": "Udupi",
  "language": "en",
  "sourceUrl": "https://yoursite.com/news/rain-udupi"
}`;
  return {
    cURL: `curl -X POST ${endpoint}/articles \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '${body.replace(/\n\s*/g, " ")}'`,
    JavaScript: `// On your server (Node.js) — never in the browser
await fetch("${endpoint}/articles", {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${process.env.WEBNEWSX_API_KEY}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(${body.replace(/\n/g, "\n  ")}),
});`,
    PHP: `// WordPress: add to your theme's functions.php
add_action('publish_post', function ($id, $post) {
  wp_remote_post('${endpoint}/articles', [
    'headers' => [
      'Authorization' => 'Bearer ' . WEBNEWSX_API_KEY,
      'Content-Type'  => 'application/json',
    ],
    'body' => wp_json_encode([
      'externalId' => (string) $id,
      'title'      => $post->post_title,
      'body'       => apply_filters('the_content', $post->post_content),
      'imageUrl'   => get_the_post_thumbnail_url($id, 'full'),
      'category'   => 'national',
      'sourceUrl'  => get_permalink($id),
    ]),
  ]);
}, 10, 2);`,
  };
}

const FIELDS: [string, string][] = [
  ["title", "Headline, 5–150 characters. Required."],
  ["body", "The story — HTML or plain text (blank line = new paragraph). Required."],
  ["imageUrl", "Link to the photo (JPEG / PNG / WebP, up to 8 MB). Required."],
  ["category", "national, world, sports, karnataka, politics… (GET /categories). Required."],
  ["subcategory", "One of the category's sub categories. Default “Other”."],
  ["district", "Karnataka stories only: the district, or “All Karnataka”."],
  ["blurb", "2-line summary (50+ characters). Default: the story's first sentences."],
  ["language", "en, kn, hi, ta, te… Default: read from the headline."],
  ["externalId", "Your own post id. Send it again to update the same story."],
  ["sourceUrl", "Your original story — shown as “Read more”."],
  ["draft", "true = save in your Newsroom without publishing."],
];

function ApiGuide({ endpoint }: { endpoint: string }) {
  const [lang, setLang] = useState<(typeof LANGS)[number]>("cURL");
  const code = samples(endpoint)[lang];
  return (
    <section aria-labelledby="settings-api-guide" className="card px-5 py-6 sm:px-8">
      <h2 id="settings-api-guide" className="font-wide text-base font-extrabold text-ink">
        Connect your website
      </h2>
      <p className="mt-1 text-sm text-muted">
        Send <code className="font-mono text-ink-2">POST {endpoint}/articles</code> with your key. The answer gives the story&rsquo;s link.
      </p>

      <div role="tablist" aria-label="Code language" className="mt-4 inline-flex rounded-full bg-surface-2 p-1">
        {LANGS.map((name) => (
          <button
            key={name}
            role="tab"
            type="button"
            aria-selected={lang === name}
            onClick={() => setLang(name)}
            className={cn(
              "h-8 rounded-full px-4 text-[0.8125rem] font-bold transition",
              lang === name ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink",
            )}
          >
            {name}
          </button>
        ))}
      </div>
      <div className="mt-3">
        <CopyBox value={code} multiline />
      </div>

      <h3 className="mt-6 text-xs font-bold uppercase tracking-[0.08em] text-muted">Story fields</h3>
      <dl className="mt-2 grid gap-x-6 text-sm sm:grid-cols-[9rem_1fr]">
        {FIELDS.map(([field, info]) => (
          <div key={field} className="contents">
            <dt className="pt-2 font-mono text-[0.8125rem] font-semibold text-ink sm:border-t sm:border-border sm:py-2">{field}</dt>
            <dd className="border-b border-border pb-2 text-ink-2 sm:border-b-0 sm:border-t sm:py-2">{info}</dd>
          </div>
        ))}
      </dl>

      <h3 className="mt-6 text-xs font-bold uppercase tracking-[0.08em] text-muted">Other calls</h3>
      <ul className="mt-2 flex flex-col gap-1.5 text-sm text-ink-2">
        <li>
          <code className="font-mono text-ink">GET /me</code> — check a key works
        </li>
        <li>
          <code className="font-mono text-ink">GET /categories</code> — categories and sub categories
        </li>
        <li>
          <code className="font-mono text-ink">GET /articles</code> — your stories posted through the API
        </li>
        <li>
          <code className="font-mono text-ink">DELETE /articles/ext:post-123</code> — remove a story (or use its WebNewsX id)
        </li>
      </ul>
    </section>
  );
}
