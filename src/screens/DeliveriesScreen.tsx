import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  View, Text, TextInput, FlatList, StyleSheet,
  ActivityIndicator, TouchableOpacity, RefreshControl, Alert, Modal,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import api from '../api/client'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { printDeliveryReceipt } from '../services/printService'

interface Delivery {
  id: number
  coffee_type: string
  kgs_delivered: number
  delivery_date: string
  delivery_time: string
  members: { name: string; reg_no: string } | null
  profiles: { full_name: string } | null
}

export default function DeliveriesScreen() {
  const navigation = useNavigation<any>()

  const [allDeliveries, setAllDeliveries] = useState<Delivery[]>([])
  const [search, setSearch] = useState('')
  const [type, setType] = useState<'cherry' | 'mbuni'>('cherry')
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  // Action menu
  const [selectedItem, setSelectedItem] = useState<Delivery | null>(null)
  const [menuVisible, setMenuVisible] = useState(false)

  // Printer / factory settings
  const [printerAddress, setPrinterAddress] = useState<string>('')
  const [paperWidth, setPaperWidth] = useState<58 | 80>(58)
  const [factorySettings, setFactorySettings] = useState<any>(null)

  useEffect(() => { loadSettings() }, [])

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

  const fetchDeliveries = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true)
    setError('')
    try {
      const { data } = await api.get('/deliveries', {
        params: { type, sortKey: 'delivery_date', sortDir: 'desc' },
      })
      setAllDeliveries(data.deliveries || [])
    } catch (e: any) {
      const message = e.response?.data?.error || e.message || 'Failed to load deliveries'
      setError(message)
      console.error('Deliveries fetch error:', e)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [type])

  useEffect(() => { fetchDeliveries() }, [fetchDeliveries])

  const onRefresh = () => { setRefreshing(true); fetchDeliveries(true) }

  const deliveries = useMemo(() => {
    let result = [...allDeliveries]
    if (search.trim()) {
      const s = search.toLowerCase()
      result = result.filter(d =>
        d.members?.name?.toLowerCase().includes(s) ||
        d.profiles?.full_name?.toLowerCase().includes(s)
      )
    }
    result.sort((a, b) => {
      const dateTimeA = `${a.delivery_date} ${a.delivery_time}`
      const dateTimeB = `${b.delivery_date} ${b.delivery_time}`
      return dateTimeB.localeCompare(dateTimeA)
    })
    return result
  }, [allDeliveries, search])

  // ---- Action handlers ----
  const confirmDelete = () => {
    if (!selectedItem) return
    Alert.alert(
      'Delete Delivery',
      `Are you sure you want to delete delivery #${selectedItem.id}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteDelivery(selectedItem) },
      ]
    )
    setMenuVisible(false)
  }

  const deleteDelivery = async (item: Delivery) => {
    // Safety check
    if (!item.id) {
      Alert.alert('Error', 'Invalid delivery ID')
      return
    }
    const coffeeType = item.coffee_type || type
    const url = `/deliveries/${item.id}?type=${coffeeType}`
    console.log('Deleting delivery:', url)

    try {
      await api.delete(url)
      fetchDeliveries()
    } catch (e: any) {
      console.error('Delete error:', e.response?.data || e.message)
      Alert.alert('Error', e.response?.data?.error || 'Could not delete')
    }
  }

  const reprintReceipt = async () => {
    if (!selectedItem || !printerAddress) {
      Alert.alert('No Printer', 'Configure a printer in Account settings.')
      setMenuVisible(false)
      return
    }
    const item = selectedItem
    const memberName = item.members?.name || 'Unknown'
    const regNo = item.members?.reg_no || ''
    const clerkName = item.profiles?.full_name || ''
    const coffeeType = (item.coffee_type || type) as 'cherry' | 'mbuni'

    try {
      await printDeliveryReceipt(
        memberName, regNo, item.kgs_delivered, coffeeType,
        item.delivery_date, item.delivery_time,
        {
          printerAddress, paperWidth,
          receiptSettings: factorySettings?.settings?.receipt,
          factoryInfo: factorySettings?.settings?.factoryInfo,
          factoryName: factorySettings?.name,
          clerk: clerkName, receiptNo: item.id,
        }
      )
    } catch (e: any) {
      Alert.alert('Print Error', e.message)
    }
    setMenuVisible(false)
  }

  const renderItem = ({ item }: { item: Delivery }) => (
    <TouchableOpacity
      style={styles.card}
      onLongPress={() => { setSelectedItem(item); setMenuVisible(true) }}
      activeOpacity={0.9}
    >
      <View style={styles.cardHeader}>
        <View style={styles.memberRow}>
          <Ionicons name="person-circle-outline" size={22} color="#8c6239" />
          <Text style={styles.memberName}>{item.members?.name || 'Unknown'}</Text>
        </View>
        <View style={[styles.typeBadge, item.coffee_type === 'mbuni' ? styles.mbuniBadge : styles.cherryBadge]}>
          <Text style={styles.typeBadgeText}>{item.coffee_type || type}</Text>
        </View>
      </View>
      <View style={styles.cardBody}>
        <View style={styles.statItem}>
          <Ionicons name="scale-outline" size={16} color="#6b5e53" />
          <Text style={styles.kgsText}>{item.kgs_delivered.toFixed(2)} kg</Text>
        </View>
        <View style={styles.statItem}>
          <Ionicons name="calendar-outline" size={16} color="#6b5e53" />
          <Text style={styles.dateText}>{new Date(item.delivery_date).toLocaleDateString()}</Text>
        </View>
      </View>
      <View style={styles.cardFooter}>
        <Ionicons name="time-outline" size={14} color="#6b5e53" />
        <Text style={styles.timeText}>{item.delivery_time}</Text>
        {item.profiles?.full_name && (
          <>
            <Text style={styles.dot}>·</Text>
            <Ionicons name="person-outline" size={14} color="#6b5e53" />
            <Text style={styles.clerkText}>{item.profiles.full_name}</Text>
          </>
        )}
      </View>
    </TouchableOpacity>
  )

  return (
    <View style={styles.container}>
      {/* Search bar */}
      <View style={styles.searchRow}>
        <View style={styles.searchInputWrapper}>
          <Ionicons name="search" size={18} color="#8c6239" style={styles.searchIcon} />
          <TextInput
            placeholder="Search member or clerk..."
            placeholderTextColor="#9e8e7e"
            value={search}
            onChangeText={setSearch}
            style={styles.searchInput}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color="#9e8e7e" style={styles.clearIcon} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Type toggle */}
      <View style={styles.typeToggle}>
        <TouchableOpacity onPress={() => setType('cherry')} style={[styles.toggleBtn, type === 'cherry' && styles.activeToggle]}>
          <Ionicons name="leaf" size={16} color={type === 'cherry' ? '#fff' : '#8c6239'} />
          <Text style={[styles.toggleText, type === 'cherry' && styles.activeToggleText]}>Cherry</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setType('mbuni')} style={[styles.toggleBtn, type === 'mbuni' && styles.activeToggle]}>
          <Ionicons name="leaf" size={16} color={type === 'mbuni' ? '#fff' : '#8c6239'} />
          <Text style={[styles.toggleText, type === 'mbuni' && styles.activeToggleText]}>Mbuni</Text>
        </TouchableOpacity>
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={18} color="#c62828" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => fetchDeliveries()}><Text style={styles.retryText}>Retry</Text></TouchableOpacity>
        </View>
      ) : null}

      {loading && !refreshing ? (
        <ActivityIndicator size="large" color="#8c6239" style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={deliveries}
          keyExtractor={(item) => item.id.toString()}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#8c6239']} tintColor="#8c6239" />}
          contentContainerStyle={{ paddingBottom: 80 }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="leaf-outline" size={48} color="#d9d0c7" />
              <Text style={styles.emptyText}>No deliveries found</Text>
              <Text style={styles.emptySubtext}>Try changing filters or adding a new delivery</Text>
            </View>
          }
        />
      )}

      <TouchableOpacity style={styles.fab} activeOpacity={0.85} onPress={() => navigation.navigate('RecordDelivery')}>
        <Ionicons name="add" size={28} color="#faf9f6" />
      </TouchableOpacity>

      {/* Action Menu Modal */}
      <Modal visible={menuVisible} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setMenuVisible(false)}>
          <View style={styles.actionMenu}>
            <Text style={styles.menuTitle}>Actions</Text>
            <TouchableOpacity style={styles.menuItem} onPress={reprintReceipt}>
              <Ionicons name="print-outline" size={22} color="#3d2b1f" />
              <Text style={styles.menuItemText}>Reprint Receipt</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={confirmDelete}>
              <Ionicons name="trash-outline" size={22} color="#c62828" />
              <Text style={[styles.menuItemText, { color: '#c62828' }]}>Delete</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuCancel} onPress={() => setMenuVisible(false)}>
              <Text style={styles.menuCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  )
}

// ==================== Styles (identical to your last version) ====================
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#faf9f6', paddingHorizontal: 16, paddingTop: 8 },
  searchRow: { marginBottom: 12 },
  searchInputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#d9d0c7', paddingHorizontal: 12 },
  searchIcon: { marginRight: 6 },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 15, color: '#1a1512' },
  clearIcon: { marginLeft: 4 },
  typeToggle: { flexDirection: 'row', marginBottom: 12 },
  toggleBtn: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#d9d0c7', backgroundColor: '#fff', marginHorizontal: 4 },
  activeToggle: { backgroundColor: '#3d2b1f', borderColor: '#3d2b1f' },
  toggleText: { fontSize: 15, fontWeight: '600', color: '#3d2b1f', marginLeft: 6 },
  activeToggleText: { color: '#fff' },
  errorBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffebee', borderRadius: 10, padding: 10, marginBottom: 12 },
  errorText: { flex: 1, color: '#c62828', fontSize: 13, marginLeft: 6 },
  retryText: { color: '#8c6239', fontWeight: '700', fontSize: 14, marginLeft: 8 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 10, borderWidth: 1, borderColor: '#e0d9d0', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  memberRow: { flexDirection: 'row', alignItems: 'center' },
  memberName: { fontSize: 16, fontWeight: '700', color: '#3d2b1f', marginLeft: 6 },
  typeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  cherryBadge: { backgroundColor: '#e8f5e9' },
  mbuniBadge: { backgroundColor: '#fff3e0' },
  typeBadgeText: { fontSize: 12, fontWeight: '700', color: '#2e7d32' },
  cardBody: { flexDirection: 'row', marginBottom: 8 },
  statItem: { flexDirection: 'row', alignItems: 'center', marginRight: 20 },
  kgsText: { fontSize: 15, fontWeight: '600', color: '#8c6239', marginLeft: 4 },
  dateText: { fontSize: 14, color: '#6b5e53', marginLeft: 4 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#f0ece6', paddingTop: 8 },
  timeText: { fontSize: 12, color: '#6b5e53', marginLeft: 4 },
  dot: { color: '#9e8e7e', marginHorizontal: 6, fontSize: 14 },
  clerkText: { fontSize: 12, color: '#6b5e53', marginLeft: 4, fontStyle: 'italic' },
  emptyContainer: { alignItems: 'center', marginTop: 60 },
  emptyText: { fontSize: 18, fontWeight: '600', color: '#6b5e53', marginTop: 12 },
  emptySubtext: { fontSize: 14, color: '#9e8e7e', marginTop: 4 },
  fab: { position: 'absolute', right: 20, bottom: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: '#3d2b1f', justifyContent: 'center', alignItems: 'center', elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 5 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  actionMenu: { backgroundColor: '#fff', borderRadius: 16, padding: 20, width: '80%', maxWidth: 300 },
  menuTitle: { fontSize: 18, fontWeight: '700', color: '#3d2b1f', marginBottom: 16, textAlign: 'center' },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0ece6' },
  menuItemText: { fontSize: 16, marginLeft: 12, color: '#1a1512' },
  menuCancel: { marginTop: 12, alignItems: 'center' },
  menuCancelText: { fontSize: 16, fontWeight: '600', color: '#6b5e53' },
})