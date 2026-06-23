import React, { useState, useEffect, useCallback } from 'react'
import {
  View, Text, TouchableOpacity, ScrollView, TextInput,
  ActivityIndicator, Alert, StyleSheet, Platform,
  PermissionsAndroid, Linking, RefreshControl,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { printDeliveryReceipt } from '../services/printService'
import Header from '../components/Header'

// ─── Safe import of react-native-bluetooth-classic ───────────────────────────
let BluetoothClassic: any = null
try {
  const mod = require('react-native-bluetooth-classic')
  BluetoothClassic = mod.default || mod
} catch (e) {
  console.warn('react-native-bluetooth-classic not available')
}

interface ClassicDevice {
  address: string
  name: string | null
  bonded: boolean
}

// ─── Palette (matches app theme) ─────────────────────────────────────────────
const C = {
  bg: '#faf9f6',
  surface: '#fff',
  brandDark: '#3d2b1f',
  brandMid: '#8c6239',
  brandLight: '#d9d0c7',
  border: '#e0d9d0',
  subtle: '#f0ece6',
  success: '#2e7d32',
  successBg: '#e8f5e9',
  error: '#c62828',
  textPrimary: '#1a1512',
  textSecondary: '#6b5e53',
  textTertiary: '#9e8e7e',
}

export default function PrinterSettingsScreen() {
  const insets = useSafeAreaInsets()

  const [isBluetoothOn, setIsBluetoothOn]           = useState(false)
  const [isCheckingBluetooth, setIsCheckingBluetooth] = useState(true)
  const [isScanning, setIsScanning]                 = useState(false)
  const [bondedDevices, setBondedDevices]           = useState<ClassicDevice[]>([])
  const [selectedDeviceAddress, setSelectedDeviceAddress] = useState('')
  const [selectedDeviceName, setSelectedDeviceName] = useState('')
  const [paperWidth, setPaperWidth]                 = useState<58 | 80>(58)
  const [saving, setSaving]                         = useState(false)
  const [printingTest, setPrintingTest]             = useState(false)
  const [manualAddress, setManualAddress]           = useState('')
  const [refreshing, setRefreshing]                 = useState(false)

  useEffect(() => {
    loadSettings()
    checkBluetoothState()
  }, [])

  // ── Persist / load ──────────────────────────────────────────────────────────
  const loadSettings = async () => {
    try {
      const raw = await AsyncStorage.getItem('selectedPrinter')
      if (raw) {
        try {
          const parsed = JSON.parse(raw)
          if (typeof parsed === 'object' && parsed.address) {
            setSelectedDeviceAddress(parsed.address)
            setSelectedDeviceName(parsed.name || '')
          }
        } catch {
          setSelectedDeviceAddress(raw)
        }
      }
      const pw = await AsyncStorage.getItem('paperWidth')
      if (pw) setPaperWidth(Number(pw) as 58 | 80)
    } catch (_) {}
  }

  // ── Bluetooth state ─────────────────────────────────────────────────────────
  const checkBluetoothState = useCallback(async () => {
    setIsCheckingBluetooth(true)
    try {
      if (!BluetoothClassic) { setIsCheckingBluetooth(false); return }
      const enabled: boolean = await BluetoothClassic.isBluetoothEnabled()
      setIsBluetoothOn(enabled)
    } catch (_) {
      setIsBluetoothOn(false)
    } finally {
      setIsCheckingBluetooth(false)
    }
  }, [])

  // ── Android permissions ─────────────────────────────────────────────────────
  const requestPermissions = async (): Promise<boolean> => {
    if (Platform.OS !== 'android') return true
    try {
      const perms: any[] = [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION]
      // Android 12+ needs BLUETOOTH_SCAN + BLUETOOTH_CONNECT
      if (Platform.Version >= 31) {
        perms.push(
          (PermissionsAndroid.PERMISSIONS as any).BLUETOOTH_SCAN,
          (PermissionsAndroid.PERMISSIONS as any).BLUETOOTH_CONNECT,
        )
      }
      const results = await PermissionsAndroid.requestMultiple(perms as any)
      return Object.values(results).every(r => r === PermissionsAndroid.RESULTS.GRANTED)
    } catch {
      return false
    }
  }

  const openBluetoothSettings = () => {
    if (Platform.OS === 'android') Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS')
    else Linking.openURL('app-settings:')
  }

  // ── Fetch bonded (paired) devices ───────────────────────────────────────────
  // Classic BT thermal printers must already be paired in the OS settings.
  // getBondedDevices() returns that list instantly — no active scan needed.
  const fetchBondedDevices = useCallback(async () => {
    if (!BluetoothClassic) {
      Alert.alert('Unavailable', 'Bluetooth Classic module not loaded.')
      return
    }
    const permOk = await requestPermissions()
    if (!permOk) {
      Alert.alert('Permissions Required', 'Bluetooth and Location permissions are needed to list devices.')
      return
    }
    await checkBluetoothState()
    if (!isBluetoothOn) {
      Alert.alert('Bluetooth Off', 'Please turn on Bluetooth first, then try again.')
      return
    }
    setIsScanning(true)
    try {
      const paired: any[] = await BluetoothClassic.getBondedDevices()
      setBondedDevices(
        paired.map(d => ({ address: d.address, name: d.name || null, bonded: true }))
      )
      if (paired.length === 0) {
        Alert.alert(
          'No Paired Devices',
          'No Bluetooth devices are paired to this phone.\n\nPair your printer in Android Bluetooth settings first, then come back here.',
          [
            { text: 'Open Settings', onPress: openBluetoothSettings },
            { text: 'OK' },
          ]
        )
      }
    } catch (err: any) {
      Alert.alert('Error', 'Could not fetch bonded devices: ' + err.message)
    } finally {
      setIsScanning(false)
    }
  }, [isBluetoothOn, checkBluetoothState])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await checkBluetoothState()
    if (bondedDevices.length > 0) await fetchBondedDevices()
    setRefreshing(false)
  }, [checkBluetoothState, fetchBondedDevices, bondedDevices.length])

  // ── Select a device from the list ───────────────────────────────────────────
  const selectDevice = (device: ClassicDevice) => {
    setSelectedDeviceAddress(device.address)
    setSelectedDeviceName(device.name || device.address)
  }

  // ── Manual address entry ────────────────────────────────────────────────────
  const useManualAddress = () => {
    const trimmed = manualAddress.trim()
    if (trimmed.length < 11) {
      Alert.alert('Invalid Address', 'Enter a valid Bluetooth MAC address (e.g., 02:07:FD:D4:10:55).')
      return
    }
    setSelectedDeviceAddress(trimmed)
    setSelectedDeviceName('Manual Printer')
    Alert.alert('Address Set', `Printer address set to ${trimmed}`)
  }

  const clearSelectedPrinter = () => {
    setSelectedDeviceAddress('')
    setSelectedDeviceName('')
  }

  // ── Save settings ───────────────────────────────────────────────────────────
  const saveSettings = async () => {
    setSaving(true)
    try {
      await AsyncStorage.setItem(
        'selectedPrinter',
        JSON.stringify({ address: selectedDeviceAddress, name: selectedDeviceName || selectedDeviceAddress })
      )
      await AsyncStorage.setItem('paperWidth', String(paperWidth))
      Alert.alert('Saved', 'Printer settings saved.')
    } catch {
      Alert.alert('Error', 'Could not save settings.')
    } finally {
      setSaving(false)
    }
  }

  // ── Test print ──────────────────────────────────────────────────────────────
  const handlePrintTest = async () => {
    if (!selectedDeviceAddress) {
      Alert.alert('No Printer', 'Please select or enter a printer address first.')
      return
    }
    setPrintingTest(true)
    try {
      const now = new Date()
      await printDeliveryReceipt(
        'Test Member', 'TST001', 12.5, 'cherry',
        now.toLocaleDateString(), now.toLocaleTimeString(),
        { printerAddress: selectedDeviceAddress, paperWidth }
      )
    } catch (e: any) {
      Alert.alert('Print Error', e.message)
    } finally {
      setPrintingTest(false)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <Header title="Printer Settings" showBack={true} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[C.brandMid]}
            tintColor={C.brandMid}
          />
        }
      >

        {/* ── Bluetooth status card ─────────────────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.btRow}>
            <View style={styles.btStatus}>
              <Ionicons
                name="bluetooth"
                size={22}
                color={isCheckingBluetooth ? C.textTertiary : isBluetoothOn ? C.success : C.error}
              />
              <Text style={[
                styles.btText,
                isBluetoothOn ? styles.btOn : styles.btOff,
                isCheckingBluetooth && styles.btChecking,
              ]}>
                {isCheckingBluetooth ? 'Checking…' : isBluetoothOn ? 'Bluetooth On' : 'Bluetooth Off'}
              </Text>
            </View>
            {!isBluetoothOn && !isCheckingBluetooth && (
              <TouchableOpacity style={styles.btEnableBtn} onPress={openBluetoothSettings} activeOpacity={0.75}>
                <Text style={styles.btEnableText}>Turn On</Text>
              </TouchableOpacity>
            )}
          </View>

          <Text style={styles.instruction}>
            Thermal printers use <Text style={styles.bold}>Classic Bluetooth (SPP)</Text>. Pair your printer
            once in Android Bluetooth settings, then tap <Text style={styles.bold}>Load Paired Printers</Text> below.
          </Text>

          {/* Load paired devices button */}
          {!isScanning ? (
            <TouchableOpacity
              style={[styles.primaryBtn, (!isBluetoothOn || isCheckingBluetooth) && styles.btnDisabled]}
              onPress={fetchBondedDevices}
              disabled={!isBluetoothOn || isCheckingBluetooth}
              activeOpacity={0.8}
            >
              <Ionicons name="list" size={18} color="#fff" />
              <Text style={styles.primaryBtnText}>Load Paired Printers</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.scanningRow}>
              <ActivityIndicator size="small" color={C.brandMid} />
              <Text style={styles.scanningText}>Loading paired devices…</Text>
            </View>
          )}

          {/* Paired device list */}
          {bondedDevices.length > 0 && (
            <View style={styles.deviceList}>
              <Text style={styles.sectionLabel}>Paired Devices</Text>
              {bondedDevices.map(d => {
                const isSelected = selectedDeviceAddress === d.address
                return (
                  <TouchableOpacity
                    key={d.address}
                    style={[styles.deviceItem, isSelected && styles.deviceItemSelected]}
                    onPress={() => selectDevice(d)}
                    activeOpacity={0.75}
                  >
                    <Ionicons
                      name={isSelected ? 'radio-button-on' : 'radio-button-off'}
                      size={20}
                      color={C.brandMid}
                    />
                    <View style={styles.deviceInfo}>
                      <Text style={styles.deviceName}>{d.name || 'Unknown Device'}</Text>
                      <Text style={styles.deviceAddress}>{d.address}</Text>
                    </View>
                    {isSelected && (
                      <Ionicons name="checkmark-circle" size={20} color={C.success} />
                    )}
                  </TouchableOpacity>
                )
              })}

              <TouchableOpacity style={styles.secondaryBtn} onPress={fetchBondedDevices} activeOpacity={0.75}>
                <Ionicons name="refresh" size={16} color={C.brandMid} />
                <Text style={styles.secondaryBtnText}>Refresh List</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ── Manual address card ───────────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Manual Address Entry</Text>
          <Text style={styles.instruction}>
            If your printer doesn't appear above, enter its MAC address directly.
          </Text>
          <TextInput
            style={styles.manualInput}
            placeholder="e.g. 02:07:FD:D4:10:55"
            placeholderTextColor={C.textTertiary}
            value={manualAddress}
            onChangeText={setManualAddress}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity style={styles.manualBtn} onPress={useManualAddress} activeOpacity={0.8}>
            <Text style={styles.manualBtnText}>Use This Address</Text>
          </TouchableOpacity>
        </View>

        {/* ── Selected printer card ─────────────────────────────────────────── */}
        {selectedDeviceAddress ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Selected Printer</Text>
            <View style={styles.selectedRow}>
              <Ionicons name="print-outline" size={20} color={C.success} />
              <Text style={styles.selectedName} numberOfLines={1}>
                {selectedDeviceName || selectedDeviceAddress}
              </Text>
              <TouchableOpacity onPress={clearSelectedPrinter} style={styles.clearBtn} activeOpacity={0.7}>
                <Ionicons name="close-circle" size={18} color={C.error} />
                <Text style={styles.clearBtnText}>Clear</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.selectedAddress}>{selectedDeviceAddress}</Text>

            <TouchableOpacity
              style={[styles.testPrintBtn, printingTest && styles.btnDisabled]}
              onPress={handlePrintTest}
              disabled={printingTest}
              activeOpacity={0.8}
            >
              {printingTest ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="print" size={18} color="#fff" />
                  <Text style={styles.testPrintBtnText}>Print Test Receipt</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        ) : null}

        {/* ── Paper width card ──────────────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Paper Width</Text>
          <Text style={styles.instruction}>Match this to your printer's paper roll size.</Text>
          <View style={styles.radioRow}>
            {([58, 80] as const).map(w => (
              <TouchableOpacity
                key={w}
                style={[styles.radioOption, paperWidth === w && styles.radioActive]}
                onPress={() => setPaperWidth(w)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={paperWidth === w ? 'checkmark-circle' : 'ellipse-outline'}
                  size={18}
                  color={paperWidth === w ? '#fff' : C.brandLight}
                />
                <Text style={[styles.radioText, paperWidth === w && styles.radioTextActive]}>
                  {w} mm
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Save button ───────────────────────────────────────────────────── */}
        <TouchableOpacity
          style={[styles.saveBtn, saving && styles.btnDisabled]}
          onPress={saveSettings}
          disabled={saving}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="save-outline" size={18} color="#fff" />
              <Text style={styles.saveBtnText}>Save Settings</Text>
            </>
          )}
        </TouchableOpacity>

      </ScrollView>
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16 },

  // Card
  card: {
    backgroundColor: C.surface,
    borderRadius: 14,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: C.border,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: C.brandDark,
    marginBottom: 10,
    letterSpacing: 0.2,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: C.brandMid,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 16,
  },
  instruction: { fontSize: 13, color: C.textSecondary, marginBottom: 14, lineHeight: 19 },
  bold: { fontWeight: '600', color: C.textPrimary },

  // Bluetooth status row
  btRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  btStatus: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btText: { fontSize: 15, fontWeight: '600' },
  btOn: { color: C.success },
  btOff: { color: C.error },
  btChecking: { color: C.textTertiary },
  btEnableBtn: {
    backgroundColor: '#e8f5e9',
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  btEnableText: { color: C.success, fontWeight: '600', fontSize: 13 },

  // Buttons
  primaryBtn: {
    flexDirection: 'row',
    backgroundColor: C.brandMid,
    padding: 13,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  secondaryBtn: {
    flexDirection: 'row',
    backgroundColor: C.surface,
    padding: 11,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: C.brandMid,
    marginTop: 10,
  },
  secondaryBtnText: { color: C.brandMid, fontSize: 14, fontWeight: '600' },
  btnDisabled: { opacity: 0.5 },

  // Scanning
  scanningRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  scanningText: { color: C.textSecondary, fontSize: 14 },

  // Device list
  deviceList: { marginTop: 4 },
  deviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.bg,
    padding: 13,
    borderRadius: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: C.border,
    gap: 10,
  },
  deviceItemSelected: { borderColor: C.brandMid, backgroundColor: C.subtle },
  deviceInfo: { flex: 1 },
  deviceName: { fontSize: 15, fontWeight: '600', color: C.textPrimary },
  deviceAddress: { fontSize: 11, color: C.textTertiary, marginTop: 2, fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }) },

  // Manual entry
  manualInput: {
    backgroundColor: C.bg,
    borderWidth: 1,
    borderColor: C.brandLight,
    borderRadius: 8,
    padding: 11,
    fontSize: 14,
    color: C.textPrimary,
    marginBottom: 10,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
  },
  manualBtn: {
    backgroundColor: C.brandMid,
    padding: 11,
    borderRadius: 8,
    alignItems: 'center',
  },
  manualBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },

  // Selected printer
  selectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8f5e9',
    borderRadius: 8,
    padding: 12,
    gap: 8,
    marginBottom: 6,
  },
  selectedName: { flex: 1, fontSize: 14, color: C.success, fontWeight: '600' },
  selectedAddress: {
    fontSize: 11,
    color: C.textTertiary,
    marginBottom: 14,
    paddingHorizontal: 2,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
  },
  clearBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 4 },
  clearBtnText: { color: C.error, fontWeight: '600', fontSize: 13 },
  testPrintBtn: {
    flexDirection: 'row',
    backgroundColor: C.brandMid,
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  testPrintBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },

  // Paper width
  radioRow: { flexDirection: 'row', gap: 12 },
  radioOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.brandLight,
  },
  radioActive: { backgroundColor: C.brandDark, borderColor: C.brandDark },
  radioText: { fontSize: 15, fontWeight: '600', color: C.brandDark },
  radioTextActive: { color: '#fff' },

  // Save
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.brandDark,
    padding: 16,
    borderRadius: 14,
    gap: 8,
    marginBottom: 10,
  },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
})