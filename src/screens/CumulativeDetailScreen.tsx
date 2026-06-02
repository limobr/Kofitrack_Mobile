import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator, ScrollView,
  TouchableOpacity, Modal, TextInput, Alert, KeyboardAvoidingView, Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRoute, useNavigation } from '@react-navigation/native'
import api from '../api/client'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { printStatementReceipt } from '../services/printService'

interface BreakdownEntry {
  id: string | number
  type: 'delivery' | 'bought' | 'sold'
  coffee: 'cherry' | 'mbuni'
  kgs: number
  date: string
  time: string
  counterparty?: string
}

interface EntryWithRunningTotal extends BreakdownEntry {
  runningTotal: number
}

export default function CumulativeDetailScreen() {
  const route = useRoute<any>()
  const navigation = useNavigation<any>()
  const { memberId, memberName, memberReg } = route.params

  const [tab, setTab] = useState<'cherry' | 'mbuni'>('cherry')
  const [entries, setEntries] = useState<BreakdownEntry[]>([])
  const [cumulative, setCumulative] = useState({ delivered: 0, bought: 0, sold: 0, net: 0 })
  const [memberPhone, setMemberPhone] = useState('')
  const [activeSeason, setActiveSeason] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Printer / factory settings
  const [printerAddress, setPrinterAddress] = useState<string>('')
  const [paperWidth, setPaperWidth] = useState<58 | 80>(58)
  const [factorySettings, setFactorySettings] = useState<any>(null)

  // Date filter modal
  const [filterModalVisible, setFilterModalVisible] = useState(false)
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      const raw = await AsyncStorage.getItem('selectedPrinter')
      if (raw) {
        const { address } = JSON.parse(raw)
        if (address) setPrinterAddress(address)
      }
      const pw = await AsyncStorage.getItem('paperWidth')
      if (pw) setPaperWidth(Number(pw) as 58 | 80)
      const { data } = await api.get('/factory/settings')
      setFactorySettings(data)
    } catch (e) {}
  }

  const fetchBreakdown = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await api.get(`/cumulatives/detail?member_id=${memberId}&type=${tab}`)

      if (data.member) {
        setMemberPhone(data.member.phone || '')
      }
      setActiveSeason(data.activeSeason || '')
      setCumulative(data.totals || { delivered: 0, bought: 0, sold: 0, net: 0 })

      const items: BreakdownEntry[] = (data.entries || []).map((e: any) => ({
        id: e.id,
        type: e.type,
        coffee: tab,
        kgs: e.kgs,
        date: e.date,
        time: e.time || '00:00:00',  // ensure time is present
        counterparty: e.counterparty,
      }))

      // Strict chronological sort (date + time ascending)
      items.sort((a, b) => {
        const dateTimeA = `${a.date} ${a.time}`
        const dateTimeB = `${b.date} ${b.time}`
        return dateTimeA.localeCompare(dateTimeB)
      })
      setEntries(items)
    } catch (e: any) {
      setError(e.response?.data?.error || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [memberId, tab])

  useEffect(() => {
    fetchBreakdown()
  }, [fetchBreakdown])

  // Compute running total – always start from 0, add deliveries/bought, subtract sold
  const entriesWithRunningTotal = useMemo(() => {
    let running = 0
    return entries.map((entry) => {
      if (entry.type === 'delivery' || entry.type === 'bought') {
        running += entry.kgs
      } else if (entry.type === 'sold') {
        running -= entry.kgs
      }
      return { ...entry, runningTotal: running }
    })
  }, [entries])

  // Date filter logic
  const filteredEntries = useMemo(() => {
    if (!startDate || !endDate) return entriesWithRunningTotal
    return entriesWithRunningTotal.filter((e) => e.date >= startDate && e.date <= endDate)
  }, [entriesWithRunningTotal, startDate, endDate])

  // Compute totals for filtered period
  const periodTotals = useMemo(() => {
    const subset = filteredEntries
    let delivered = 0, bought = 0, sold = 0
    for (const e of subset) {
      if (e.type === 'delivery') delivered += e.kgs
      else if (e.type === 'bought') bought += e.kgs
      else if (e.type === 'sold') sold += e.kgs
    }
    const net = delivered + bought - sold
    return { delivered, bought, sold, net }
  }, [filteredEntries])

  const handlePrint = async (applyFilter: boolean) => {
    if (!printerAddress) {
      Alert.alert('No Printer', 'Configure a printer in Account settings.')
      return
    }

    const isFiltered = applyFilter && startDate && endDate
    const entriesToPrint = isFiltered ? filteredEntries : entriesWithRunningTotal
    const totals = isFiltered ? periodTotals : cumulative

    try {
      await printStatementReceipt(
        memberName,
        memberReg,
        memberPhone,
        tab,
        activeSeason,
        entriesToPrint.map(e => ({
          date: e.date,
          time: e.time,             // include time
          type: e.type,
          kgs: e.kgs,
          runningTotal: e.runningTotal,
        })),
        totals,
        isFiltered ? startDate : undefined,
        isFiltered ? endDate : undefined,
        {
          printerAddress,
          paperWidth,
          receiptSettings: factorySettings?.settings?.receipt,
          factoryInfo: factorySettings?.settings?.factoryInfo,
          factoryName: factorySettings?.name,
          clerk: factorySettings?.settings?.receipt?.clerk || '',
        }
      )
    } catch (e: any) {
      Alert.alert('Print Error', e.message)
    }
    setFilterModalVisible(false)
  }

  const renderItem = ({ item }: { item: EntryWithRunningTotal }) => (
    <View style={[styles.entryCard, { backgroundColor: item.type === 'delivery' ? '#e8f5e9' : item.type === 'bought' ? '#e3f2fd' : '#ffebee' }]}>
      <View style={styles.entryRow}>
        <Text style={styles.entryDate}>{item.date} {item.time?.slice(0,5)}</Text>
        <View style={styles.entryDetail}>
          <View style={[styles.typeBadge, { backgroundColor: item.type === 'delivery' ? '#c8e6c9' : item.type === 'bought' ? '#bbdefb' : '#ffcdd2' }]}>
            <Text style={[styles.typeBadgeText, { color: item.type === 'delivery' ? '#2e7d32' : item.type === 'bought' ? '#1565c0' : '#c62828' }]}>
              {item.type === 'delivery' ? 'Delivery' : item.type === 'bought' ? 'Bought' : 'Sold'}
            </Text>
          </View>
          <Text style={styles.entryKgs}>{item.kgs.toFixed(2)} kg</Text>
        </View>
        <Text style={styles.runningTotal}>{item.runningTotal.toFixed(2)}</Text>
      </View>
    </View>
  )

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 80 }}>
        <Text style={styles.memberName}>{memberName}</Text>
        <Text style={styles.memberReg}>Reg No: {memberReg}</Text>

        <View style={styles.tabRow}>
          <TouchableOpacity onPress={() => setTab('cherry')} style={[styles.tabBtn, tab === 'cherry' && styles.activeTab]}>
            <Ionicons name="leaf" size={16} color={tab === 'cherry' ? '#fff' : '#8c6239'} />
            <Text style={[styles.tabText, tab === 'cherry' && styles.activeTabText]}>Cherry</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setTab('mbuni')} style={[styles.tabBtn, tab === 'mbuni' && styles.activeTab]}>
            <Ionicons name="leaf" size={16} color={tab === 'mbuni' ? '#fff' : '#8c6239'} />
            <Text style={[styles.tabText, tab === 'mbuni' && styles.activeTabText]}>Mbuni</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.summaryGrid}>
          <View style={styles.summaryItem}><Text style={styles.summaryLabel}>Delivered</Text><Text style={styles.summaryValue}>{cumulative.delivered.toFixed(2)} kg</Text></View>
          <View style={[styles.summaryItem, { backgroundColor: '#e3f2fd' }]}><Text style={styles.summaryLabel}>Bought</Text><Text style={styles.summaryValue}>{cumulative.bought.toFixed(2)} kg</Text></View>
          <View style={[styles.summaryItem, { backgroundColor: '#ffebee' }]}><Text style={styles.summaryLabel}>Sold</Text><Text style={styles.summaryValue}>{cumulative.sold.toFixed(2)} kg</Text></View>
          <View style={[styles.summaryItem, { backgroundColor: '#e8f5e9' }]}><Text style={styles.summaryLabel}>Net</Text><Text style={[styles.summaryValue, { color: '#2e7d32' }]}>{cumulative.net.toFixed(2)} kg</Text></View>
        </View>

        {/* Table header */}
        <View style={styles.tableHeader}>
          <Text style={styles.tableHeaderText}>Date</Text>
          <Text style={styles.tableHeaderText}>Detail</Text>
          <Text style={styles.tableHeaderText}>Total</Text>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color="#8c6239" />
        ) : filteredEntries.length === 0 ? (
          <Text style={styles.emptyText}>No activity for {tab}</Text>
        ) : (
          filteredEntries.map((entry, idx) => (
            <View key={idx} style={[styles.entryCard, { backgroundColor: entry.type === 'delivery' ? '#e8f5e9' : entry.type === 'bought' ? '#e3f2fd' : '#ffebee' }]}>
              <View style={styles.entryRow}>
                <Text style={styles.entryDate}>{entry.date} {entry.time?.slice(0,5)}</Text>
                <View style={styles.entryDetail}>
                  <View style={[styles.typeBadge, { backgroundColor: entry.type === 'delivery' ? '#c8e6c9' : entry.type === 'bought' ? '#bbdefb' : '#ffcdd2' }]}>
                    <Text style={[styles.typeBadgeText, { color: entry.type === 'delivery' ? '#2e7d32' : entry.type === 'bought' ? '#1565c0' : '#c62828' }]}>
                      {entry.type === 'delivery' ? 'Delivery' : entry.type === 'bought' ? 'Bought' : 'Sold'}
                    </Text>
                  </View>
                  <Text style={styles.entryKgs}>{entry.kgs.toFixed(2)} kg</Text>
                </View>
                <Text style={styles.runningTotal}>{entry.runningTotal.toFixed(2)}</Text>
              </View>
            </View>
          ))
        )}

        {/* Totals at bottom */}
        {!loading && filteredEntries.length > 0 && (
          <View style={styles.totalsContainer}>
            <Text style={styles.totalsTitle}>
              {startDate && endDate ? 'PERIOD SUMMARY' : 'SEASON SUMMARY'}
            </Text>
            <Text style={styles.totalLine}>Delivered: {(startDate && endDate ? periodTotals.delivered : cumulative.delivered).toFixed(2)} kg</Text>
            <Text style={styles.totalLine}>Bought: {(startDate && endDate ? periodTotals.bought : cumulative.bought).toFixed(2)} kg</Text>
            <Text style={styles.totalLine}>Sold: {(startDate && endDate ? periodTotals.sold : cumulative.sold).toFixed(2)} kg</Text>
            <Text style={[styles.totalLine, styles.netTotal]}>Net: {(startDate && endDate ? periodTotals.net : cumulative.net).toFixed(2)} kg</Text>
          </View>
        )}
      </ScrollView>

      {/* Floating Print Button */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setFilterModalVisible(true)}
      >
        <Ionicons name="print" size={28} color="#faf9f6" />
      </TouchableOpacity>

      {/* Filter Modal */}
      <Modal visible={filterModalVisible} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setFilterModalVisible(false)}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Print Statement</Text>
            <Text style={styles.modalSubtitle}>Optionally filter by date range</Text>

            <TextInput
              style={styles.dateInput}
              placeholder="Start date (YYYY-MM-DD)"
              placeholderTextColor="#9e8e7e"
              value={startDate}
              onChangeText={setStartDate}
            />
            <TextInput
              style={styles.dateInput}
              placeholder="End date (YYYY-MM-DD)"
              placeholderTextColor="#9e8e7e"
              value={endDate}
              onChangeText={setEndDate}
            />

            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => handlePrint(true)}
            >
              <Ionicons name="print-outline" size={18} color="#fff" />
              <Text style={styles.modalButtonText}>Apply Filter & Print</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modalButton, { backgroundColor: '#8c6239' }]}
              onPress={() => handlePrint(false)}
            >
              <Ionicons name="print-outline" size={18} color="#fff" />
              <Text style={styles.modalButtonText}>Print Full Season</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setFilterModalVisible(false)}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#faf9f6' },
  scroll: { flex: 1, padding: 20 },
  memberName: { fontSize: 22, fontWeight: '700', color: '#3d2b1f', marginBottom: 4 },
  memberReg: { fontSize: 14, color: '#6b5e53', marginBottom: 16 },
  tabRow: { flexDirection: 'row', marginBottom: 16 },
  tabBtn: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#d9d0c7', backgroundColor: '#fff', marginHorizontal: 4 },
  activeTab: { backgroundColor: '#3d2b1f', borderColor: '#3d2b1f' },
  tabText: { fontSize: 15, fontWeight: '600', color: '#3d2b1f', marginLeft: 6 },
  activeTabText: { color: '#fff' },
  summaryGrid: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  summaryItem: { flex: 1, backgroundColor: '#f0ece6', borderRadius: 10, padding: 10, alignItems: 'center' },
  summaryLabel: { fontSize: 10, fontWeight: '600', color: '#6b5e53', textTransform: 'uppercase', marginBottom: 4 },
  summaryValue: { fontSize: 14, fontWeight: '700', color: '#3d2b1f' },
  tableHeader: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 8, marginBottom: 8 },
  tableHeaderText: { fontSize: 12, fontWeight: '700', color: '#6b5e53', flex: 1, textAlign: 'center' },
  entryCard: { borderRadius: 12, padding: 12, marginBottom: 8 },
  entryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  entryDate: { fontSize: 12, color: '#6b5e53', width: '30%' },
  entryDetail: { flexDirection: 'row', alignItems: 'center', width: '35%' },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  typeBadgeText: { fontSize: 11, fontWeight: '700' },
  entryKgs: { fontSize: 14, fontWeight: '600', color: '#3d2b1f', marginLeft: 8 },
  runningTotal: { fontSize: 14, fontWeight: '700', color: '#3d2b1f', width: '25%', textAlign: 'right' },
  emptyText: { textAlign: 'center', color: '#6b5e53', marginTop: 20 },
  totalsContainer: { marginTop: 20, padding: 16, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e0d9d0' },
  totalsTitle: { fontSize: 16, fontWeight: '700', color: '#3d2b1f', marginBottom: 8, textAlign: 'center' },
  totalLine: { fontSize: 14, color: '#3d2b1f', marginBottom: 4 },
  netTotal: { fontWeight: '700', color: '#2e7d32' },

  fab: {
    position: 'absolute', right: 20, bottom: 24, width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#3d2b1f', justifyContent: 'center', alignItems: 'center',
    elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25, shadowRadius: 5,
  },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { backgroundColor: '#fff', borderRadius: 16, padding: 24, width: '80%', maxWidth: 350 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#3d2b1f', marginBottom: 8, textAlign: 'center' },
  modalSubtitle: { fontSize: 13, color: '#6b5e53', marginBottom: 16, textAlign: 'center' },
  dateInput: { backgroundColor: '#faf9f6', borderWidth: 1, borderColor: '#d9d0c7', borderRadius: 10, padding: 12, fontSize: 14, marginBottom: 12, color: '#1a1512' },
  modalButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#3d2b1f', padding: 14, borderRadius: 12, marginBottom: 10, gap: 8 },
  modalButtonText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  cancelButton: { padding: 12, alignItems: 'center' },
  cancelButtonText: { color: '#6b5e53', fontWeight: '600', fontSize: 15 },
})