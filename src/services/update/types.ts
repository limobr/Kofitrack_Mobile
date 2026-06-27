// src/services/update/types.ts
//
// Shared shapes for the in-app update feature. Mirrors the backend's
// GET /api/mobile/latest-version response (see web/src/app/api/mobile/
// latest-version/route.ts) one-to-one.

export interface LatestVersionInfo {
  version: string;
  buildNumber: number;
  mandatory: boolean;
  title: string;
  message: string;
  releaseNotes: string[];
  apkUrl: string;
  publishedAt: string;
}

export interface InstalledVersionInfo {
  version: string;
  buildNumber: number;
}
