import React, { useState, useRef, useEffect } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Switch,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import api from '../api/client'
import { supabase } from '../contexts/AuthContext'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { printDeliveryReceipt } from '../services/printService'

export default function RecordDeliveryScreen() {
  const navigation = useNavigation<any>()

  const [regNo, setRegNo] = useState('')
  const [member, setMember] = useState<any>(null)
  const [cumulative, setCumulative] = useState({ delivered: 0, bought: 0, sold: 0, net: 0 })
  const [weight, setWeight] = useState('')
  const [type, setType] = useState<'cherry' | 'mbuni'>('cherry')
  const [loading, setLoading] = useState(false)
  const [searching, setSearching] = useState(false)

  // Print‑related
  const [printReceipt, setPrintReceipt] = useState(false)       // starts off until Bluetooth/printer ready
  const [printerConfigured, setPrinterConfigured] = useState(false)
  const [bluetoothOn, setBluetoothOn] = useState(true)
  const [factorySettings, setFactorySettings] = useState<any>(null)
  const [clerkName, setClerkName] = useState('')
  const [activeSeasonName, setActiveSeasonName] = useState('')
  const [loadingSettings, setLoadingSettings] = useState(true)

  // Toast
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const toastOpacity = useRef(new Animated.Value(0)).current
  const toastTranslateY = useRef(new Animated.Value(-30)).current

  const showToast = (text: string, type: 'success' | 'error') => {
    setToast({ text, type })
    Animated.parallel([
      Animated.timing(toastOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.timing(toastTranslateY, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start()
    setTimeout(() => {
      Animated.parallel([
        Animated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.timing(toastTranslateY, { toValue: -30, duration: 300, useNativeDriver: true }),
      ]).start(() => setToast(null))
    }, 3000)
  }

  // Determines if printing is actually available
  const canPrint = printerConfigured && bluetoothOn

  // Enforce toggle off if cannot print
  useEffect(() => {
    if (!canPrint) {
      setPrintReceipt(false)
    }
  }, [canPrint])

  // ---- Load printer status, factory settings, clerk & season ----
  useEffect(() => {
    (async () => {
      try {
        // Printer config
        const raw = await AsyncStorage.getItem('selectedPrinter')
        if (raw) {
          const parsed = JSON.parse(raw)
          if (parsed.address) setPrinterConfigured(true)
        }

        // Factory settings from API
        const { data: factoryData } = await api.get('/factory/settings')
        setFactorySettings(factoryData)

        // Clerk name & active season from Supabase
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', user.id)
            .single()
          if (profile) setClerkName(profile.full_name || '')

          const { data: factoryProfile } = await supabase
            .from('profiles')
            .select('factory_id')
            .eq('id', user.id)
            .single()
          if (factoryProfile?.factory_id) {
            const { data: season } = await supabase
              .from('seasons')
              .select('name')
              .eq('factory_id', factoryProfile.factory_id)
              .eq('is_active', true)
              .maybeSingle()
            if (season) setActiveSeasonName(season.name)
          }
        }
      } catch (e) {
        // silent
      } finally {
        setLoadingSettings(false)
      }

      // Check Bluetooth state via BLE manager
      let BleModule: any = null
      try { BleModule = require('react-native-ble-plx') } catch (_) {}
      if (BleModule) {
        const manager = new BleModule.BleManager()
        manager.state().then((state: string) => {
          setBluetoothOn(state === 'PoweredOn')
        }).catch(() => {})
      }
    })()
  }, [])

  // ---- Cumulative helpers ----
  const fetchCumulative = async (memberId: string, coffeeType: string) => {
    try {
      const { data: cumData } = await api.get(
        `/cumulatives/member?member_id=${memberId}&type=${coffeeType}`
      )
      setCumulative(cumData)
      return cumData
    } catch (e: any) {
      showToast(e.response?.data?.error || 'Failed to load totals', 'error')
      return null
    }
  }

  useEffect(() => {
    if (member) fetchCumulative(member.id, type)
  }, [type])

  const searchMember = async () => {
    if (!regNo.trim()) { showToast('Enter a registration number', 'error'); return }
    setSearching(true)
    try {
      const { data } = await api.get(`/members/search?reg_no=${regNo}`)
      if (data.member) {
        setMember(data.member)
        await fetchCumulative(data.member.id, type)
      } else {
        showToast('Member not found', 'error')
        setMember(null)
        setCumulative({ delivered: 0, bought: 0, sold: 0, net: 0 })
      }
    } catch (e: any) {
      showToast(e.response?.data?.error || 'Search failed', 'error')
    } finally {
      setSearching(false)
    }
  }

  // ---- Save delivery & optionally print ----
  const saveDelivery = async () => {
    if (!member || !weight || parseFloat(weight) <= 0) {
      showToast('Enter a valid weight', 'error')
      return
    }
    setLoading(true)
    try {
      const { data: deliveryData } = await api.post('/deliveries', {
        type,
        memberId: member.id,
        kgs: parseFloat(weight),
      })

      showToast(`Delivery recorded for ${member.name}`, 'success')
      setWeight('')

      // Await fresh cumulative after delivery
      const updatedCumulative = await fetchCumulative(member.id, type)

      // Print receipt if toggled, printer configured, and fresh data available
      if (printReceipt && printerConfigured && updatedCumulative) {
        try {
          const printerRaw = await AsyncStorage.getItem('selectedPrinter')
          const printer = printerRaw ? JSON.parse(printerRaw) : {}
          const pwStr = await AsyncStorage.getItem('paperWidth')
          const paperWidth = (pwStr === '80' ? 80 : 58) as 58 | 80
          const now = new Date()

          await printDeliveryReceipt(
            member.name,
            member.reg_no,
            parseFloat(weight),
            type,
            now.toLocaleDateString(),
            now.toLocaleTimeString(),
            {
              printerAddress: printer.address,
              paperWidth,
              receiptSettings: factorySettings?.settings?.receipt,
              factoryInfo: factorySettings?.settings?.factoryInfo,
              factoryName: factorySettings?.name,
              season: activeSeasonName,
              clerk: clerkName,
              receiptNo: deliveryData?.delivery?.id || deliveryData?.id,
              netTotal: updatedCumulative.net,
            }
          )
        } catch (printErr) {
          showToast('Print failed, but delivery saved', 'error')
        }
      }
    } catch (e: any) {
      showToast(e.response?.data?.error || 'Failed', 'error')
    } finally {
      setLoading(false)
    }
  }

  // Handle toggling the print switch
  const handleTogglePrint = (value: boolean) => {
    if (value && !canPrint) {
      // Bluetooth off or printer not configured – show alert
      Alert.alert(
        'Printer Not Ready',
        !bluetoothOn
          ? 'Bluetooth is off. Please turn it on and configure your printer in settings.'
          : 'No printer has been configured. Please go to Account settings to set up your printer.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Go to Settings', onPress: () => navigation.navigate('Account') },
        ]
      )
      return
    }
    setPrintReceipt(value)
  }

  // ---- Render ----
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Toast */}
      {toast && (
        <Animated.View
          style={[
            styles.toastOverlay,
            toast.type === 'success' ? styles.toastSuccess : styles.toastError,
            { opacity: toastOpacity, transform: [{ translateY: toastTranslateY }] },
          ]}
          pointerEvents="none"
        >
          <Ionicons
            name={toast.type === 'success' ? 'checkmark-circle' : 'alert-circle'}
            size={20}
            color={toast.type === 'success' ? '#2e7d32' : '#c62828'}
          />
          <Text style={styles.toastText}>{toast.text}</Text>
        </Animated.View>
      )}

      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Print receipt toggle */}
        <View style={styles.printerCard}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleLabelGroup}>
              <Ionicons
                name="print-outline"
                size={22}
                color={printReceipt ? '#2e7d32' : '#6b5e53'}
              />
              <Text style={styles.toggleLabel}>Print receipt</Text>
            </View>
            <Switch
              value={printReceipt}
              onValueChange={handleTogglePrint}
              trackColor={{ false: '#d9d0c7', true: '#8c6239' }}
              thumbColor={printReceipt ? '#3d2b1f' : '#f4f3f4'}
              disabled={!canPrint}
            />
          </View>
          {!canPrint && (
            <Text style={styles.printerHint}>
              {!bluetoothOn
                ? 'Bluetooth is off – enable it and configure your printer'
                : 'No printer configured – go to Account settings'}
            </Text>
          )}
        </View>

        {/* Coffee type toggle */}
        <Text style={styles.label}>Coffee Type</Text>
        <View style={styles.typeToggle}>
          <TouchableOpacity
            onPress={() => setType('cherry')}
            style={[styles.toggleBtn, type === 'cherry' && styles.activeToggle]}
          >
            <Ionicons name="leaf" size={18} color={type === 'cherry' ? '#fff' : '#8c6239'} />
            <Text style={[styles.toggleText, type === 'cherry' && styles.activeToggleText]}>Cherry</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setType('mbuni')}
            style={[styles.toggleBtn, type === 'mbuni' && styles.activeToggle]}
          >
            <Ionicons name="leaf" size={18} color={type === 'mbuni' ? '#fff' : '#8c6239'} />
            <Text style={[styles.toggleText, type === 'mbuni' && styles.activeToggleText]}>Mbuni</Text>
          </TouchableOpacity>
        </View>

        {/* Member search */}
        <Text style={styles.label}>Member Registration Number</Text>
        <View style={styles.searchRow}>
          <TextInput
            placeholder="e.g. 1"
            placeholderTextColor="#9e8e7e"
            value={regNo}
            onChangeText={setRegNo}
            style={styles.searchInput}
            keyboardType="numeric"
            onSubmitEditing={searchMember}
          />
          <TouchableOpacity onPress={searchMember} style={styles.searchBtn} disabled={searching}>
            {searching ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="search" size={20} color="#fff" />
            )}
          </TouchableOpacity>
        </View>

        {/* Member card */}
        {member && (
          <View style={styles.memberCard}>
            <View style={styles.memberHeader}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{member.name.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.memberInfo}>
                <Text style={styles.memberName}>{member.name}</Text>
                <Text style={styles.memberReg}>Reg No: {member.reg_no}</Text>
              </View>
            </View>
            <View style={styles.cumulativeGrid}>
              <View style={styles.cumItem}>
                <Text style={styles.cumLabel}>Delivered</Text>
                <Text style={styles.cumValue}>{cumulative.delivered.toFixed(2)} kg</Text>
              </View>
              <View style={styles.cumItem}>
                <Text style={styles.cumLabel}>Bought</Text>
                <Text style={styles.cumValue}>{cumulative.bought.toFixed(2)} kg</Text>
              </View>
              <View style={styles.cumItem}>
                <Text style={styles.cumLabel}>Sold</Text>
                <Text style={styles.cumValue}>{cumulative.sold.toFixed(2)} kg</Text>
              </View>
              <View style={[styles.cumItem, styles.netItem]}>
                <Text style={styles.cumLabel}>Net</Text>
                <Text style={[styles.cumValue, styles.netValue]}>{cumulative.net.toFixed(2)} kg</Text>
              </View>
            </View>
          </View>
        )}

        {/* Weight input */}
        <Text style={styles.label}>Weight (kg)</Text>
        <TextInput
          placeholder="0.00"
          placeholderTextColor="#9e8e7e"
          value={weight}
          onChangeText={setWeight}
          keyboardType="numeric"
          style={styles.weightInput}
          editable={!!member}
        />

        {/* Save button */}
        <TouchableOpacity
          onPress={saveDelivery}
          disabled={loading || !member}
          style={[styles.saveBtn, (loading || !member) && styles.saveBtnDisabled]}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.saveBtnText}>Save Delivery</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

// ==================== Styles ====================
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#faf9f6' },
  scrollContent: { padding: 20 },

  // Printer toggle card
  printerCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#e0d9d0',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  toggleLabelGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  toggleLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3d2b1f',
    marginLeft: 10,
  },
  printerHint: {
    fontSize: 13,
    color: '#ef4444',
    marginTop: 8,
    fontStyle: 'italic',
  },

  // Toast
  toastOverlay: {
    position: 'absolute',
    top: 20,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    zIndex: 999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 8,
  },
  toastSuccess: { backgroundColor: '#e8f5e9' },
  toastError: { backgroundColor: '#ffebee' },
  toastText: { marginLeft: 10, fontSize: 15, fontWeight: '600', color: '#1a1512' },

  label: { fontSize: 14, fontWeight: '600', color: '#6b5e53', marginBottom: 8 },
  typeToggle: { flexDirection: 'row', marginBottom: 20 },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#d9d0c7',
    backgroundColor: '#fff',
    marginHorizontal: 4,
  },
  activeToggle: { backgroundColor: '#3d2b1f', borderColor: '#3d2b1f' },
  toggleText: { fontSize: 15, fontWeight: '600', color: '#3d2b1f', marginLeft: 6 },
  activeToggleText: { color: '#fff' },

  searchRow: { flexDirection: 'row', marginBottom: 20 },
  searchInput: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d9d0c7',
    color: '#1a1512',
  },
  searchBtn: {
    width: 50,
    backgroundColor: '#3d2b1f',
    borderRadius: 12,
    marginLeft: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },

  memberCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#e0d9d0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  memberHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#8c6239',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { color: '#fff', fontSize: 22, fontWeight: '700' },
  memberInfo: { marginLeft: 12 },
  memberName: { fontSize: 18, fontWeight: '700', color: '#3d2b1f' },
  memberReg: { fontSize: 13, color: '#6b5e53', marginTop: 2 },

  cumulativeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cumItem: {
    flex: 1,
    minWidth: '22%',
    backgroundColor: '#f0ece6',
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
  },
  cumLabel: { fontSize: 11, fontWeight: '600', color: '#6b5e53', textTransform: 'uppercase', marginBottom: 4 },
  cumValue: { fontSize: 14, fontWeight: '700', color: '#3d2b1f' },
  netItem: { backgroundColor: '#e8f5e9' },
  netValue: { color: '#2e7d32' },

  weightInput: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 18,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d9d0c7',
    color: '#1a1512',
    marginBottom: 24,
  },
  saveBtn: {
    backgroundColor: '#3d2b1f',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
})