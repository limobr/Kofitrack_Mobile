import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Platform,
  PermissionsAndroid,
  Linking,
  RefreshControl,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { BleManager } from 'react-native-ble-plx'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { printDeliveryReceipt } from '../services/printService'
import { useAuth } from '../contexts/AuthContext'          // ✅ import auth hook

// ---------- BLE Manager (app‑lifetime) ----------
let bleManagerInstance: BleManager | null = null
function getBleManager(): BleManager {
  if (!bleManagerInstance) {
    bleManagerInstance = new BleManager()
  }
  return bleManagerInstance
}

interface BluetoothDevice {
  id: string
  name: string | null
  rssi: number | null
}

export default function AccountScreen() {
  const insets = useSafeAreaInsets()
  const bleManager = useRef(getBleManager()).current
  const { signOut } = useAuth()                            // ✅ get signOut from context

  const [isBluetoothOn, setIsBluetoothOn] = useState(false)
  const [isCheckingBluetooth, setIsCheckingBluetooth] = useState(true)
  const [isScanning, setIsScanning] = useState(false)
  const [devices, setDevices] = useState<BluetoothDevice[]>([])
  const [selectedDeviceAddress, setSelectedDeviceAddress] = useState<string>('')
  const [selectedDeviceName, setSelectedDeviceName] = useState<string>('')
  const [paperWidth, setPaperWidth] = useState<58 | 80>(58)
  const [saving, setSaving] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [printingTest, setPrintingTest] = useState(false)

  // Manual MAC input
  const [manualAddress, setManualAddress] = useState('')

  useEffect(() => {
    loadSettings()
    checkBluetoothState()
    const sub = bleManager.onStateChange((state) => {
      setIsBluetoothOn(state === 'PoweredOn')
      setIsCheckingBluetooth(false)
    }, true)
    return () => sub.remove()
  }, [])

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
          setSelectedDeviceName('')
        }
      }
      const pw = await AsyncStorage.getItem('paperWidth')
      if (pw) setPaperWidth(Number(pw) as 58 | 80)
    } catch (e) {
      console.error('Error loading settings:', e)
    }
  }

  const checkBluetoothState = useCallback(async () => {
    try {
      const state = await bleManager.state()
      setIsBluetoothOn(state === 'PoweredOn')
    } catch (e) {
      console.warn('BT state check error:', e)
    } finally {
      setIsCheckingBluetooth(false)
    }
  }, [bleManager])

  const requestBLEPermissions = async () => {
    if (Platform.OS !== 'android') return true
    try {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
      ])
      return Object.values(granted).every(
        (s) => s === PermissionsAndroid.RESULTS.GRANTED
      )
    } catch (e) {
      return false
    }
  }

  const openBluetoothSettings = () => {
    if (Platform.OS === 'android') {
      Linking.sendIntent('android.settings.BLUETOOTH_SETTINGS')
    } else {
      Linking.openURL('app-settings:')
    }
  }

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await checkBluetoothState()
    setRefreshing(false)
  }, [checkBluetoothState])

  const startScan = async () => {
    if (isScanning) return
    const permOk = await requestBLEPermissions()
    if (!permOk) {
      Alert.alert('Permissions Required', 'Bluetooth and Location permissions are needed.')
      return
    }
    await checkBluetoothState()
    if (!isBluetoothOn) {
      Alert.alert('Bluetooth Off', 'Please turn on Bluetooth first.')
      return
    }
    setIsScanning(true)
    setDevices([])
    try {
      bleManager.startDeviceScan(
        null,
        { allowDuplicates: false },
        (error, device) => {
          if (error) {
            console.error('Scan error:', error)
            Alert.alert('Scan Error', error.message)
            setIsScanning(false)
            return
          }
          if (!device) return
          setDevices((prev) =>
            prev.find((d) => d.id === device.id)
              ? prev
              : [...prev, { id: device.id, name: device.name, rssi: device.rssi }]
          )
        }
      )
      setTimeout(() => {
        bleManager.stopDeviceScan()
        setIsScanning(false)
      }, 10000)
    } catch (err) {
      setIsScanning(false)
      Alert.alert('Scan Error', 'Could not start BLE scan.')
    }
  }

  const connectAndSelect = async (device: BluetoothDevice) => {
    setConnecting(true)
    try {
      const conn = await bleManager.connectToDevice(device.id)
      await conn.discoverAllServicesAndCharacteristics()
      const name = device.name || device.id
      setSelectedDeviceAddress(device.id)
      setSelectedDeviceName(name)
      Alert.alert('Connected', `Bonded with ${name}`)
      await conn.cancelConnection()
    } catch (err: any) {
      Alert.alert(
        'Connection Failed',
        err.message +
          '\n\nIf the problem persists, pair the printer manually in Android Bluetooth settings and enter its MAC address below.'
      )
    } finally {
      setConnecting(false)
    }
  }

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
    Alert.alert('Cleared', 'Selected printer removed.')
  }

  const saveSettings = async () => {
    setSaving(true)
    try {
      const dataToSave = JSON.stringify({
        address: selectedDeviceAddress,
        name: selectedDeviceName || selectedDeviceAddress,
      })
      await AsyncStorage.setItem('selectedPrinter', dataToSave)
      await AsyncStorage.setItem('paperWidth', String(paperWidth))
      Alert.alert('Success', 'Printer settings saved.')
    } catch (e) {
      Alert.alert('Error', 'Could not save settings.')
    } finally {
      setSaving(false)
    }
  }

  const handlePrintTest = async () => {
    if (!selectedDeviceAddress) {
      Alert.alert('No Printer', 'Please select a printer first.')
      return
    }
    setPrintingTest(true)
    try {
      const now = new Date()
      await printDeliveryReceipt(
        'Test Member',
        'TST001',
        12.5,
        'cherry',
        now.toLocaleDateString(),
        now.toLocaleTimeString(),
        { printerAddress: selectedDeviceAddress, paperWidth }
      )
    } catch (e: any) {
      Alert.alert('Print Error', e.message)
    } finally {
      setPrintingTest(false)
    }
  }

  // ---- Logout handler ----
  const handleLogout = () => {
    Alert.alert(
      'Log Out',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Log Out', style: 'destructive', onPress: async () => {
          try {
            await signOut()
          } catch (e) {
            Alert.alert('Error', 'Could not log out. Please try again.')
          }
        }},
      ]
    )
  }

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={['#8c6239']} tintColor="#8c6239" />
        }
      >
        {/* Bluetooth status */}
        <View style={styles.card}>
          <View style={styles.bluetoothRow}>
            <View style={styles.bluetoothStatus}>
              <Ionicons name="bluetooth" size={24} color={isBluetoothOn ? '#22c55e' : '#ef4444'} />
              <Text style={[styles.bluetoothText, isBluetoothOn ? styles.onText : styles.offText]}>
                {isCheckingBluetooth ? 'Checking...' : isBluetoothOn ? 'Bluetooth On' : 'Bluetooth Off'}
              </Text>
            </View>
            {!isBluetoothOn && !isCheckingBluetooth && (
              <TouchableOpacity style={styles.enableButton} onPress={openBluetoothSettings}>
                <Text style={styles.enableButtonText}>Turn On</Text>
              </TouchableOpacity>
            )}
          </View>

          <Text style={styles.instruction}>
            Pair your printer in Android Bluetooth settings first. If the BLE scan doesn’t find it, enter the printer’s MAC address manually below.
          </Text>

          {isBluetoothOn && !isScanning && devices.length === 0 && (
            <TouchableOpacity style={styles.primaryButton} onPress={startScan}>
              <Ionicons name="scan" size={20} color="#fff" />
              <Text style={styles.primaryButtonText}>Scan for BLE Printers</Text>
            </TouchableOpacity>
          )}

          {isScanning && (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color="#8c6239" />
              <Text style={styles.loadingText}>Scanning for printers...</Text>
            </View>
          )}

          {devices.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>Found Devices</Text>
              {devices.map((d) => (
                <TouchableOpacity
                  key={d.id}
                  style={[styles.deviceItem, selectedDeviceAddress === d.id && styles.selectedDevice]}
                  onPress={() => connectAndSelect(d)}
                  disabled={connecting}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={selectedDeviceAddress === d.id ? 'radio-button-on' : 'radio-button-off'}
                    size={22}
                    color="#8c6239"
                  />
                  <View style={styles.deviceInfo}>
                    <Text style={styles.deviceName}>{d.name || 'Unknown Device'}</Text>
                    <Text style={styles.deviceId}>{d.id}</Text>
                  </View>
                  {d.rssi && (
                    <View style={styles.deviceRssi}>
                      <Ionicons name="cellular" size={18} color="#6b7280" />
                      <Text style={styles.rssiText}>{d.rssi} dBm</Text>
                    </View>
                  )}
                  {connecting && selectedDeviceAddress === d.id ? (
                    <ActivityIndicator size="small" color="#8c6239" />
                  ) : null}
                </TouchableOpacity>
              ))}
            </>
          )}

          {isBluetoothOn && !isScanning && devices.length > 0 && (
            <TouchableOpacity style={styles.secondaryButton} onPress={startScan}>
              <Text style={styles.secondaryButtonText}>Scan Again</Text>
            </TouchableOpacity>
          )}

          {/* Manual MAC address entry */}
          <View style={styles.manualEntry}>
            <Text style={styles.sectionTitle}>Manual Address</Text>
            <TextInput
              style={styles.manualInput}
              placeholder="e.g. 02:07:FD:D4:10:55"
              placeholderTextColor="#9e8e7e"
              value={manualAddress}
              onChangeText={setManualAddress}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity style={styles.manualButton} onPress={useManualAddress}>
              <Text style={styles.manualButtonText}>Use This Address</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Selected printer */}
        {selectedDeviceAddress ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Selected Printer</Text>
            <View style={styles.selectedContainer}>
              <Ionicons name="print-outline" size={20} color="#2e7d32" />
              <Text style={styles.selectedInfo}>
                {selectedDeviceName || selectedDeviceAddress}
              </Text>
              <TouchableOpacity onPress={clearSelectedPrinter} style={styles.clearBtn}>
                <Text style={styles.clearBtnText}>Clear</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.testPrintButton, printingTest && { opacity: 0.6 }]}
              onPress={handlePrintTest}
              disabled={printingTest}
            >
              {printingTest ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="print" size={18} color="#fff" />
                  <Text style={styles.testPrintButtonText}>Print Test Receipt</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Paper width */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Paper Width</Text>
          <View style={styles.radioRow}>
            <TouchableOpacity
              style={[styles.radioOption, paperWidth === 58 && styles.radioActive]}
              onPress={() => setPaperWidth(58)}
            >
              <Text style={[styles.radioText, paperWidth === 58 && styles.radioTextActive]}>58 mm</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.radioOption, paperWidth === 80 && styles.radioActive]}
              onPress={() => setPaperWidth(80)}
            >
              <Text style={[styles.radioText, paperWidth === 80 && styles.radioTextActive]}>80 mm</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Save button */}
        <TouchableOpacity style={styles.saveButton} onPress={saveSettings} disabled={saving}>
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="save-outline" size={18} color="#fff" />
              <Text style={styles.saveButtonText}>Save Settings</Text>
            </>
          )}
        </TouchableOpacity>

        {/* ==================== LOGOUT BUTTON ==================== */}
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color="#fff" />
          <Text style={styles.logoutButtonText}>Log Out</Text>
        </TouchableOpacity>

      </ScrollView>
    </View>
  )
}



const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#faf9f6' },
  content: { padding: 16 },
  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 20, marginBottom: 20,
    borderWidth: 1, borderColor: '#e0d9d0',
  },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#3d2b1f', marginBottom: 12 },
  instruction: { fontSize: 13, color: '#6b5e53', marginBottom: 12 },
  bluetoothRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16,
  },
  bluetoothStatus: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bluetoothText: { fontSize: 16, fontWeight: '500' },
  onText: { color: '#22c55e' },
  offText: { color: '#ef4444' },
  enableButton: {
    backgroundColor: '#e0f2e6', paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20,
  },
  enableButtonText: { color: '#22c55e', fontWeight: '600' },
  primaryButton: {
    flexDirection: 'row', backgroundColor: '#8c6239', padding: 14, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12,
  },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  secondaryButton: {
    backgroundColor: '#fff', padding: 14, borderRadius: 10, alignItems: 'center',
    justifyContent: 'center', borderWidth: 1, borderColor: '#8c6239', marginTop: 8,
  },
  secondaryButtonText: { color: '#8c6239', fontSize: 16, fontWeight: '600' },
  centered: { justifyContent: 'center', alignItems: 'center', marginVertical: 16 },
  loadingText: { marginTop: 8, color: '#6b5e53', fontSize: 14 },
  deviceItem: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#faf9f6', padding: 14,
    borderRadius: 12, marginBottom: 8, borderWidth: 1, borderColor: '#d9d0c7', gap: 12,
  },
  selectedDevice: { borderColor: '#8c6239', backgroundColor: '#f0ece6' },
  deviceInfo: { flex: 1 },
  deviceName: { fontSize: 16, fontWeight: '600', color: '#1f2937' },
  deviceId: { fontSize: 12, color: '#6b5e53', marginTop: 2 },
  deviceRssi: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rssiText: { fontSize: 12, color: '#6b7280' },
  manualEntry: { marginTop: 16 },
  manualInput: {
    backgroundColor: '#faf9f6',
    borderWidth: 1,
    borderColor: '#d9d0c7',
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: '#1a1512',
    marginBottom: 8,
  },
  manualButton: {
    backgroundColor: '#8c6239',
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  manualButtonText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  selectedContainer: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#e8f5e9',
    borderRadius: 8, padding: 12, marginBottom: 12,
  },
  selectedInfo: { flex: 1, fontSize: 14, color: '#2e7d32', marginLeft: 8, fontWeight: '500' },
  clearBtn: { paddingHorizontal: 12, paddingVertical: 4 },
  clearBtnText: { color: '#c62828', fontWeight: '600', fontSize: 14 },
  testPrintButton: {
    flexDirection: 'row', backgroundColor: '#8c6239', padding: 12, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  testPrintButtonText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  radioRow: { flexDirection: 'row', gap: 12 },
  radioOption: {
    flex: 1, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#d9d0c7', alignItems: 'center',
  },
  radioActive: { backgroundColor: '#3d2b1f', borderColor: '#3d2b1f' },
  radioText: { fontSize: 15, fontWeight: '600', color: '#3d2b1f' },
  radioTextActive: { color: '#fff' },
  saveButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#3d2b1f', padding: 16, borderRadius: 14, gap: 8, marginBottom: 30,
  },
  saveButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },

  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#b71c1c',
    padding: 16,
    borderRadius: 14,
    gap: 8,
    marginBottom: 30,
  },
  logoutButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
})