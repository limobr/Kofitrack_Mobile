// src/components/UpdateModal.tsx
//
// "New Version Available" prompt. Two things this has to get right per
// the spec: show what changed (release notes), and be upfront about data
// usage *before* the user commits to downloading -- not buried in fine
// print, and worded differently depending on whether they're on cellular.

import React from 'react';
import { Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useUpdate } from '../contexts/UpdateContext';

const BRAND_DARK = '#2E2018';
const UMBER = '#8C6239';
const LINE = '#E4DBCB';
const MUTED = '#8A7C6B';
const BG = '#FAF7F1';
const TERRACOTTA = '#C8623D';

function formatSize(bytes: number | null): string | null {
  if (!bytes || bytes <= 0) return null;
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
}

export default function UpdateModal() {
  const { updateInfo, modalVisible, isCellular, estimatedSizeBytes, dismiss, startUpdate } = useUpdate();

  if (!updateInfo) return null;

  const mandatory = updateInfo.mandatory;
  const sizeLabel = formatSize(estimatedSizeBytes);

  return (
    <Modal
      visible={modalVisible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!mandatory) dismiss();
      }}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <Text style={styles.iconGlyph}>↓</Text>
          </View>

          <Text style={styles.title}>{updateInfo.title || 'New Version Available'}</Text>
          <Text style={styles.subtitle}>
            Version {updateInfo.version} is available{updateInfo.message ? ` — ${updateInfo.message}` : '.'}
          </Text>

          {updateInfo.releaseNotes.length > 0 && (
            <ScrollView style={styles.notesBox} showsVerticalScrollIndicator={false}>
              <Text style={styles.notesHeading}>WHAT'S NEW</Text>
              {updateInfo.releaseNotes.map((note, i) => (
                <View key={i} style={styles.noteRow}>
                  <Text style={styles.noteBullet}>•</Text>
                  <Text style={styles.noteText}>{note}</Text>
                </View>
              ))}
            </ScrollView>
          )}

          {/* Data usage / data charges notice */}
          <View style={[styles.dataNotice, isCellular && styles.dataNoticeWarn]}>
            <Text style={styles.dataNoticeText}>
              {sizeLabel ? `This update is about ${sizeLabel}. ` : 'This update will be downloaded over the network. '}
              {isCellular
                ? "You're on mobile data — standard data charges from your carrier may apply."
                : 'Data charges may apply if you switch off Wi-Fi during the download.'}
            </Text>
          </View>

          {mandatory ? (
            <TouchableOpacity style={styles.btnPrimary} onPress={startUpdate} activeOpacity={0.85}>
              <Text style={styles.btnPrimaryText}>Update Now</Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity style={styles.btnPrimary} onPress={startUpdate} activeOpacity={0.85}>
                <Text style={styles.btnPrimaryText}>Update</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnSecondary} onPress={dismiss} activeOpacity={0.85}>
                <Text style={styles.btnSecondaryText}>Later</Text>
              </TouchableOpacity>
            </>
          )}

          {mandatory && (
            <Text style={styles.mandatoryNote}>This update is required to continue using KofiTrack.</Text>
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
    padding: 24,
    width: '100%',
    maxHeight: '85%',
    alignItems: 'center',
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#EEF0F5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  iconGlyph: {
    fontSize: 24,
    fontWeight: '700',
    color: '#3D5A8A',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: BRAND_DARK,
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: MUTED,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 14,
  },
  notesBox: {
    width: '100%',
    maxHeight: 160,
    backgroundColor: '#fff',
    borderRadius: 13,
    borderWidth: 1,
    borderColor: LINE,
    padding: 14,
    marginBottom: 14,
  },
  notesHeading: {
    fontSize: 11,
    fontWeight: '700',
    color: UMBER,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  noteRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  noteBullet: {
    color: UMBER,
    marginRight: 8,
    fontSize: 14,
  },
  noteText: {
    flex: 1,
    fontSize: 14,
    color: BRAND_DARK,
    lineHeight: 20,
  },
  dataNotice: {
    width: '100%',
    backgroundColor: '#F3EEE3',
    borderRadius: 13,
    borderWidth: 1,
    borderColor: LINE,
    padding: 14,
    marginBottom: 18,
  },
  dataNoticeWarn: {
    backgroundColor: '#FBEAE3',
    borderColor: '#EBC2AE',
  },
  dataNoticeText: {
    fontSize: 13,
    color: BRAND_DARK,
    lineHeight: 19,
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
  mandatoryNote: {
    fontSize: 12,
    color: TERRACOTTA,
    textAlign: 'center',
    marginTop: 12,
  },
});
