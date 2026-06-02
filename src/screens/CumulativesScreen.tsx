import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  View, Text, TextInput, FlatList, StyleSheet,
  ActivityIndicator, TouchableOpacity, RefreshControl,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import api from '../api/client'

interface MemberRow {
  id: string
  reg_no: string
  name: string
  cherry: { delivered: number; bought: number; sold: number; net: number }
  mbuni: { delivered: number; bought: number; sold: number; net: number }
}

export default function CumulativesScreen() {
  const navigation = useNavigation<any>()
  const [rows, setRows] = useState<MemberRow[]>([])
  const [seasonName, setSeasonName] = useState('')
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<'cherry' | 'mbuni'>('cherry')
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')

  const fetchData = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true)
    setError('')
    try {
      const { data } = await api.get('/cumulatives')
      setRows(data.rows || [])
      setSeasonName(data.seasonName || '')
    } catch (e: any) {
      setError(e.response?.data?.error || e.message || 'Failed to load')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const onRefresh = () => { setRefreshing(true); fetchData(true) }

  const filtered = useMemo(() => {
    let result = rows
    if (search.trim()) {
      const s = search.toLowerCase()
      result = result.filter(r => r.name.toLowerCase().includes(s) || r.reg_no.toLowerCase().includes(s))
    }
    result.sort((a, b) => b[tab].net - a[tab].net)
    return result
  }, [rows, search, tab])

  const renderItem = ({ item }: { item: MemberRow }) => (
    <TouchableOpacity
      style={styles.card}
      onPress={() => navigation.navigate('CumulativeDetail', { memberId: item.id, memberName: item.name, memberReg: item.reg_no })}
    >
      <View style={styles.cardHeader}>
        <View style={styles.regBadge}><Text style={styles.regText}>{item.reg_no}</Text></View>
        <Text style={styles.memberName} numberOfLines={1}>{item.name}</Text>
        <Ionicons name="chevron-forward" size={18} color="#9e8e7e" />
      </View>
      <View style={styles.statsRow}>
        <View style={styles.statItem}><Text style={styles.statLabel}>Del</Text><Text style={styles.statValue}>{item[tab].delivered.toFixed(0)}</Text></View>
        <View style={styles.statItem}><Text style={styles.statLabel}>Bought</Text><Text style={styles.statValue}>{item[tab].bought.toFixed(0)}</Text></View>
        <View style={styles.statItem}><Text style={styles.statLabel}>Sold</Text><Text style={styles.statValue}>{item[tab].sold.toFixed(0)}</Text></View>
        <View style={[styles.statItem, styles.netItem]}><Text style={styles.statLabel}>Net</Text><Text style={[styles.statValue, styles.netValue]}>{item[tab].net.toFixed(0)}</Text></View>
      </View>
    </TouchableOpacity>
  )

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <View style={styles.searchInputWrapper}>
          <Ionicons name="search" size={18} color="#8c6239" style={styles.searchIcon} />
          <TextInput placeholder="Search member..." placeholderTextColor="#9e8e7e" value={search} onChangeText={setSearch} style={styles.searchInput} />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color="#9e8e7e" />
            </TouchableOpacity>
          )}
        </View>
      </View>

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

      {seasonName ? <Text style={styles.seasonText}>Season: {seasonName}</Text> : null}
      {error ? <View style={styles.errorBanner}><Ionicons name="alert-circle" size={18} color="#c62828" /><Text style={styles.errorText}>{error}</Text></View> : null}

      {loading && !refreshing ? (
        <ActivityIndicator size="large" color="#8c6239" style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#8c6239']} />}
          contentContainerStyle={{ paddingBottom: 16 }}
          ListEmptyComponent={<View style={styles.empty}><Ionicons name="bar-chart-outline" size={48} color="#d9d0c7" /><Text style={styles.emptyText}>No cumulative data</Text></View>}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#faf9f6', paddingHorizontal: 16, paddingTop: 8 },
  searchRow: { marginBottom: 12 },
  searchInputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#d9d0c7', paddingHorizontal: 12 },
  searchIcon: { marginRight: 6 },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 15, color: '#1a1512' },
  tabRow: { flexDirection: 'row', marginBottom: 8 },
  tabBtn: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#d9d0c7', backgroundColor: '#fff', marginHorizontal: 4 },
  activeTab: { backgroundColor: '#3d2b1f', borderColor: '#3d2b1f' },
  tabText: { fontSize: 15, fontWeight: '600', color: '#3d2b1f', marginLeft: 6 },
  activeTabText: { color: '#fff' },
  seasonText: { fontSize: 13, color: '#6b5e53', textAlign: 'center', marginBottom: 8 },
  errorBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffebee', borderRadius: 10, padding: 10, marginBottom: 12 },
  errorText: { flex: 1, color: '#c62828', fontSize: 13, marginLeft: 6 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#e0d9d0' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  regBadge: { backgroundColor: '#8c6239', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginRight: 10 },
  regText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  memberName: { fontSize: 16, fontWeight: '700', color: '#3d2b1f', flex: 1 },
  statsRow: { flexDirection: 'row', gap: 6 },
  statItem: { flex: 1, backgroundColor: '#f0ece6', borderRadius: 8, padding: 8, alignItems: 'center' },
  statLabel: { fontSize: 10, fontWeight: '600', color: '#6b5e53', textTransform: 'uppercase' },
  statValue: { fontSize: 13, fontWeight: '700', color: '#3d2b1f', marginTop: 2 },
  netItem: { backgroundColor: '#e8f5e9' },
  netValue: { color: '#2e7d32' },
  empty: { alignItems: 'center', marginTop: 60 },
  emptyText: { fontSize: 16, color: '#6b5e53', marginTop: 12 },
})