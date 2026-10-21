# WebNEWS — frontend

Next.js 16 (App Router, React 19, Tailwind v4) web app for **WebNEWS — Pulse of the Public**.
It never talks to PostgreSQL: all data comes from the WebNEWS API (`../backend`).

## Run locally

From the **repo root** (runs the API on :4000 and this app on :3000):

```bash
npm run install:all     # first time: installs backend/ and frontend/
npm run dev             # http://localhost:3000
```

This app only (the backend must be running on `BACKEND_URL`):

```bash
cp .env.example .env.local   # first time
npm run dev                  # next dev → http://localhost:3000 (or $PORT)
```

| Script | What it does |
|---|---|
| `npm run dev` | Dev server on http://localhost:3000 (`PORT` overrides), listening on 127.0.0.1 only |
| `npm run build` / `npm start` | Production build / serve on :3000 (`PORT` overrides) |
| `npm run typecheck` | `next typegen && tsc --noEmit` |
| `npm run lint` | ESLint 9 (next core-web-vitals + TypeScript) |
| `npm test` | Vitest unit tests (`tests/unit`, e.g. `safeNextPath`) |
| `npm run test:e2e` | Playwright with the system Chrome (see below) |

### Environment (`.env.local`, documented in `.env.example`)

| Variable | Purpose |
|---|---|
| `BACKEND_URL` | API origin for the `/api/*` + `/media/*` rewrites and server-side fetches (build time **and** runtime) |
| `NEXT_PUBLIC_SITE_URL` | Public origin (absolute URLs, Open Graph) |
| `NEXT_PUBLIC_GOOGLE_ENABLED` | `1` shows "Continue with Google" (backend must have Google credentials) |
| `NEXT_PUBLIC_STREAM_URL` | Optional direct SSE URL if a proxy buffers `/api/stream` |
| `NEXT_PUBLIC_MEDIA_HOSTS` | Optional extra image hosts for the CSP (e.g. the R2 public host) |
| `NEXT_DIST_DIR` | Optional build dir (default `.next`) so several dev servers can run side by side |
| `TRUST_PROXY` | Server-only. `1` when an edge proxy in front of this app sets `X-Forwarded-For`; otherwise `proxy.ts` drops browser-sent `X-Forwarded-For` / `X-Real-IP` (nobody picks their own rate-limit identity) |

Real process env always wins over `.env.local`, e.g. a second copy on other ports:

```bash
NEXT_DIST_DIR=.next-alt BACKEND_URL=http://localhost:4101 npx next dev -p 3101
```

`tsconfig.json` extends `tsconfig.base.json`, so Next never rewrites it for a custom `NEXT_DIST_DIR`.

## How it talks to the backend

- The browser only calls this origin: `next.config.ts` rewrites `/api/:path*` and `/media/:path*` to
  `BACKEND_URL`, so Better Auth cookies are first-party. Google's redirect URI is
  `<site>/api/auth/callback/google`.
- Server Components use `lib/server-api.ts` (`serverFetch` forwards the visitor's cookie and the client address this
  server saw, `no-store`, typed errors). Rail/ticker loaders fail soft when the API is down; the feed, /trending,
  profiles and articles throw so the error boundary says "Signal lost · Try again" instead of showing a false empty state.
- Client code uses `lib/api.ts` (`api.*`, `ApiError`, XHR upload with progress) and
  `lib/auth-client.ts` (Better Auth React client).
- Realtime: one shared `EventSource('/api/stream')` in `components/providers/realtime-provider.tsx`.
- DTOs and validation come from `lib/shared/contracts.ts`, a **generated copy** of `/shared/contracts.ts`
  (`npm run sync:shared` at the repo root). Never edit the copy.

## Design system

Tokens, fonts, motifs and utilities live in `app/globals.css` (one light theme: white + logo red `#E30613`).
Open **http://localhost:3000/dev/ui** (development only) for the living style guide: brand, tokens,
type, controls, overlays, feedback and realtime/motion demos.

```
app/                 routes — (main) holds the app shell (nav, ticker, rail, tab bar)
components/brand     Logo, BrandLockup, SpeedLines (icon geometry), UserHandle (usernames — never "@"), VerifiedBadge
components/ui        Button, IconButton, Avatar, Input, Textarea, Field, Checkbox, Modal/Sheet,
                     Tabs, Toast, Tooltip, Skeleton, SpeedLinesLoader, PulseDot, NumberTicker,
                     DropdownMenu, EmptyState, TimeAgo, GoogleButton
components/layout    TopNav, Ticker, RightRail, LiveWire, BottomTabBar, BackToTop, NewStoryButton, AuthPrompt, UserMenu
components/follow    FollowButton
components/providers AppProviders (query, viewer, realtime, auth prompt, toaster)
lib/                 server-api, session, api, auth-client, format, utils, query-keys, hooks/
```

## End-to-end tests

`npm run test:e2e` (Playwright, system Chrome) starts its **own** backend and frontend on dedicated ports, so it never
touches a running `npm run dev`:

| Variable | Default | Effect |
|---|---|---|
| `E2E_BACKEND_PORT` | 4199 | backend `PORT`; its `FRONTEND_URL` points at the e2e frontend |
| `E2E_FRONTEND_PORT` | 3199 | production build (`next build && next start`) with `BACKEND_URL` = the e2e backend and `NEXT_DIST_DIR=.next-e2e-<port>` |
| `E2E_DEV=1` | off | `next dev` instead of a production build (debugging; slower and noisier under parallel load) |
| `E2E_WORKERS` | 3 | parallel workers (one frontend server serves them all; more only adds timeouts) |
| `E2E_BASE_URL` | — | test an app that is already running; start nothing |

Both e2e servers listen on 127.0.0.1. `tests/e2e/security.spec.ts` (spoofed `X-Forwarded-For` vs. the per-IP rate limits)
runs as its own Playwright project after the desktop and mobile projects, because it deliberately uses up those limits.

There is **one** database (`webnews_platform`), so tests are non-destructive. Use the fixtures in
`tests/e2e/fixtures.ts` (`createTestUser`, `loginAs`, `publishStory`, `gotoHydrated`, `trackConsoleErrors`,
`waitForStream`, `uniqueEmail`, `uniqueUsername`): users get `pw.<runTag>.<letters>@test.webnews.local` emails and
letters-and-dots usernames, and `tests/e2e/global-teardown.ts` deletes exactly this run's users afterwards. Never
truncate or delete other rows.
