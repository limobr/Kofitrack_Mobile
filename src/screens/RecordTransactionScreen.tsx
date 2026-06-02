import React, { useState, useRef, useEffect } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, Switch, StyleSheet,
  ScrollView, ActivityIndicator, KeyboardAvoidingView, Platform, Animated, Alert,
  Keyboard,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import api from '../api/client'
import { supabase } from '../contexts/AuthContext'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { printTransactionReceipt } from '../services/printService'

export default function RecordTransactionScreen() {
  const navigation = useNavigation<any>()
  const scrollViewRef = useRef<ScrollView>(null)

  const [sellerReg, setSellerReg] = useState('')
  const [buyerReg, setBuyerReg] = useState('')
  const [seller, setSeller] = useState<any>(null)
  const [buyer, setBuyer] = useState<any>(null)
  const [cumulative, setCumulative] = useState({ delivered: 0, bought: 0, sold: 0, net: 0 })
  const [weight, setWeight] = useState('')
  const [type, setType] = useState<'cherry' | 'mbuni'>('cherry')
  const [loading, setLoading] = useState(false)
  const [searching, setSearching] = useState(false)
  const [searchingBuyer, setSearchingBuyer] = useState(false)

  // Print‑related
  const [printReceipt, setPrintReceipt] = useState(true)            // default on
  const [printerConfigured, setPrinterConfigured] = useState(false)
  const [bluetoothOn, setBluetoothOn] = useState(true)
  const [factorySettings, setFactorySettings] = useState<any>(null)
  const [clerkName, setClerkName] = useState('')
  const [activeSeasonName, setActiveSeasonName] = useState('')
  const [loadingSettings, setLoadingSettings] = useState(true)

  const canPrint = printerConfigured && bluetoothOn

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

  // Enforce toggle off if cannot print
  useEffect(() => {
    if (!canPrint) setPrintReceipt(false)
  }, [canPrint])

  // Load settings (including persisted print preference)
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem('selectedPrinter')
        if (raw) {
          const parsed = JSON.parse(raw)
          if (parsed.address) setPrinterConfigured(true)
        }

        const { data: factoryData } = await api.get('/factory/settings')
        setFactorySettings(factoryData)

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

        // Persisted print preference (default true)
        const savedPrint = await AsyncStorage.getItem('printReceiptEnabled')
        if (savedPrint !== null) {
          // only override if the user previously set it
          setPrintReceipt(savedPrint === 'true')
        }
      } catch (e) {} finally {
        setLoadingSettings(false)
      }

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

  // Persist print preference whenever it changes
  useEffect(() => {
    AsyncStorage.setItem('printReceiptEnabled', String(printReceipt))
  }, [printReceipt])

  const fetchSellerCumulative = async (sellerId: string, coffeeType: string) => {
    try {
      const { data: cumData } = await api.get(`/cumulatives/member?member_id=${sellerId}&type=${coffeeType}`)
      setCumulative(cumData)
      return cumData
    } catch (e: any) {
      showToast(e.response?.data?.error || 'Failed to load totals', 'error')
      return null
    }
  }

  useEffect(() => {
    if (seller) fetchSellerCumulative(seller.id, type)
  }, [type])

  // Auto‑scroll to bottom when weight input is focused
  const handleWeightFocus = () => {
    scrollViewRef.current?.scrollToEnd({ animated: true })
  }

  const searchSeller = async () => {
    if (!sellerReg.trim()) return showToast('Enter seller reg number', 'error')
    setSearching(true)
    try {
      const { data } = await api.get(`/members/search?reg_no=${sellerReg}`)
      if (data.member) {
        setSeller(data.member)
        fetchSellerCumulative(data.member.id, type)
      } else {
        showToast('Seller not found', 'error')
        setSeller(null)
      }
    } catch (e: any) {
      showToast(e.response?.data?.error || 'Search failed', 'error')
    } finally {
      setSearching(false)
    }
  }

  const searchBuyer = async () => {
    if (!buyerReg.trim()) return
    setSearchingBuyer(true)
    try {
      const { data } = await api.get(`/members/search?reg_no=${buyerReg}`)
      if (data.member) {
        setBuyer(data.member)
      } else {
        showToast('Buyer not found', 'error')
        setBuyer(null)
      }
    } catch (e: any) {
      showToast(e.response?.data?.error || 'Search failed', 'error')
    } finally {
      setSearchingBuyer(false)
    }
  }

  const handleTogglePrint = (value: boolean) => {
    if (value && !canPrint) {
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

  const saveTransaction = async () => {
    if (!seller || !buyer || !weight || parseFloat(weight) <= 0) {
      showToast('Fill all fields correctly', 'error')
      return
    }
    if (seller.id === buyer.id) {
      showToast('Seller and buyer cannot be the same', 'error')
      return
    }
    setLoading(true)
    try {
      const { data: txData } = await api.post('/transactions', {
        type,
        sellerId: seller.id,
        buyerId: buyer.id,
        kgs: parseFloat(weight),
      })

      showToast('Transaction recorded', 'success')
      setWeight('')

      const updatedCumulative = await fetchSellerCumulative(seller.id, type)

      if (printReceipt && printerConfigured && updatedCumulative) {
        try {
          const printerRaw = await AsyncStorage.getItem('selectedPrinter')
          const printer = printerRaw ? JSON.parse(printerRaw) : {}
          const pwStr = await AsyncStorage.getItem('paperWidth')
          const paperWidth = (pwStr === '80' ? 80 : 58) as 58 | 80
          const now = new Date()

          await printTransactionReceipt(
            seller.name,
            seller.reg_no,
            buyer.name,
            buyer.reg_no,
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
              receiptNo: txData?.transaction?.id || txData?.id,
              netTotal: updatedCumulative.net,
            }
          )
        } catch (printErr) {
          showToast('Print failed, but transaction saved', 'error')
        }
      }
    } catch (e: any) {
      showToast(e.response?.data?.error || 'Failed', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {toast && (
        <Animated.View style={[styles.toastOverlay, toast.type === 'success' ? styles.toastSuccess : styles.toastError, { opacity: toastOpacity, transform: [{ translateY: toastTranslateY }] }]} pointerEvents="none">
          <Ionicons name={toast.type === 'success' ? 'checkmark-circle' : 'alert-circle'} size={20} color={toast.type === 'success' ? '#2e7d32' : '#c62828'} />
          <Text style={styles.toastText}>{toast.text}</Text>
        </Animated.View>
      )}
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Print toggle */}
        <View style={styles.printerCard}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleLabelGroup}>
              <Ionicons name="print-outline" size={22} color={printReceipt ? '#2e7d32' : '#6b5e53'} />
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

        <Text style={styles.label}>Coffee Type</Text>
        <View style={styles.typeToggle}>
          <TouchableOpacity onPress={() => setType('cherry')} style={[styles.toggleBtn, type === 'cherry' && styles.activeToggle]}>
            <Ionicons name="leaf" size={18} color={type === 'cherry' ? '#fff' : '#8c6239'} />
            <Text style={[styles.toggleText, type === 'cherry' && styles.activeToggleText]}>Cherry</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setType('mbuni')} style={[styles.toggleBtn, type === 'mbuni' && styles.activeToggle]}>
            <Ionicons name="leaf" size={18} color={type === 'mbuni' ? '#fff' : '#8c6239'} />
            <Text style={[styles.toggleText, type === 'mbuni' && styles.activeToggleText]}>Mbuni</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>Seller Reg No</Text>
        <View style={styles.searchRow}>
          <TextInput placeholder="e.g. 1" placeholderTextColor="#9e8e7e" value={sellerReg} onChangeText={setSellerReg} style={styles.searchInput} keyboardType="numeric" onSubmitEditing={searchSeller} />
          <TouchableOpacity onPress={searchSeller} style={styles.searchBtn} disabled={searching}>
            {searching ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="search" size={20} color="#fff" />}
          </TouchableOpacity>
        </View>
        {seller && (
          <View style={styles.memberCard}>
            <View style={styles.memberHeader}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{seller.name.charAt(0).toUpperCase()}</Text></View>
              <View style={styles.memberInfo}>
                <Text style={styles.memberName}>{seller.name}</Text>
                <Text style={styles.memberReg}>Reg No: {seller.reg_no}</Text>
              </View>
            </View>
            <View style={styles.cumulativeGrid}>
              <View style={styles.cumItem}><Text style={styles.cumLabel}>Delivered</Text><Text style={styles.cumValue}>{cumulative.delivered.toFixed(2)} kg</Text></View>
              <View style={styles.cumItem}><Text style={styles.cumLabel}>Bought</Text><Text style={styles.cumValue}>{cumulative.bought.toFixed(2)} kg</Text></View>
              <View style={styles.cumItem}><Text style={styles.cumLabel}>Sold</Text><Text style={styles.cumValue}>{cumulative.sold.toFixed(2)} kg</Text></View>
              <View style={[styles.cumItem, styles.netItem]}><Text style={styles.cumLabel}>Net</Text><Text style={[styles.cumValue, styles.netValue]}>{cumulative.net.toFixed(2)} kg</Text></View>
            </View>
          </View>
        )}

        <Text style={styles.label}>Buyer Reg No</Text>
        <View style={styles.searchRow}>
          <TextInput placeholder="e.g. 2" placeholderTextColor="#9e8e7e" value={buyerReg} onChangeText={setBuyerReg} style={styles.searchInput} keyboardType="numeric" onSubmitEditing={searchBuyer} />
          <TouchableOpacity onPress={searchBuyer} style={styles.searchBtn} disabled={searchingBuyer}>
            {searchingBuyer ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="search" size={20} color="#fff" />}
          </TouchableOpacity>
        </View>
        {buyer && (
          <View style={styles.buyerInfo}>
            <Ionicons name="checkmark-circle" size={18} color="#2e7d32" />
            <Text style={styles.buyerText}>{buyer.name} (Reg {buyer.reg_no})</Text>
          </View>
        )}

        <Text style={styles.label}>Weight (kg)</Text>
        <TextInput
          placeholder="0.00"
          placeholderTextColor="#9e8e7e"
          value={weight}
          onChangeText={setWeight}
          keyboardType="numeric"
          style={styles.weightInput}
          editable={!!seller && !!buyer}
          onFocus={handleWeightFocus}
        />

        <TouchableOpacity onPress={saveTransaction} disabled={loading || !seller || !buyer} style={[styles.saveBtn, (loading || !seller || !buyer) && styles.saveBtnDisabled]}>
          {loading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveBtnText}>Save Transaction</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

// Styles unchanged (already included in your snippet)
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#faf9f6' },
  scrollContent: { padding: 20 },

  printerCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 20,
    borderWidth: 1, borderColor: '#e0d9d0',
  },
  toggleRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4,
  },
  toggleLabelGroup: { flexDirection: 'row', alignItems: 'center' },
  toggleLabel: { fontSize: 16, fontWeight: '600', color: '#3d2b1f', marginLeft: 10 },
  printerHint: { fontSize: 13, color: '#ef4444', marginTop: 8, fontStyle: 'italic' },

  toastOverlay: {
    position: 'absolute', top: 20, left: 20, right: 20, flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, paddingHorizontal: 16, borderRadius: 14, zIndex: 999,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12,
    shadowRadius: 8, elevation: 8,
  },
  toastSuccess: { backgroundColor: '#e8f5e9' },
  toastError: { backgroundColor: '#ffebee' },
  toastText: { marginLeft: 10, fontSize: 15, fontWeight: '600', color: '#1a1512' },

  label: { fontSize: 14, fontWeight: '600', color: '#6b5e53', marginBottom: 8 },
  typeToggle: { flexDirection: 'row', marginBottom: 20 },
  toggleBtn: {
    flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: '#d9d0c7',
    backgroundColor: '#fff', marginHorizontal: 4,
  },
  activeToggle: { backgroundColor: '#3d2b1f', borderColor: '#3d2b1f' },
  toggleText: { fontSize: 15, fontWeight: '600', color: '#3d2b1f', marginLeft: 6 },
  activeToggleText: { color: '#fff' },

  searchRow: { flexDirection: 'row', marginBottom: 20 },
  searchInput: {
    flex: 1, paddingVertical: 14, paddingHorizontal: 16, fontSize: 16,
    backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#d9d0c7',
    color: '#1a1512',
  },
  searchBtn: {
    width: 50, backgroundColor: '#3d2b1f', borderRadius: 12, marginLeft: 8,
    justifyContent: 'center', alignItems: 'center',
  },

  memberCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 18, marginBottom: 20,
    borderWidth: 1, borderColor: '#e0d9d0', shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  memberHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  avatar: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: '#8c6239',
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { color: '#fff', fontSize: 22, fontWeight: '700' },
  memberInfo: { marginLeft: 12 },
  memberName: { fontSize: 18, fontWeight: '700', color: '#3d2b1f' },
  memberReg: { fontSize: 13, color: '#6b5e53', marginTop: 2 },

  cumulativeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cumItem: {
    flex: 1, minWidth: '22%', backgroundColor: '#f0ece6', borderRadius: 10, padding: 10,
    alignItems: 'center',
  },
  cumLabel: { fontSize: 11, fontWeight: '600', color: '#6b5e53', textTransform: 'uppercase', marginBottom: 4 },
  cumValue: { fontSize: 14, fontWeight: '700', color: '#3d2b1f' },
  netItem: { backgroundColor: '#e8f5e9' },
  netValue: { color: '#2e7d32' },

  buyerInfo: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#e8f5e9',
    borderRadius: 12, padding: 12, marginBottom: 20,
  },
  buyerText: { marginLeft: 8, fontSize: 15, fontWeight: '600', color: '#2e7d32' },

  weightInput: {
    paddingVertical: 14, paddingHorizontal: 16, fontSize: 18, backgroundColor: '#fff',
    borderRadius: 12, borderWidth: 1, borderColor: '#d9d0c7', color: '#1a1512',
    marginBottom: 24,
  },
  saveBtn: {
    backgroundColor: '#3d2b1f', borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
})