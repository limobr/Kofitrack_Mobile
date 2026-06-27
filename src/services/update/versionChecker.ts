// src/services/update/versionChecker.ts
//
// VersionChecker: knows two things and nothing else --
//   1. What version is installed on this device (expo-application).
//   2. What the server says the latest version is (GET /mobile/latest-version).
// Deciding whether those two disagree is the only "logic" here.

import * as Application from 'expo-application';
import api from '../../api/client';
import type { InstalledVersionInfo, LatestVersionInfo } from './types';

export function getInstalledVersion(): InstalledVersionInfo {
  const version = Application.nativeApplicationVersion ?? '0.0.0';
  const parsedBuild = Number(Application.nativeBuildVersion ?? '0');
  return {
    version,
    buildNumber: Number.isFinite(parsedBuild) ? parsedBuild : 0,
  };
}

/**
 * Fetches the latest published version from the backend.
 * Returns null specifically when nothing has been published yet (404) --
 * that's a legitimate "no update" state, not a failure. Any other error
 * (network down, 5xx, malformed response) is rethrown so callers that
 * need to tell "up to date" apart from "couldn't check" -- namely the
 * manual "Check for Updates" button -- can do so. Background checks
 * (launch/foreground/login) swallow this themselves; see
 * updateService.checkForUpdate.
 */
export async function fetchLatestVersion(): Promise<LatestVersionInfo | null> {
  try {
    const { data } = await api.get('/mobile/latest-version');
    if (!data || typeof data.version !== 'string' || typeof data.buildNumber !== 'number') {
      return null;
    }
    return {
      version: data.version,
      buildNumber: data.buildNumber,
      mandatory: !!data.mandatory,
      title: data.title ?? 'New Version Available',
      message: data.message ?? '',
      releaseNotes: Array.isArray(data.releaseNotes) ? data.releaseNotes : [],
      apkUrl: data.apkUrl,
      publishedAt: data.publishedAt,
    };
  } catch (err: any) {
    if (err?.response?.status === 404) {
      return null;
    }
    throw err;
  }
}

/**
 * buildNumber is a monotonically increasing integer set at release time --
 * comparing two of those is unambiguous, unlike hand-comparing semver-ish
 * "1.0.4" style strings. This is the single source of truth for "is there
 * an update", everything else (the version string) is just for display.
 */
export function isUpdateAvailable(
  latest: LatestVersionInfo,
  installed: InstalledVersionInfo
): boolean {
  return latest.buildNumber > installed.buildNumber;
}
