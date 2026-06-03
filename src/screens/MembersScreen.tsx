import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import api from '../api/client'
import MemberDetailModal from '../components/MemberDetailModal'

interface Member {
  id: string
  reg_no: string
  name: string
  phone: string
  national_id: string
  reg_date: string
}

export default function MembersScreen() {
  const navigation = useNavigation<any>()
  const [allMembers, setAllMembers] = useState<Member[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null)
  const [modalVisible, setModalVisible] = useState(false)

  const fetchMembers = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true)
    setError('')
    try {
      const { data } = await api.get('/members')
      setAllMembers(data.members || [])
    } catch (e: any) {
      const message = e.response?.data?.error || e.message || 'Failed to load members'
      setError(message)
      console.error('Members fetch error:', e)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchMembers()
  }, [fetchMembers])

  const onRefresh = () => {
    setRefreshing(true)
    fetchMembers(true)
  }

  const members = useMemo(() => {
    if (!search.trim()) return allMembers
    const s = search.toLowerCase()
    return allMembers.filter(
      (m) => m.name.toLowerCase().includes(s) || m.reg_no.includes(s) || m.phone.includes(s) || m.national_id.toLowerCase().includes(s)
    )
  }, [allMembers, search])

  const handleMemberPress = (memberId: string) => {
    setSelectedMemberId(memberId)
    setModalVisible(true)
  }

  const renderItem = ({ item }: { item: Member }) => (
    <TouchableOpacity style={styles.card} onPress={() => handleMemberPress(item.id)} activeOpacity={0.7}>
      <View style={styles.cardRow}>
        <View style={styles.regContainer}><Text style={styles.regText}>{item.reg_no}</Text></View>
        <Text style={styles.memberName} numberOfLines={1}>{item.name}</Text>
        <View style={styles.phoneContainer}>
          <Ionicons name="call-outline" size={14} color="#6b5e53" />
          <Text style={styles.phoneText}>{item.phone}</Text>
        </View>
      </View>
      {item.national_id !== 'N/A' && (
        <View style={styles.cardRowSub}>
          <Ionicons name="card-outline" size={12} color="#9e8e7e" />
          <Text style={styles.subText}>ID: {item.national_id}</Text>
        </View>
      )}
    </TouchableOpacity>
  )

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <View style={styles.searchInputWrapper}>
          <Ionicons name="search" size={18} color="#8c6239" style={styles.searchIcon} />
          <TextInput placeholder="Search by name, reg no, phone..." placeholderTextColor="#9e8e7e" value={search} onChangeText={setSearch} style={styles.searchInput} returnKeyType="search" />
          {search.length > 0 && <TouchableOpacity onPress={() => setSearch('')}><Ionicons name="close-circle" size={18} color="#9e8e7e" style={styles.clearIcon} /></TouchableOpacity>}
        </View>
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={18} color="#c62828" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => fetchMembers()}><Text style={styles.retryText}>Retry</Text></TouchableOpacity>
        </View>
      ) : null}

      {loading && !refreshing ? (
        <ActivityIndicator size="large" color="#8c6239" style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={members}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#8c6239']} tintColor="#8c6239" />}
          contentContainerStyle={{ paddingBottom: 80 }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="people-outline" size={48} color="#d9d0c7" />
              <Text style={styles.emptyText}>No members found</Text>
              <Text style={styles.emptySubtext}>Try changing the search or add a new member</Text>
            </View>
          }
        />
      )}

      <TouchableOpacity style={styles.fab} activeOpacity={0.85} onPress={() => navigation.navigate('AddMember')}>
        <Ionicons name="add" size={28} color="#faf9f6" />
      </TouchableOpacity>

      <MemberDetailModal visible={modalVisible} memberId={selectedMemberId} onClose={() => setModalVisible(false)} />
    </View>
  )
}

// Styles remain exactly as earlier (compact card, etc.)
// ... (I'll include them for completeness)
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#faf9f6', paddingHorizontal: 16, paddingTop: 8 },
  searchRow: { marginBottom: 12 },
  searchInputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#d9d0c7', paddingHorizontal: 12 },
  searchIcon: { marginRight: 6 },
  searchInput: { flex: 1, paddingVertical: 12, fontSize: 15, color: '#1a1512' },
  clearIcon: { marginLeft: 4 },
  errorBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffebee', borderRadius: 10, padding: 10, marginBottom: 12 },
  errorText: { flex: 1, color: '#c62828', fontSize: 13, marginLeft: 6 },
  retryText: { color: '#8c6239', fontWeight: '700', fontSize: 14, marginLeft: 8 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#e0d9d0', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2, elevation: 2 },
  cardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  regContainer: { backgroundColor: '#8c6239', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, marginRight: 8 },
  regText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  memberName: { flex: 1, fontSize: 14, fontWeight: '600', color: '#3d2b1f', marginRight: 8 },
  phoneContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0ece6', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 },
  phoneText: { fontSize: 12, color: '#3d2b1f', marginLeft: 4 },
  cardRowSub: { flexDirection: 'row', alignItems: 'center', marginTop: 6, paddingTop: 4, borderTopWidth: 0.5, borderTopColor: '#f0ece6' },
  subText: { fontSize: 11, color: '#9e8e7e', marginLeft: 4 },
  emptyContainer: { alignItems: 'center', marginTop: 60 },
  emptyText: { fontSize: 18, fontWeight: '600', color: '#6b5e53', marginTop: 12 },
  emptySubtext: { fontSize: 14, color: '#9e8e7e', marginTop: 4 },
  fab: { position: 'absolute', right: 20, bottom: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: '#3d2b1f', justifyContent: 'center', alignItems: 'center', elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 5 },
})