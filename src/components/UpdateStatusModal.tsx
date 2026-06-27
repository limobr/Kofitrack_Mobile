// src/components/UpdateStatusModal.tsx
//
// Feedback for a manual "Check for Updates" tap in Settings when there's
// nothing to install -- either genuinely up to date, or the check itself
// failed. Replaces a plain Alert.alert() with something that actually
// matches the rest of the app instead of popping a stock OS dialog.

import React from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useUpdate } from '../contexts/UpdateContext';

const BRAND_DARK = '#2E2018';
const LINE = '#E4DBCB';
const MUTED = '#8A7C6B';
const BG = '#FAF7F1';
const TERRACOTTA = '#C8623D';
const SAGE = '#5B7A5B';

export default function UpdateStatusModal() {
  const { statusModal, installedVersionLabel, dismissStatusModal, checkNow } = useUpdate();

  if (!statusModal) return null;

  const isUpToDate = statusModal === 'up-to-date';

  return (
    <Modal visible transparent animationType="fade" onRequestClose={dismissStatusModal}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={[styles.iconWrap, isUpToDate ? styles.iconWrapOk : styles.iconWrapWarn]}>
            <Text style={[styles.iconGlyph, { color: isUpToDate ? SAGE : TERRACOTTA }]}>
              {isUpToDate ? '✓' : '!'}
            </Text>
          </View>

          <Text style={styles.title}>{isUpToDate ? "You're Up to Date" : "Couldn't Check for Updates"}</Text>
          <Text style={styles.body}>
            {isUpToDate
              ? `KofiTrack v${installedVersionLabel} is the latest version.`
              : 'Check your internet connection and try again.'}
          </Text>

          {isUpToDate ? (
            <TouchableOpacity style={styles.btnPrimary} onPress={dismissStatusModal} activeOpacity={0.85}>
              <Text style={styles.btnPrimaryText}>Done</Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity
                style={styles.btnPrimary}
                onPress={() => {
                  dismissStatusModal();
                  checkNow({ manual: true });
                }}
                activeOpacity={0.85}
              >
                <Text style={styles.btnPrimaryText}>Try Again</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnSecondary} onPress={dismissStatusModal} activeOpacity={0.85}>
                <Text style={styles.btnSecondaryText}>Close</Text>
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
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  iconWrapOk: {
    backgroundColor: '#E9F0E6',
  },
  iconWrapWarn: {
    backgroundColor: '#FBEAE3',
  },
  iconGlyph: {
    fontSize: 26,
    fontWeight: '800',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: BRAND_DARK,
    marginBottom: 8,
    textAlign: 'center',
  },
  body: {
    fontSize: 14,
    color: MUTED,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 22,
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
