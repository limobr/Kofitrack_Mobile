// src/services/update/installManager.ts
//
// InstallManager: hands the downloaded APK to Android's own installer and
// nothing else. The interesting part is entirely about one failure mode --
// "install unknown apps" being blocked for this app -- since that's the
// only way this normally fails on a real device.

import * as IntentLauncher from 'expo-intent-launcher';
import * as FileSystem from 'expo-file-system/legacy';
import * as Application from 'expo-application';

const APK_MIME_TYPE = 'application/vnd.android.package-archive';

export class InstallBlockedError extends Error {
  constructor() {
    super('Installation permission blocked');
    this.name = 'InstallBlockedError';
  }
}

/**
 * Launches the Android package installer for the given local file.
 * Throws InstallBlockedError if Android refuses to even open the
 * installer -- almost always because "install unknown apps" hasn't been
 * granted to KofiTrack yet (Android 8+ requires this per-app).
 */
export async function installApk(fileUri: string): Promise<void> {
  let contentUri: string;
  try {
    // The installer needs a content:// URI (FileProvider), not a raw
    // file:// path. The provider itself is wired up automatically by
    // expo-file-system's config plugin on prebuild -- nothing to hand-edit
    // in AndroidManifest.xml for a managed/CNG project like this one.
    contentUri = await FileSystem.getContentUriAsync(fileUri);
  } catch {
    throw new InstallBlockedError();
  }

  try {
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: contentUri,
      flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
      type: APK_MIME_TYPE,
    });
  } catch {
    // Most common cause: "install unknown apps" not yet allowed for this app.
    throw new InstallBlockedError();
  }
}

/**
 * Opens the Android settings screen where the user grants "install
 * unknown apps" permission to KofiTrack specifically. Falls back to the
 * general app-details screen on OEM/Android versions that don't expose
 * the dedicated screen.
 */
export async function openInstallPermissionSettings(): Promise<void> {
  const packageUri = `package:${Application.applicationId}`;
  try {
    await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.MANAGE_UNKNOWN_APP_SOURCES, {
      data: packageUri,
    });
  } catch {
    try {
      await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.APPLICATION_DETAILS_SETTINGS, {
        data: packageUri,
      });
    } catch {
      // Give up silently -- the modal already explains what to do by hand.
    }
  }
}
