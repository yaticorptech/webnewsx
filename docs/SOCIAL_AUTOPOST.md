# Auto-post to Instagram & Facebook — setup

Verified reporters connect their Instagram and Facebook Page in **Edit profile → Connected accounts**. After that every
story they publish is posted automatically:

- **Instagram** → the story's 9:16 poster as an **Instagram Story** (needs an Instagram **Professional** account —
  Business or Creator; switch for free in the Instagram app → Settings → Account type and tools).
- **Facebook** → a **photo post on their Page**: the poster + headline, summary and the story link (Meta doesn't let
  any app post to personal profiles, only to Pages).

The site needs one free **Meta app**. Until its keys are in `backend/.env`, the Connect buttons show "Coming soon".

## 1. Create the Meta app (once, ~15 minutes)

1. Go to <https://developers.facebook.com>, log in with the Facebook account that should own the app, and open
   **My Apps → Create app**.
2. App name **WebNEWS**, your contact email. For the use case pick **Other**, then app type **Business** (it can use
   both Pages and Instagram).
3. **Facebook Login for Business** (add it from the app dashboard) → **Settings** → *Valid OAuth Redirect URIs*:
   - `https://<your-domain>/api/social/facebook/callback`
   - for testing on this Mac also `http://localhost:3000/api/social/facebook/callback`
4. **Instagram** (add it from the dashboard) → **API setup with Instagram login** → *Set up Instagram business login*
   → *Redirect URL*: `https://<your-domain>/api/social/instagram/callback` (Instagram accepts only https addresses, so
   Instagram can be connected once the site is online).
   Copy the **Instagram app ID** and **Instagram app secret** shown on that page.
5. **App settings → Basic**: copy the **App ID** and **App secret**, and fill in
   - *Privacy Policy URL*: `https://<your-domain>/privacy`
   - *User data deletion* → *Data deletion instructions URL*: `https://<your-domain>/privacy#connected-accounts`
   - *App domains*: `<your-domain>`

## 2. Put the keys in the backend

In `backend/.env` (never commit it):

```
META_APP_ID=...
META_APP_SECRET=...
INSTAGRAM_APP_ID=...
INSTAGRAM_APP_SECRET=...
```

Restart the backend. The Connect buttons are now live.

## 3. Testing before Meta's review

While the app is in *Development* mode only people with a role on it can connect:

- **App roles → Roles → Add people** (Facebook) — add yourself and the reporters who'll test.
- **Instagram → Roles → Instagram testers** — add their Instagram usernames; each accepts in the Instagram app
  (Settings → Website permissions → Tester invites).

## 4. Opening it to every verified reporter

1. **Business verification** (App settings → Basic → Verify, with your company documents).
2. **App Review** → request advanced access for: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`,
   `instagram_business_basic`, `instagram_business_content_publish`. Meta asks for a short screen recording of
   Connect → publish → the post appearing, and a privacy-policy URL (`https://<your-domain>/privacy`).
3. Switch the app to **Live**.

## Good to know

- In the **phone app** Connect opens in the phone's browser (Meta doesn't allow its login inside apps); when it says
  "connected", go back to the app — Edit profile shows the account. This needs the app build from 2026-09-30 or later.

- Posting works only when the site is online at its **https** address: Instagram and Facebook download the poster
  image from WebNEWS. On this Mac the connection can be made (Facebook), but posts show "Not posted — auto-posting
  starts once WebNEWS is online".
- Each story is posted once per account (republishing doesn't repeat it). Failed posts are retried 3 times.
- Instagram logins last 60 days and are renewed automatically; if Meta stops accepting one, Edit profile says
  "Disconnect and connect again".

## Testing Instagram on this Mac

Instagram only sends the login back to an https address. Run `npm run tunnel:instagram` (needs `brew install cloudflared`)
and keep it running:

1. It prints a temporary `https://….trycloudflare.com` address. Put `<that address>/api/social/instagram/callback` in the
   Meta app as the Redirect URL (Instagram → API setup with Instagram login → Set up Instagram business login).
2. On this Mac, connect Instagram as usual from <http://localhost:3000/settings/profile>.

The tunnel lets through only the two Instagram login steps. It sets `INSTAGRAM_TUNNEL_URL` in `backend/.env` and
clears it on Ctrl+C. Each run gets a new address, so update the Redirect URL in Meta each time. Production ignores the
setting.
