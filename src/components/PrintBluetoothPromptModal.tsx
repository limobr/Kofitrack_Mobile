/**
 * PrintBluetoothPromptModal.tsx
 *
 * Shared "Bluetooth is Off" prompt, shown on Record Delivery / Record
 * Transaction (and any other print-capable screen) when the user's saved
 * print preference is ON but Bluetooth is currently off.
 *
 * Previously this modal's JSX + styles were duplicated verbatim in both
 * RecordDeliveryScreen.tsx and RecordTransactionScreen.tsx. It now lives
 * here so both screens render the same component.
 */

import React from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet } from 'react-native';

interface Props {
  visible: boolean;
  onClose: () => void;
  onGoToSettings: () => void;
  onProceedWithoutPrinting: () => void;
}

export default function PrintBluetoothPromptModal({
  visible,
  onClose,
  onGoToSettings,
  onProceedWithoutPrinting,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.btOverlay}>
        <View style={styles.btCard}>
          {/* Bluetooth icon — two rectangles forming a B-like glyph */}
          <View style={styles.btIconWrap}>
            <View style={styles.btIconOuter}>
              <View style={styles.btIconStem} />
              <View style={styles.btIconArmTop} />
              <View style={styles.btIconArmBottom} />
            </View>
          </View>

          <Text style={styles.btTitle}>Bluetooth is Off</Text>
          <Text style={styles.btBody}>
            Your print preference is set to ON, but Bluetooth is currently disabled.
            Turn Bluetooth on to print receipts, or proceed without printing.
          </Text>

          <TouchableOpacity style={styles.btBtnPrimary} onPress={onGoToSettings} activeOpacity={0.8}>
            <Text style={styles.btBtnPrimaryText}>Go to Printer Settings</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.btBtnSecondary}
            onPress={onProceedWithoutPrinting}
            activeOpacity={0.8}
          >
            <Text style={styles.btBtnSecondaryText}>Proceed Without Printing</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  btOverlay: {
    flex: 1,
    backgroundColor: 'rgba(46,32,24,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  btCard: {
    backgroundColor: '#FAF7F1',
    borderRadius: 20,
    padding: 28,
    width: '100%',
    alignItems: 'center',
  },
  btIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: '#EEF0F5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  btIconOuter: {
    width: 22,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  btIconStem: {
    position: 'absolute',
    width: 2,
    height: 28,
    backgroundColor: '#3D5A8A',
    left: 10,
  },
  btIconArmTop: {
    position: 'absolute',
    width: 14,
    height: 2,
    backgroundColor: '#3D5A8A',
    top: 5,
    left: 3,
    transform: [{ rotate: '45deg' }],
  },
  btIconArmBottom: {
    position: 'absolute',
    width: 14,
    height: 2,
    backgroundColor: '#3D5A8A',
    bottom: 5,
    left: 3,
    transform: [{ rotate: '-45deg' }],
  },
  btTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2E2018',
    marginBottom: 10,
    textAlign: 'center',
  },
  btBody: {
    fontSize: 14,
    color: '#8A7C6B',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 24,
  },
  btBtnPrimary: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 13,
    backgroundColor: '#2E2018',
    alignItems: 'center',
    marginBottom: 10,
  },
  btBtnPrimaryText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  btBtnSecondary: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 13,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E4DBCB',
    alignItems: 'center',
  },
  btBtnSecondaryText: {
    color: '#2E2018',
    fontWeight: '600',
    fontSize: 15,
  },
});
