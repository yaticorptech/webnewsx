#!/usr/bin/env node
// `npm run dev` at the repo root: the API (backend/) and the web app (frontend/) side by side.
//
//   npm run dev                              → web http://localhost:3000 · API http://localhost:4000
//   WEB_PORT=3102 API_PORT=4102 npm run dev  → both on other ports (e.g. next to a running dev server):
//     the API gets PORT + FRONTEND_URL; the web app gets PORT + BACKEND_URL + NEXT_PUBLIC_SITE_URL and
//     its own build dir (NEXT_DIST_DIR=.next-<port>) so two Next dev servers never share `.next`.
//
// Without overrides each app keeps the settings in its own backend/.env and frontend/.env.local.
import { concurrently } from "concurrently";

const port = (name) => {
  const value = process.env[name];
  if (value === undefined || value === "") return null;
  if (!/^\d{2,5}$/.test(value)) throw new Error(`${name} must be a port number, got "${value}"`);
  return value;
};

const apiPort = port("API_PORT");
const webPort = port("WEB_PORT");
const webUrl = `http://localhost:${webPort ?? "3000"}`;

const apiEnv = {
  ...(apiPort ? { PORT: apiPort } : {}),
  ...(webPort ? { FRONTEND_URL: webUrl } : {}),
};
const webEnv = {
  // `next dev` takes its port from PORT (default 3000); set it explicitly so a PORT meant for the API never leaks in.
  PORT: webPort ?? "3000",
  ...(apiPort ? { BACKEND_URL: `http://127.0.0.1:${apiPort}` } : {}),
  ...(webPort ? { NEXT_PUBLIC_SITE_URL: webUrl, NEXT_DIST_DIR: `.next-${webPort}` } : {}),
};

const { result } = concurrently(
  [
    { command: "npm --prefix backend run dev", name: "api", prefixColor: "red", env: apiEnv },
    { command: "npm --prefix frontend run dev", name: "web", prefixColor: "white", env: webEnv },
  ],
  { killOthersOn: ["failure", "success"], prefix: "name" },
);

result.then(
  () => process.exit(0),
  () => process.exit(1),
);
