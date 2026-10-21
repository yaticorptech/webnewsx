import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDatabase } from "../../src/db/client.js";
import { LocalStorage, storage } from "../../src/lib/storage.js";
import type { ApiErrorBody, ArticleCard, DraftDetail, Page, SaveArticleResponse, UploadedVideo } from "../../src/shared/contracts.js";
import { LONG_BODY, cleanupFixtures, freshApp, json, onboardedUser, reporterUser, samplePng, type Client } from "../helpers.js";

/*
 * Story videos (owner rule 2026-09-25): ≤ 30 s, or the first 30 s of a longer clip when the uploader agrees.
 * The clips are generated with the bundled ffmpeg (a test pattern + a tone), so nothing is downloaded.
 */
const app = freshApp();
const ffmpeg = createRequire(import.meta.url)("ffmpeg-static") as string;
let dir = "";
let short: Buffer;
let long: Buffer;

async function makeClip(seconds: number, name: string): Promise<Buffer> {
  const path = join(dir, name);
  await promisify(execFile)(ffmpeg, [
    "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", `testsrc=size=640x360:rate=24:duration=${seconds}`,
    "-f", "lavfi", "-i", `sine=frequency=440:duration=${seconds}`,
    "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", "-shortest", "-y", path,
  ]);
  return readFile(path);
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "webnews-video-test-"));
  [short, long] = await Promise.all([makeClip(3, "short.mp4"), makeClip(35, "long.mp4")]);
}, 60_000);

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
  await cleanupFixtures();
  await closeDatabase();
});

function uploadVideo(c: Client, bytes: Buffer, options: { trim?: boolean; name?: string; type?: string } = {}): Promise<Response> {
  const form = new FormData();
  form.set("kind", "video");
  if (options.trim) form.set("trim", "1");
  form.set("file", new File([new Uint8Array(bytes)], options.name ?? "clip.mp4", { type: options.type ?? "video/mp4" }));
  return c.req("/api/upload", { method: "POST", body: form });
}

const code = async (res: Response) => (await json<ApiErrorBody>(res)).error;

describe("video uploads", () => {
  it("re-encodes a short clip and returns it with a poster frame; the file streams with byte ranges", async () => {
    const reporter = await reporterUser(app);
    const res = await uploadVideo(reporter, short);
    expect(res.status, await res.clone().text()).toBe(201);
    const body = await json<UploadedVideo>(res);
    expect(body.trimmed).toBe(false);
    expect(body.video.key).toMatch(new RegExp(`^videos/${reporter.userId}/[\\w-]+\\.mp4$`));
    expect(body.poster.key).toMatch(new RegExp(`^covers/${reporter.userId}/`));
    expect(body.video).toMatchObject({ width: 640, height: 360 });
    expect(body.video.durationMs).toBeGreaterThan(2500);
    expect(body.video.durationMs).toBeLessThan(3600);
    expect(body.poster.blurDataUrl).toMatch(/^data:image\//);

    if (storage instanceof LocalStorage) {
      const ranged = await app.request(body.video.url, { headers: { range: "bytes=0-99" } });
      expect(ranged.status).toBe(206);
      expect(ranged.headers.get("content-type")).toBe("video/mp4");
      expect(ranged.headers.get("content-range")).toMatch(/^bytes 0-99\/\d+$/);
      expect((await ranged.arrayBuffer()).byteLength).toBe(100);
      expect((await app.request(body.video.url, { headers: { range: "bytes=999999999-" } })).status).toBe(416);
    }
  });

  it("refuses a clip over 30 seconds unless the uploader keeps its first 30 seconds", async () => {
    const reporter = await reporterUser(app);
    const refused = await uploadVideo(reporter, long);
    expect(refused.status).toBe(422);
    expect(await code(refused)).toMatchObject({ code: "video_too_long", message: expect.stringContaining("35 seconds") });

    const trimmed = await uploadVideo(reporter, long, { trim: true });
    expect(trimmed.status, await trimmed.clone().text()).toBe(201);
    const body = await json<UploadedVideo>(trimmed);
    expect(body.trimmed).toBe(true);
    expect(body.originalDurationMs).toBeGreaterThan(34_000);
    expect(body.video.durationMs).toBeLessThanOrEqual(30_500);
    expect(body.video.durationMs).toBeGreaterThan(29_000);
  }, 60_000);

  it("refuses files that aren't videos, and readers without a Press Pass", async () => {
    const reporter = await reporterUser(app);
    const notVideo = await uploadVideo(reporter, Buffer.from("definitely not a video"), { name: "notes.mp4" });
    expect(notVideo.status).toBe(415);
    expect((await code(notVideo)).code).toBe("invalid_video");
    // A still image reads as a single frame: too short to be a story video.
    expect((await code(await uploadVideo(reporter, await samplePng(), { name: "photo.mp4" }))).code).toBe("video_too_short");

    const reader = await onboardedUser(app);
    expect((await code(await uploadVideo(reader, short))).code).toBe("press_pass_required");
  });
});

describe("video stories", () => {
  it("publishes with the video (cover = its poster), shows it on cards, and deletes the file with the story", async () => {
    const reporter = await reporterUser(app);
    const { video, poster } = await json<UploadedVideo>(await uploadVideo(reporter, short));
    const cover = { url: poster.url, key: poster.key, width: poster.width, height: poster.height, blurDataUrl: poster.blurDataUrl };

    // A draft keeps the clip (with its key, so the composer can send it back).
    const draft = await json<SaveArticleResponse>(
      await reporter.req("/api/articles", { json: { title: "Harbour lights, in motion", bodyHtml: LONG_BODY, cover, video, action: "draft" } }),
    );
    expect((draft.article as DraftDetail).video).toMatchObject({ key: video.key, url: video.url });

    const res = await reporter.req("/api/articles", {
      json: { id: draft.article.id, title: "Harbour lights, in motion", bodyHtml: LONG_BODY, cover, articleImage: cover, video, category: "cinema", action: "publish" },
    });
    expect(res.status, await res.clone().text()).toBe(200);
    const published = await json<SaveArticleResponse>(res);
    expect(published.status).toBe("published");

    const latest = await json<Page<ArticleCard>>(await reporter.req("/api/feed?tab=latest&limit=30"));
    const card = latest.items.find((item) => item.id === published.article.id);
    expect(card?.video).toEqual({ url: video.url, width: video.width, height: video.height, durationMs: video.durationMs });
    expect(card?.coverUrl).toBe(poster.url);
    const imageStory = latest.items.find((item) => item.id !== published.article.id);
    if (imageStory) expect(imageStory.video ?? null).toBeNull();

    const path = storage instanceof LocalStorage ? storage.resolvePath(video.key) : null;
    if (path) expect(existsSync(path)).toBe(true);
    expect((await reporter.req(`/api/articles/${published.article.id}`, { method: "DELETE" })).status).toBeLessThan(300);
    if (path) expect(existsSync(path)).toBe(false);
  });

  it("only accepts the author's own video upload, and needs its poster", async () => {
    const owner = await reporterUser(app);
    const other = await reporterUser(app);
    const { video, poster } = await json<UploadedVideo>(await uploadVideo(owner, short));
    const cover = { url: poster.url, key: poster.key, width: poster.width, height: poster.height, blurDataUrl: poster.blurDataUrl };

    const stolen = await other.req("/api/articles", { json: { title: "Not mine", bodyHtml: LONG_BODY, video, action: "draft" } });
    expect(stolen.status).toBe(400);
    expect((await code(stolen)).fields).toMatchObject({ video: expect.any(String) });

    const noPoster = await owner.req("/api/articles", { json: { title: "No poster", bodyHtml: LONG_BODY, video, action: "draft" } });
    expect((await code(noPoster)).fields).toMatchObject({ video: expect.any(String) });

    const tooLong = await owner.req("/api/articles", {
      json: { title: "Too long", bodyHtml: LONG_BODY, cover, video: { ...video, durationMs: 45_000 }, action: "draft" },
    });
    expect(tooLong.status).toBe(400);
  });
});
