// src/contexts/UpdateContext.tsx
//
// Single source of truth for the in-app update flow. Mirrors the pattern
// already used by NotificationContext: a provider that triggers itself on
// app launch / foreground / login, plus an imperative checkNow() for the
// manual "Check for Updates" row in Settings. UpdateModal and
// UpdateProgressModal both just read from here -- no prop drilling.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AppState, AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import {
  checkForUpdate,
  getInstalledVersion,
  getLastCheckedAt,
  setLastCheckedAt,
} from '../services/update/updateService';
import {
  cancelDownload,
  downloadApk,
  DownloadCancelledError,
  getRemoteFileSizeBytes,
  type DownloadProgress,
} from '../services/update/downloadManager';
import {
  installApk,
  InstallBlockedError,
  openInstallPermissionSettings,
} from '../services/update/installManager';
import type { LatestVersionInfo } from '../services/update/types';

// Matches the backend's own edge-cache window (Cache-Control: s-maxage=60)
// -- no point checking more often than the server's answer can change.
const MIN_CHECK_INTERVAL_MS = 60 * 1000;

export type DownloadPhase = 'idle' | 'downloading' | 'downloaded' | 'error' | 'install-blocked';

/** Feedback popup for a manual "Check for Updates" tap when there's nothing to install. */
export type StatusModalKind = 'up-to-date' | 'check-failed' | null;

interface UpdateContextValue {
  installedVersionLabel: string;
  updateInfo: LatestVersionInfo | null;
  modalVisible: boolean;
  checking: boolean;
  isCellular: boolean;
  estimatedSizeBytes: number | null;
  downloadPhase: DownloadPhase;
  progress: DownloadProgress | null;
  errorMessage: string | null;
  statusModal: StatusModalKind;
  checkNow: (opts?: { manual?: boolean }) => Promise<void>;
  dismiss: () => void;
  dismissStatusModal: () => void;
  startUpdate: () => Promise<void>;
  cancel: () => Promise<void>;
  retry: () => Promise<void>;
  openPermissionSettings: () => Promise<void>;
}

const UpdateContext = createContext<UpdateContextValue | null>(null);

interface Props {
  children: React.ReactNode;
  /** True once a user session exists -- used only to fire the "after login" check. */
  loggedIn: boolean;
}

export function UpdateProvider({ children, loggedIn }: Props) {
  const installed = getInstalledVersion();

  const [updateInfo, setUpdateInfo] = useState<LatestVersionInfo | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [checking, setChecking] = useState(false);
  const [isCellular, setIsCellular] = useState(false);
  const [estimatedSizeBytes, setEstimatedSizeBytes] = useState<number | null>(null);
  const [downloadPhase, setDownloadPhase] = useState<DownloadPhase>('idle');
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusModal, setStatusModal] = useState<StatusModalKind>(null);

  // "Later" on a version sticks for the rest of this app session only --
  // a fresh launch (new session) is allowed to ask again, but we never
  // nag twice for the same version in one sitting.
  const dismissedVersionRef = useRef<string | null>(null);
  const checkingRef = useRef(false);
  const wasLoggedInRef = useRef(loggedIn);

  const checkNow = useCallback(
    async (opts: { manual?: boolean } = {}) => {
      if (checkingRef.current) return;

      if (!opts.manual) {
        const last = await getLastCheckedAt();
        if (last && Date.now() - last < MIN_CHECK_INTERVAL_MS) return;
      }

      checkingRef.current = true;
      setChecking(true);
      try {
        const result = await checkForUpdate();

        // Manual taps bypass the per-session "Later" dismissal -- if the
        // user explicitly asks, show it even if they dismissed it earlier.
        if (result.status === 'update-available' && (opts.manual || result.info.version !== dismissedVersionRef.current)) {
          setUpdateInfo(result.info);
          setModalVisible(true);
          setEstimatedSizeBytes(null);
          // Best-effort size estimate -- never blocks showing the modal.
          getRemoteFileSizeBytes(result.info.apkUrl).then(setEstimatedSizeBytes);
        } else if (opts.manual) {
          setStatusModal(result.status === 'error' ? 'check-failed' : 'up-to-date');
        }
      } finally {
        checkingRef.current = false;
        setChecking(false);
      }
    },
    []
  );

  // Trigger 1: app launch.
  useEffect(() => {
    checkNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Trigger 2: app returns from background.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') checkNow();
    });
    return () => sub.remove();
  }, [checkNow]);

  // Trigger 3: after login (false -> true transition only, so a session
  // restored on launch doesn't double-fire alongside trigger 1).
  useEffect(() => {
    if (loggedIn && !wasLoggedInRef.current) {
      checkNow();
    }
    wasLoggedInRef.current = loggedIn;
  }, [loggedIn, checkNow]);

  // Keep connection type current so the modal can call out cellular data specifically.
  useEffect(() => {
    NetInfo.fetch().then((state) => setIsCellular(state.type === 'cellular'));
    const sub = NetInfo.addEventListener((state) => setIsCellular(state.type === 'cellular'));
    return () => sub();
  }, []);

  const dismiss = useCallback(() => {
    if (updateInfo) dismissedVersionRef.current = updateInfo.version;
    setModalVisible(false);
  }, [updateInfo]);

  const dismissStatusModal = useCallback(() => setStatusModal(null), []);

  const runDownloadAndInstall = useCallback(async () => {
    if (!updateInfo) return;
    setDownloadPhase('downloading');
    setErrorMessage(null);
    setProgress({ bytesWritten: 0, totalBytes: estimatedSizeBytes ?? 0, percent: 0 });

    try {
      const fileUri = await downloadApk(updateInfo.apkUrl, updateInfo.version, setProgress);
      setDownloadPhase('downloaded');

      try {
        await installApk(fileUri);
        // Handed off to Android's installer -- if the user backs out
        // without installing, the APK stays on disk and the next launch/
        // foreground check will bring them right back to this point.
        setModalVisible(false);
        setDownloadPhase('idle');
      } catch (err) {
        if (err instanceof InstallBlockedError) {
          setDownloadPhase('install-blocked');
        } else {
          setDownloadPhase('error');
          setErrorMessage('Could not start the installer. Please try again.');
        }
      }
    } catch (err) {
      if (err instanceof DownloadCancelledError) {
        setDownloadPhase('idle');
      } else {
        setDownloadPhase('error');
        setErrorMessage(
          err instanceof Error ? err.message : 'Download failed. Check your connection and try again.'
        );
      }
    }
  }, [updateInfo, estimatedSizeBytes]);

  const startUpdate = useCallback(() => runDownloadAndInstall(), [runDownloadAndInstall]);
  const retry = useCallback(() => runDownloadAndInstall(), [runDownloadAndInstall]);

  const cancel = useCallback(async () => {
    await cancelDownload();
    setDownloadPhase('idle');
  }, []);

  const openPermissionSettings = useCallback(async () => {
    await openInstallPermissionSettings();
  }, []);

  return (
    <UpdateContext.Provider
      value={{
        installedVersionLabel: installed.version,
        updateInfo,
        modalVisible,
        checking,
        isCellular,
        estimatedSizeBytes,
        downloadPhase,
        progress,
        errorMessage,
        statusModal,
        checkNow,
        dismiss,
        dismissStatusModal,
        startUpdate,
        cancel,
        retry,
        openPermissionSettings,
      }}
    >
      {children}
    </UpdateContext.Provider>
  );
}

export function useUpdate(): UpdateContextValue {
  const ctx = useContext(UpdateContext);
  if (!ctx) {
    throw new Error('useUpdate must be used inside <UpdateProvider>');
  }
  return ctx;
}
