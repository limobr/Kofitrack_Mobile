// src/services/update/downloadManager.ts
//
// DownloadManager: gets the APK onto disk with live progress, and nothing
// else. Two things worth knowing about why this is built the way it is:
//
// 1. expo-file-system's new default API (SDK 54+) only exposes
//    `File.downloadFileAsync()` -- no progress callback, no cancellation.
//    The classic API (now under `expo-file-system/legacy`) still has
//    `createDownloadResumable()`, which DOES report progress and can be
//    paused mid-flight. We deliberately import from `/legacy` here -- this
//    isn't a leftover, it's the only API that can drive a progress bar.
//
// 2. The legacy `DownloadResumable` has `pauseAsync()` but no
//    `cancelAsync()`. "Cancel" is implemented as: pause the transfer,
//    delete whatever partial bytes landed on disk, and reject the
//    in-flight promise ourselves so the caller doesn't hang forever
//    waiting on a paused-not-cancelled download.

import * as FileSystem from 'expo-file-system/legacy';
import axios from 'axios';

const UPDATES_DIR = `${FileSystem.cacheDirectory}updates/`;

export interface DownloadProgress {
  bytesWritten: number;
  totalBytes: number;
  /** 0-100. 0 if the server didn't send a Content-Length. */
  percent: number;
}

export type ProgressCallback = (progress: DownloadProgress) => void;

export class DownloadCancelledError extends Error {
  constructor() {
    super('Download cancelled');
    this.name = 'DownloadCancelledError';
  }
}

let activeDownload: FileSystem.DownloadResumable | null = null;
let activeDestination: string | null = null;
let cancelReject: ((err: Error) => void) | null = null;

async function ensureUpdatesDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(UPDATES_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(UPDATES_DIR, { intermediates: true });
  }
}

export function getApkDestination(version: string): string {
  return `${UPDATES_DIR}KofiTrack-v${version}.apk`;
}

/**
 * Best-effort size estimate via a HEAD request, used to tell the user
 * "this is about N MB" *before* they tap Update. This is a courtesy --
 * if the host doesn't return Content-Length on HEAD (some CDNs only set
 * it on GET) we just don't show a number pre-download. Once the actual
 * download starts, the progress callback's `totalBytes` is authoritative
 * and always shown instead.
 */
export async function getRemoteFileSizeBytes(url: string): Promise<number | null> {
  try {
    const res = await axios.head(url, { timeout: 8000 });
    const len = res.headers['content-length'];
    return len ? Number(len) : null;
  } catch {
    return null;
  }
}

/** Deletes any previously downloaded APKs -- we only ever need the one currently in flight. */
export async function clearDownloadedApks(): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(UPDATES_DIR);
    if (!info.exists) return;
    const files = await FileSystem.readDirectoryAsync(UPDATES_DIR);
    await Promise.all(
      files.map((name) => FileSystem.deleteAsync(`${UPDATES_DIR}${name}`, { idempotent: true }))
    );
  } catch {
    // Best-effort cleanup -- never block a download over this.
  }
}

/**
 * Downloads the APK to local cache storage, reporting progress as it goes.
 * Resolves with the local file:// URI on success. Rejects with
 * DownloadCancelledError if cancelDownload() was called, or with the
 * underlying network/HTTP error otherwise.
 */
export async function downloadApk(
  url: string,
  version: string,
  onProgress: ProgressCallback
): Promise<string> {
  await ensureUpdatesDir();
  await clearDownloadedApks();

  const destination = getApkDestination(version);
  activeDestination = destination;

  const resumable = FileSystem.createDownloadResumable(url, destination, {}, (data) => {
    const totalBytes = data.totalBytesExpectedToWrite;
    const bytesWritten = data.totalBytesWritten;
    const percent = totalBytes > 0 ? Math.min(100, Math.round((bytesWritten / totalBytes) * 100)) : 0;
    onProgress({ bytesWritten, totalBytes, percent });
  });
  activeDownload = resumable;

  const cancelPromise = new Promise<never>((_, reject) => {
    cancelReject = reject;
  });

  try {
    const result = await Promise.race([resumable.downloadAsync(), cancelPromise]);
    if (!result) {
      throw new Error('Download did not complete');
    }
    return result.uri;
  } finally {
    activeDownload = null;
    activeDestination = null;
    cancelReject = null;
  }
}

/** Stops an in-progress download and removes the partial file. Safe to call when nothing is downloading. */
export async function cancelDownload(): Promise<void> {
  const resumable = activeDownload;
  const destination = activeDestination;
  if (!resumable) return;

  try {
    await resumable.pauseAsync();
  } catch {
    // Already finished or already failed -- nothing to pause.
  }

  if (destination) {
    try {
      await FileSystem.deleteAsync(destination, { idempotent: true });
    } catch {
      // Best-effort -- a leftover partial file isn't worth surfacing an error for.
    }
  }

  if (cancelReject) {
    cancelReject(new DownloadCancelledError());
  }
}
