# Deploying WebNEWS (later — localhost comes first)

Short checklist for when the owner is ready. Nothing here is needed for local development.

## Shape

- **backend/** → any Node 24 host or Docker (`backend/Dockerfile` builds, runs migrations on start, serves `PORT`).
- **frontend/** → Vercel or any Node host (`npm run build && npm start`).
- **PostgreSQL** (managed) and **Cloudflare R2** for images.
- The browser only talks to the frontend; it proxies `/api/*` and `/media/*` to the backend, so cookies stay first-party.

## Backend environment

`NODE_ENV=production`, `DATABASE_URL`, `BETTER_AUTH_SECRET` (`openssl rand -base64 32`),
`FRONTEND_URL=https://<your site>` (Better Auth base URL, trusted origin, CORS; cookies become `Secure`),
`TRUST_PROXY=<n>` = the number of proxies in front of the API that **append** to `X-Forwarded-For` (usually `1`: the
edge in front of the frontend; the Next.js proxy itself passes the header through) — and keep the API reachable
**only** through them, `HOST` (defaults to `0.0.0.0` in production), `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, all
five `R2_*` variables (`R2_PUBLIC_BASE_URL` = the bucket's public host), `ADMIN_EMAILS`. Leave `COOKIE_DOMAIN` empty
unless the browser calls the API directly on a sibling subdomain.

## Frontend environment (needed at build time too — rewrites are baked in)

`BACKEND_URL=https://<api host>`, `NEXT_PUBLIC_SITE_URL=https://<your site>`, `NEXT_PUBLIC_GOOGLE_ENABLED=1`,
`TRUST_PROXY=1` when an edge (Vercel, a load balancer) sets `X-Forwarded-For` for the frontend — without it every
visitor shares the frontend's rate-limit budget (never trust it when browsers reach Next.js directly),
`NEXT_PUBLIC_MEDIA_HOSTS=https://<R2 public host>` (CSP `img-src`). `NEXT_PUBLIC_STREAM_URL` stays empty unless the
host buffers `/api/stream` (then point it at `https://<api host>/api/stream`).

## Accounts and demo data

- **Never seed demo data in production** — `db:seed` refuses when `NODE_ENV=production` or `FRONTEND_URL` isn't
  localhost. If the production database was ever seeded or tested against, run
  `NODE_ENV=production npm --prefix backend run db:seed -- --reset` once: there it only removes the
  `@demo.webnews.local` / `@test.webnews.local` accounts (and their content) and creates nothing.
- **Editor Desk:** sign up with the `ADMIN_EMAILS` address, then run `npm --prefix backend run admin:verify -- <email>`
  against the production database (or sign in with Google using that address).
- Uploads nobody uses (older than 24 h) are deleted by the API every 6 hours (`npm --prefix backend run storage:sweep`
  by hand).

## Google OAuth

In Google Cloud Console add the production origin `https://<your site>` and the redirect URI
`https://<your site>/api/auth/callback/google` next to the localhost ones.

## Checks after deploying

`GET https://<api host>/api/health` → `{"ok":true,"db":true}`; sign up, onboard, publish a story and watch it appear in a
second browser without a reload.
