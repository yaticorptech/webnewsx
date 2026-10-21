/*
 * Test the app on a phone on the same Wi-Fi: `npm run phone` (in mobile/).
 *
 * The site's dev servers only listen on this Mac (127.0.0.1). This relay listens on the Mac's Wi-Fi address
 * (port 3100) and forwards to the frontend on :3000 as if the request came from localhost:3000, so the site's
 * origin checks, Next's dev-origin guard and login cookies work unchanged. Nothing is exposed beyond the Wi-Fi,
 * and only while this runs. It also serves the debug app for download at /webnews.apk.
 *
 * Press meets (owner 2026-10-01): phones only allow the camera and microphone on https pages, so the same relay
 * also listens with https on :3443 (a self-signed certificate made for this Mac's Wi-Fi address, kept in
 * mobile/.dev-cert/). The debug app accepts that certificate for private Wi-Fi addresses only (MainActivity).
 */
import { execFileSync } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { networkInterfaces } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SITE = { host: "127.0.0.1", port: 3000 };
const SITE_ORIGIN = "http://localhost:3000";
const PORT = Number(process.env.PHONE_PORT || 3100);
const TLS_PORT = Number(process.env.PHONE_TLS_PORT || 3443);
const APK = join(dirname(fileURLToPath(import.meta.url)), "..", "android/app/build/outputs/apk/debug/app-debug.apk");

function wifiAddress() {
  const all = Object.entries(networkInterfaces()).flatMap(([name, list]) =>
    (list ?? []).filter((a) => a.family === "IPv4" && !a.internal).map((a) => ({ name, address: a.address })),
  );
  return (all.find((a) => a.name === "en0") ?? all[0])?.address;
}

const LAN = process.env.PHONE_HOST || wifiAddress();
if (!LAN) {
  console.error("No Wi-Fi / LAN address found. Connect this Mac to Wi-Fi first.");
  process.exit(1);
}
const LAN_ORIGIN = `http://${LAN}:${PORT}`;
const LAN_TLS_ORIGIN = `https://${LAN}:${TLS_PORT}`;

/** The phone's request, as the site expects it from localhost:3000. */
function toSite(headers, lanOrigin) {
  const out = { ...headers, host: "localhost:3000" };
  if (out.origin === lanOrigin) out.origin = SITE_ORIGIN;
  if (typeof out.referer === "string" && out.referer.startsWith(lanOrigin)) out.referer = SITE_ORIGIN + out.referer.slice(lanOrigin.length);
  return out;
}

/** A self-signed certificate for this Wi-Fi address (made once per address with openssl). */
function devCertificate() {
  const dir = join(dirname(fileURLToPath(import.meta.url)), "..", ".dev-cert");
  const key = join(dir, `${LAN}-key.pem`);
  const cert = join(dir, `${LAN}-cert.pem`);
  if (!existsSync(key) || !existsSync(cert)) {
    mkdirSync(dir, { recursive: true });
    execFileSync("openssl", [
      "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", cert, "-days", "825",
      "-subj", "/CN=WebNEWS dev", "-addext", `subjectAltName=IP:${LAN},DNS:localhost`,
    ], { stdio: "ignore" });
  }
  return { key: readFileSync(key), cert: readFileSync(cert) };
}

let tlsReady = false;

const handler = (lanOrigin) => (req, res) => {
  // Press meet rooms need the mic and camera, which browsers allow only over https: send http visitors there.
  if (tlsReady && lanOrigin === LAN_ORIGIN && /^\/press-meet\/[^/?]+\/live(?:[/?]|$)/.test(req.url ?? "")) {
    res.writeHead(302, { location: LAN_TLS_ORIGIN + req.url }).end();
    return;
  }
  if (req.url === "/webnews.apk") {
    if (!existsSync(APK)) {
      res.writeHead(404, { "content-type": "text/plain" }).end("The app isn't built yet (mobile/README.md → Android test build).");
      return;
    }
    res.writeHead(200, {
      "content-type": "application/vnd.android.package-archive",
      "content-length": statSync(APK).size,
      "content-disposition": 'attachment; filename="WebNEWS.apk"',
    });
    createReadStream(APK).pipe(res);
    return;
  }
  const upstream = http.request({ ...SITE, method: req.method, path: req.url, headers: toSite(req.headers, lanOrigin) }, (up) => {
    const headers = { ...up.headers };
    if (typeof headers.location === "string" && headers.location.startsWith(SITE_ORIGIN)) {
      headers.location = lanOrigin + headers.location.slice(SITE_ORIGIN.length);
    }
    res.writeHead(up.statusCode ?? 502, up.statusMessage, headers);
    up.pipe(res);
  });
  upstream.on("error", () => {
    if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain" });
    res.end("WebNEWS isn't running on this Mac — start the frontend (:3000) and backend (:4000).");
  });
  req.pipe(upstream);
};

// Live updates in dev (hot reload websocket) pass straight through.
const upgrade = (lanOrigin) => (req, socket, head) => {
  const upstream = net.connect(SITE.port, SITE.host, () => {
    const lines = [`${req.method} ${req.url} HTTP/1.1`];
    for (const [key, value] of Object.entries(toSite(req.headers, lanOrigin))) {
      for (const v of Array.isArray(value) ? value : [value]) lines.push(`${key}: ${v}`);
    }
    upstream.write(`${lines.join("\r\n")}\r\n\r\n`);
    if (head?.length) upstream.write(head);
    upstream.pipe(socket).pipe(upstream);
  });
  upstream.on("error", () => socket.destroy());
  socket.on("error", () => upstream.destroy());
};

const server = http.createServer(handler(LAN_ORIGIN));
server.on("upgrade", upgrade(LAN_ORIGIN));
server.requestTimeout = 0;
server.listen(PORT, LAN, () => {
  console.log(`WebNEWS on your phone (same Wi-Fi):`);
  console.log(`  site:        ${LAN_ORIGIN}`);
  console.log(`  Android app: ${LAN_ORIGIN}/webnews.apk`);
});

let tls = null;
try {
  tls = https.createServer(devCertificate(), handler(LAN_TLS_ORIGIN));
} catch {
  console.warn("  (https for press meet camera/mic is off: openssl couldn't make a certificate)");
}
if (tls) {
  tls.on("upgrade", upgrade(LAN_TLS_ORIGIN));
  tls.requestTimeout = 0;
  tls.listen(TLS_PORT, LAN, () => {
    tlsReady = true;
    console.log(`  https:       ${LAN_TLS_ORIGIN}  (the app's address — camera & mic need https)`);
  });
}
