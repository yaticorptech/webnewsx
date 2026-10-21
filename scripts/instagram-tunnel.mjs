/*
 * Test "Connect Instagram" on this Mac: `npm run tunnel:instagram` (owner 2026-10-05).
 *
 * Instagram's login returns only to an https address, and the dev site is http://localhost:3000. This opens a free,
 * temporary Cloudflare tunnel (https://….trycloudflare.com, no account needed; `brew install cloudflared`) to a small
 * relay that lets through ONLY the two Instagram login steps (/api/social/instagram/connect and /callback) — nothing
 * else of the site is reachable from outside. It writes the address into backend/.env (INSTAGRAM_TUNNEL_URL), nudges
 * the dev backend to restart, and prints the Redirect URL to paste into the Meta app. Ctrl+C closes the tunnel and
 * clears the setting again. Each run gets a new address, so the Redirect URL in Meta has to be updated every time.
 */
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_FILE = join(ROOT, "backend/.env");
const BACKEND_ENV_TS = join(ROOT, "backend/src/env.ts");
const SITE = { host: "127.0.0.1", port: 3000 };
const RELAY_PORT = Number(process.env.TUNNEL_RELAY_PORT || 3210);
const ALLOWED = /^\/api\/social\/instagram\/(connect|callback)(\?|$)/;

/** Sets (or clears) INSTAGRAM_TUNNEL_URL in backend/.env, then re-saves backend/src/env.ts so `tsx watch` restarts. */
function setTunnelUrl(url) {
  const text = readFileSync(ENV_FILE, "utf8");
  const line = `INSTAGRAM_TUNNEL_URL=${url}`;
  const next = /^INSTAGRAM_TUNNEL_URL=.*$/m.test(text)
    ? text.replace(/^INSTAGRAM_TUNNEL_URL=.*$/m, line)
    : `${text.replace(/\n*$/, "\n")}\n# Set by npm run tunnel:instagram while it runs (testing Instagram on this Mac).\n${line}\n`;
  writeFileSync(ENV_FILE, next);
  writeFileSync(BACKEND_ENV_TS, readFileSync(BACKEND_ENV_TS));
}

const relay = http.createServer((req, res) => {
  if (req.method !== "GET" || !ALLOWED.test(req.url ?? "")) {
    res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
    return;
  }
  const headers = { ...req.headers, host: "localhost:3000" };
  const upstream = http.request({ ...SITE, method: "GET", path: req.url, headers }, (up) => {
    res.writeHead(up.statusCode ?? 502, up.statusMessage, up.headers);
    up.pipe(res);
  });
  upstream.on("error", () => {
    if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain" });
    res.end("WebNEWS isn't running on this Mac — start the frontend (:3000) and backend (:4000).");
  });
  upstream.end();
});

relay.listen(RELAY_PORT, "127.0.0.1", () => {
  const tunnel = spawn("cloudflared", ["tunnel", "--no-autoupdate", "--url", `http://127.0.0.1:${RELAY_PORT}`], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  tunnel.on("error", () => {
    console.error("cloudflared isn't installed. Install it with:  brew install cloudflared");
    process.exit(1);
  });
  let announced = false;
  const watch = (chunk) => {
    const url = String(chunk).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0];
    if (!url || announced) return;
    announced = true;
    setTunnelUrl(url);
    console.log(`\nInstagram test tunnel is up: ${url}`);
    console.log(`\n1. Meta app → Instagram → API setup with Instagram login → Set up Instagram business login → Redirect URL:`);
    console.log(`     ${url}/api/social/instagram/callback`);
    console.log(`2. On this Mac open http://localhost:3000/settings/profile → Connected accounts → Connect Instagram.`);
    console.log(`\nThe backend restarts by itself with the new address. Keep this running while you test; Ctrl+C closes it.\n`);
  };
  tunnel.stdout.on("data", watch);
  tunnel.stderr.on("data", watch);

  let closing = false;
  const close = () => {
    if (closing) return;
    closing = true;
    tunnel.kill();
    relay.close();
    if (announced) setTunnelUrl("");
    console.log("\nTunnel closed; INSTAGRAM_TUNNEL_URL cleared.");
    process.exit(0);
  };
  process.on("SIGINT", close);
  process.on("SIGTERM", close);
  tunnel.on("exit", (code) => {
    if (closing) return;
    console.error(`cloudflared stopped (exit ${code}).`);
    close();
  });
});
