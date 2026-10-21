import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Absolute path of the backend package root (the folder holding package.json).
 * Works from `src/` (tsx), `dist/src/` (compiled) and `scripts/`.
 */
function findBackendRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, "package.json"))) return dir;
    dir = dirname(dir);
  }
  return process.cwd();
}

export const BACKEND_ROOT = findBackendRoot();

/** Resolves a path relative to the backend root (absolute paths pass through). */
export function fromBackendRoot(path: string): string {
  return resolve(BACKEND_ROOT, path);
}
