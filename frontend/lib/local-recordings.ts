"use client";

import { useCallback, useEffect, useState } from "react";
import { PRESS_MEET } from "./shared/contracts";

/*
 * Press meet recordings live on the reporter's own device only (owner 2026-10-02: no copy on the WebNEWS server, so
 * it uses no server storage). Each piece MediaRecorder hands over every few seconds goes into this site's private
 * IndexedDB — in the app that's the app's own private storage; in a browser, that browser — so a closed tab or a crash
 * keeps what was recorded. The reporter can download and share it (owner 2026-10-05); uninstalling the app or clearing
 * the browser's site data removes the copy kept here.
 */

const DB_NAME = "webnews-recordings";
const DB_VERSION = 1;

export type LocalRecording = {
  id: string;
  meetId: string;
  userId: string;
  mimeType: string;
  createdAt: string;
  /** Set when the recording was stopped properly (a closed tab leaves it null; the pieces are still there). */
  finishedAt: string | null;
  durationMs: number | null;
  pieces: number;
};

let opening: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      const recordings = database.createObjectStore("recordings", { keyPath: "id" });
      recordings.createIndex("meetId", "meetId");
      database.createObjectStore("pieces"); // key: [recordingId, seq]
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      opening = null;
      reject(request.error);
    };
  });
  return opening;
}

function done<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function finished(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new DOMException("Aborted", "AbortError"));
  });
}

/** Whether this browser / app can keep recordings at all. */
export function localRecordingSupported(): boolean {
  return typeof indexedDB !== "undefined";
}

/** A new recording on this device. Asks the browser to keep the site's storage (not cleared when space runs low). */
export async function startLocalRecording(meetId: string, userId: string, mimeType: string): Promise<string> {
  void navigator.storage?.persist?.().catch(() => false);
  const id = crypto.randomUUID();
  const record: LocalRecording = { id, meetId, userId, mimeType, createdAt: new Date().toISOString(), finishedAt: null, durationMs: null, pieces: 0 };
  const database = await db();
  const tx = database.transaction("recordings", "readwrite");
  tx.objectStore("recordings").put(record);
  await finished(tx);
  return id;
}

/** Saves one piece (in order). Throws when the device is out of space. */
export async function saveLocalPiece(id: string, seq: number, piece: Blob): Promise<void> {
  const database = await db();
  const tx = database.transaction(["pieces", "recordings"], "readwrite");
  tx.objectStore("pieces").put(piece, [id, seq]);
  const store = tx.objectStore("recordings");
  const record = (await done(store.get(id))) as LocalRecording | undefined;
  if (record) store.put({ ...record, pieces: Math.max(record.pieces, seq + 1) });
  await finished(tx);
}

export async function finishLocalRecording(id: string, durationMs: number): Promise<void> {
  const database = await db();
  const tx = database.transaction("recordings", "readwrite");
  const store = tx.objectStore("recordings");
  const record = (await done(store.get(id))) as LocalRecording | undefined;
  if (record) store.put({ ...record, finishedAt: new Date().toISOString(), durationMs });
  await finished(tx);
}

/** This person's recordings of one press meet on this device, newest first. */
export async function listLocalRecordings(meetId: string, userId: string): Promise<LocalRecording[]> {
  if (!localRecordingSupported()) return [];
  const database = await db();
  const tx = database.transaction("recordings", "readonly");
  const all = (await done(tx.objectStore("recordings").index("meetId").getAll(meetId))) as LocalRecording[];
  return all
    .filter((r) => r.userId === userId && r.pieces > 0)
    .map((r) => ({ ...r, durationMs: r.durationMs ?? r.pieces * PRESS_MEET.chunkMs }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** The recording's pieces in order. */
export async function localRecordingPieces(recording: LocalRecording): Promise<Blob[]> {
  const database = await db();
  const tx = database.transaction("pieces", "readonly");
  const range = IDBKeyRange.bound([recording.id, 0], [recording.id, Number.MAX_SAFE_INTEGER]);
  return (await done(tx.objectStore("pieces").getAll(range))) as Blob[];
}

/** The whole recording as one video Blob (its pieces in order; the browser doesn't load them all into memory). */
export async function localRecordingBlob(recording: LocalRecording): Promise<Blob> {
  return new Blob(await localRecordingPieces(recording), { type: localRecordingType(recording) });
}

export function localRecordingType(recording: LocalRecording): string {
  return recording.mimeType.split(";")[0] || "video/webm";
}

/** e.g. "webnews-press-meet-mangalore-dasara-2026-2026-10-05.mp4" */
export function localRecordingFileName(recording: LocalRecording, title: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "recording";
  const ext = localRecordingType(recording).includes("mp4") ? "mp4" : "webm";
  return `webnews-press-meet-${slug}-${recording.createdAt.slice(0, 10)}.${ext}`;
}

export async function deleteLocalRecording(id: string): Promise<void> {
  const database = await db();
  const tx = database.transaction(["pieces", "recordings"], "readwrite");
  tx.objectStore("pieces").delete(IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]));
  tx.objectStore("recordings").delete(id);
  await finished(tx);
}

/** The signed-in reporter's recordings of a press meet on this device (reload with `refresh`). */
export function useLocalRecordings(meetId: string, userId: string | null) {
  const [recordings, setRecordings] = useState<LocalRecording[]>([]);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (!userId) return;
    let live = true;
    listLocalRecordings(meetId, userId)
      .then((list) => live && setRecordings(list))
      .catch(() => live && setRecordings([]));
    return () => {
      live = false;
    };
  }, [meetId, userId, version]);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  return { recordings: userId ? recordings : [], refresh };
}
