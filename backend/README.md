# WebNEWS API (backend)

Hono + Better Auth + Drizzle/PostgreSQL + SSE. Node 24, TypeScript (strict, ESM).
The browser never calls this server directly: the Next.js frontend proxies `/api/*` and `/media/*` here.

## Run it locally

```bash
cp .env.example .env          # fill DATABASE_URL + BETTER_AUTH_SECRET (openssl rand -base64 32)
npm install
npm run db:create             # only if the database doesn't exist yet
npm run dev                   # migrates, then serves http://localhost:4000 (tsx watch)
# db:seed is turned off (owner decision 2026-09-25) — existing demo content stays
```

From the repo root, `npm run dev` starts this API (:4000) and the frontend (:3000) together.
Real environment variables always win over `.env` (e.g. `PORT=4100 FRONTEND_URL=http://localhost:3100 npm run dev`).

- **Google sign-in** turns on when `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` are set.
  Redirect URI to register: `${FRONTEND_URL}/api/auth/callback/google`.
- **Images** go to Cloudflare R2 when all five `R2_*` variables are set; otherwise to `LOCAL_UPLOAD_DIR`
  (default `.data/uploads`), served at `/media/<key>` with root-relative URLs.

## Scripts

| Script | What it does |
|---|---|
| `dev` | `predev` applies migrations, then `tsx watch src/index.ts` |
| `build` / `start` | `tsc` → `dist/`; `node dist/src/index.js` |
| `typecheck` / `lint` / `test` | `tsc --noEmit` / ESLint / Vitest (unit + API) |
| `db:generate` / `db:migrate` / `db:studio` | drizzle-kit generate · apply `drizzle/*.sql` · Drizzle Studio |
| `db:create` | creates the `DATABASE_URL` database if missing (touches nothing else) |
| `db:seed` | TURNED OFF (does nothing). Only with `-- --force-seed`: idempotent demo data; add `--reset` to first remove only `@demo.webnews.local` + `@test.webnews.local` users |
| `db:clean-test` | removes leftover `@test.webnews.local` users (and everything they own); `-- --prefix=pw.abc.` limits it to one e2e run |
| `db:demo-admin-password` | gives the demo Editor Desk (`admin.demo@demo.webnews.local`) a new random password and prints it once (local only) |
| `admin:verify -- <email>` | confirms an account's address as the server operator; an `ADMIN_EMAILS` address is promoted to the Editor Desk right away |
| `storage:sweep` | deletes uploads (avatars/covers) older than 24 h that no account or story uses — the server also does this every 6 h |

Existing demo logins, password **`webnews-demo-2026`**, all `…@demo.webnews.local`:
Verified Reporters `harbor.ledger@`, `circuit.desk@`, `final.whistle@`, `market.pulse@`, `field.notes@`, `the.back.page@` ·
Trainee `ward.watch@` (one approved, one in-review, one returned story) · Reader `daily.reader@` ·
Editor Desk **`admin.demo@`** — its own random password, printed once by the seed (new one: `db:demo-admin-password`).
The seed also leaves one pending Spotlight request and three open reader reports for the console. It refuses to create
demo data when `NODE_ENV=production` or `FRONTEND_URL` isn't localhost.

**Roles (SPEC §3.11):** every new account is a Reader; `POST /api/press-pass` makes it a Trainee Reporter; admins come from
`ADMIN_EMAILS` — promoted on sign-up / sign-in once the address is **verified** (Google sign-in, or `admin:verify`) — or
the console.

**Listening address:** `HOST` (default `127.0.0.1` outside production, `0.0.0.0` in production) — the dev API is never
reachable from the LAN. **Client IP:** `TRUST_PROXY=<n>` = number of proxies in front of the API that append to
`X-Forwarded-For`; the client is the entry `n` from the right (anything further left was written by the client).

## Tests and the one-database policy

There is exactly **one** database (`DATABASE_URL`, `webnews_platform`); tests use it too and are **non-destructive**:
every API test file creates its own users with random `…@test.webnews.local` emails and letters-and-dots usernames,
asserts only on its own fixtures (never "the table contains exactly my rows"), and deletes exactly those users in
`afterAll` (FK cascade, counters on other articles corrected, uploads removed). Nothing is truncated.
`src/db/purge.ts` refuses to match any account outside the demo/test email domains.

## API (all JSON unless noted; errors are `{ error: { code, message, fields? } }`)

| Method & path | Auth | Returns |
|---|---|---|
| `GET /api/health` | — | `{ ok: true, db: true }` (503 `{ ok:false, db:false }`) |
| `GET/POST /api/auth/*` | — | Better Auth (sign-up/in/out, Google, session) |
| `GET /api/me` | — | `{ viewer: ViewerUser \| null }` |
| `PATCH /api/me` | onboarded | `{ user: ViewerUser }` · 409 `username_taken` |
| `GET /api/username/check?u=` | — | `UsernameCheck` |
| `POST /api/onboarding` | signed in | `{ user: ViewerUser }` · 409 `username_taken` / `already_onboarded` |
| `POST /api/upload` (multipart `file`, `kind`: avatar · cover · video, `trim=1`) | signed in (covers/videos: onboarded reporter) | 201 `UploadedImage` / `UploadedVideo` (≤ 30 s, else 422 `video_too_long`; `trim=1` keeps the first 30 s) |
| `GET /api/feed?tab=latest\|following&cursor=&limit=` | following: signed in | `Page<ArticleCard>` |
| `GET /api/feed/headlines?limit=` | — | `{ items: Headline[] }` |
| `POST /api/articles` | onboarded | 201 new / 200 existing `SaveArticleResponse` |
| `GET /api/articles/by-slug/:slug` | — | `{ article: ArticleDetail, moreFromAuthor: ArticleCard[] }` |
| `GET /api/articles/:id` | owner | `{ article: OwnedArticle }` (404 for others) |
| `DELETE /api/articles/:id` | owner | 204 |
| `POST/DELETE /api/articles/:id/like` | onboarded | `{ liked, likeCount }` |
| `POST /api/articles/:id/share` `{ channel }` | — | `{ shareCount }` |
| `POST /api/views` `{ ids }` | — (sets `wn_vid`) | `{ counted: string[] }` |
| `GET /api/users/top?limit=` | — | `{ items: UserRow[] }` |
| `GET /api/users/:username` | — | `ProfileData` |
| `POST/DELETE /api/users/:username/follow` | onboarded | `{ following, followerCount }` |
| `GET /api/users/:username/followers\|following?cursor=` | — | `Page<UserRow>` |
| `GET /api/users/:username/articles?status=published\|draft&cursor=` | drafts: owner | `Page<ArticleCard>` / `Page<DraftCard>` |
| `GET /api/users/:username/drafts?cursor=` | owner | `Page<DraftCard>` |
| `GET /api/stream` | — | SSE: `ready`, `article.published`, `article.stats`, `article.deleted`, `ping` |
| `GET /media/<key>` | — | image bytes (local storage only, immutable cache) |

DTO types live in `src/shared/contracts.ts` (generated from `/shared/contracts.ts` — edit the source, then
`npm run sync:shared` at the repo root).

## Docker (minimal; deployment comes later)

`docker build -t webnews-api . && docker run --env-file .env -p 4000:4000 webnews-api` — applies migrations on start.
