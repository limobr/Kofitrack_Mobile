// src/services/update/updateService.ts
//
// UpdateService: the thin layer that ties VersionChecker to a persisted
// "last checked" timestamp. Download and install are deliberately NOT
// orchestrated here -- that's UpdateContext's job, since it owns the UI
// state (modal visibility, progress) that the download/install flow needs
// to update as it goes. This file only answers "is there an update".

import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchLatestVersion, getInstalledVersion, isUpdateAvailable } from './versionChecker';
import type { LatestVersionInfo } from './types';

const LAST_CHECKED_KEY = 'update:lastCheckedAt';

export { getInstalledVersion } from './versionChecker';

/** Persisted timestamp of the last successful check, per the spec's "cache the latest version check timestamp". */
export async function getLastCheckedAt(): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_CHECKED_KEY);
    return raw ? Number(raw) : null;
  } catch {
    return null;
  }
}

export async function setLastCheckedAt(timestamp: number): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_CHECKED_KEY, String(timestamp));
  } catch {
    // Non-fatal -- worst case we check slightly more often than necessary.
  }
}

export type CheckResult =
  | { status: 'update-available'; info: LatestVersionInfo }
  | { status: 'up-to-date' }
  | { status: 'error' };

/**
 * Fetches the latest version and compares it to what's installed.
 * Always updates the last-checked timestamp on a completed attempt
 * (success or failure -- a failed check still "used up" the throttle
 * window, there's no point hammering a server that's currently down).
 */
export async function checkForUpdate(): Promise<CheckResult> {
  try {
    const latest = await fetchLatestVersion();
    await setLastCheckedAt(Date.now());
    if (!latest) return { status: 'up-to-date' };

    const installed = getInstalledVersion();
    return isUpdateAvailable(latest, installed)
      ? { status: 'update-available', info: latest }
      : { status: 'up-to-date' };
  } catch {
    await setLastCheckedAt(Date.now());
    return { status: 'error' };
  }
}
