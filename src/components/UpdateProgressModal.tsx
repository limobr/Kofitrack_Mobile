// src/components/UpdateProgressModal.tsx
//
// Covers everything that happens after the user taps "Update": a real
// progress bar (not just a spinner) with live MB-downloaded numbers, a
// repeated data-charges reminder while the transfer is actually running,
// and the two failure paths that matter -- a failed download (Retry) and
// a blocked install permission (Open Settings).

import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useUpdate } from '../contexts/UpdateContext';

const BRAND_DARK = '#2E2018';
const LINE = '#E4DBCB';
const MUTED = '#8A7C6B';
const BG = '#FAF7F1';
const TERRACOTTA = '#C8623D';

function mb(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

export default function UpdateProgressModal() {
  const { downloadPhase, progress, errorMessage, cancel, retry, openPermissionSettings } = useUpdate();

  if (downloadPhase === 'idle') return null;

  const percent = progress?.percent ?? 0;
  const hasTotal = (progress?.totalBytes ?? 0) > 0;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          {downloadPhase === 'downloading' && (
            <>
              <Text style={styles.title}>Downloading Update…</Text>
              <Text style={styles.percent}>{percent}%</Text>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${percent}%` }]} />
              </View>
              <Text style={styles.byteLabel}>
                {hasTotal
                  ? `${mb(progress!.bytesWritten)} MB of ${mb(progress!.totalBytes)} MB`
                  : `${mb(progress?.bytesWritten ?? 0)} MB downloaded`}
              </Text>
              <Text style={styles.hint}>Using mobile data may incur charges from your carrier.</Text>
              <TouchableOpacity style={styles.btnSecondary} onPress={cancel} activeOpacity={0.85}>
                <Text style={styles.btnSecondaryText}>Cancel</Text>
              </TouchableOpacity>
            </>
          )}

          {downloadPhase === 'downloaded' && (
            <>
              <Text style={styles.title}>Starting Installer…</Text>
              <Text style={styles.hint}>Android will ask you to confirm the install.</Text>
            </>
          )}

          {downloadPhase === 'error' && (
            <>
              <Text style={styles.title}>Download Failed</Text>
              <Text style={styles.hint}>{errorMessage ?? 'Something went wrong. Please try again.'}</Text>
              <TouchableOpacity style={styles.btnPrimary} onPress={retry} activeOpacity={0.85}>
                <Text style={styles.btnPrimaryText}>Retry</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnSecondary} onPress={cancel} activeOpacity={0.85}>
                <Text style={styles.btnSecondaryText}>Close</Text>
              </TouchableOpacity>
            </>
          )}

          {downloadPhase === 'install-blocked' && (
            <>
              <Text style={styles.title}>Allow This Update</Text>
              <Text style={styles.hint}>
                Android needs permission to install updates from KofiTrack. Tap below, enable "Allow from this
                source", then come back and try again. The downloaded update is saved and won't need
                re-downloading.
              </Text>
              <TouchableOpacity style={styles.btnPrimary} onPress={openPermissionSettings} activeOpacity={0.85}>
                <Text style={styles.btnPrimaryText}>Open Settings</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnSecondary} onPress={retry} activeOpacity={0.85}>
                <Text style={styles.btnSecondaryText}>Try Again</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(46,32,24,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  card: {
    backgroundColor: BG,
    borderRadius: 20,
    padding: 28,
    width: '100%',
    alignItems: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: BRAND_DARK,
    marginBottom: 14,
    textAlign: 'center',
  },
  percent: {
    fontSize: 32,
    fontWeight: '800',
    color: BRAND_DARK,
    marginBottom: 10,
  },
  track: {
    width: '100%',
    height: 10,
    borderRadius: 6,
    backgroundColor: '#EFE7D8',
    overflow: 'hidden',
    marginBottom: 10,
  },
  fill: {
    height: '100%',
    borderRadius: 6,
    backgroundColor: TERRACOTTA,
  },
  byteLabel: {
    fontSize: 13,
    color: MUTED,
    marginBottom: 4,
  },
  hint: {
    fontSize: 13,
    color: MUTED,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 18,
  },
  btnPrimary: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 13,
    backgroundColor: BRAND_DARK,
    alignItems: 'center',
    marginBottom: 10,
  },
  btnPrimaryText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  btnSecondary: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 13,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: LINE,
    alignItems: 'center',
  },
  btnSecondaryText: {
    color: BRAND_DARK,
    fontWeight: '600',
    fontSize: 15,
  },
});
