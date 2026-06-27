import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  View,
  Text,
  TextInput,
  SectionList,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation, useFocusEffect } from '@react-navigation/native'
import api from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { getLocalMembers } from '../services/memberSyncService'
import eventEmitter from '../services/eventEmitter'
import MemberDetailModal from '../components/MemberDetailModal'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Member {
  id: string
  reg_no: string
  name: string
  phone: string
  national_id: string
  reg_date: string
}

interface Section {
  title: string
  data: Member[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Two-letter initials from a full name */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/** Deterministic pastel background colour from a name */
const AVATAR_PALETTES = [
  { bg: '#F4EEE3', fg: '#5C4128' },
  { bg: '#E8EFE2', fg: '#3B5030' },
  { bg: '#EDE5F7', fg: '#4B2D7A' },
  { bg: '#FDEEDE', fg: '#7A4010' },
  { bg: '#E2EEF4', fg: '#1A4B5E' },
]
function avatarColour(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0
  return AVATAR_PALETTES[Math.abs(hash) % AVATAR_PALETTES.length]
}

/** Group sorted members into A-Z sections */
function toSections(members: Member[]): Section[] {
  const map = new Map<string, Member[]>()
  for (const m of members) {
    const letter = (m.name[0] || '#').toUpperCase()
    if (!map.has(letter)) map.set(letter, [])
    map.get(letter)!.push(m)
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([title, data]) => ({ title, data }))
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function MembersScreen() {
  const navigation = useNavigation<any>()
  const { user } = useAuth()

  const [allMembers, setAllMembers] = useState<Member[]>([])
  const [search, setSearch]         = useState('')
  const [loading, setLoading]       = useState(true)   // true until cache OR network paints
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError]           = useState('')
  const [selectedMemberId, setSelectedMemberId]     = useState<string | null>(null)
  const [selectedMember, setSelectedMember]         = useState<Member | null>(null)
  const [modalVisible, setModalVisible]             = useState(false)

  // ── Network fetch (background by default, foreground only when no cache) ──
  const fetchFromServer = useCallback(async (showSpinner = false) => {
    if (showSpinner) setLoading(true)
    setError('')
    try {
      const { data } = await api.get('/members')
      setAllMembers(data.members || [])
    } catch (e: any) {
      const message = e.response?.data?.error || e.message || 'Failed to load members'
      // Only surface the error if we have nothing to show
      setAllMembers(prev => {
        if (prev.length === 0) setError(message)
        return prev
      })
      console.error('Members fetch error:', e)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  // ── Mount: cache-first, then silent background refresh ───────────────────
  useEffect(() => {
    let cancelled = false

    const init = async () => {
      // 1. Paint from local cache instantly
      if (user?.factoryId) {
        try {
          const cached = await getLocalMembers(user.factoryId)
          if (!cancelled && cached && cached.length > 0) {
            setAllMembers(cached as Member[])
            setLoading(false)
          }
        } catch {
          // cache read failed — fall through to network
        }
      }

      // 2. Background network refresh (showSpinner=true only when cache was empty)
      if (!cancelled) {
        const needsSpinner = allMembers.length === 0
        await fetchFromServer(needsSpinner)
      }
    }

    init()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.factoryId])

  // ── Refocus: silently re-sync with the server every time this tab is shown.
  // The mount effect above already covers the very first focus, so skip that one.
  const isFirstFocus = useRef(true)
  useFocusEffect(
    useCallback(() => {
      if (isFirstFocus.current) {
        isFirstFocus.current = false
        return
      }
      fetchFromServer(false)
    }, [fetchFromServer])
  )

  // ── A member was just added/edited elsewhere (e.g. AddMemberScreen) — refresh now
  // rather than waiting for the next focus, in case the screen is already focused
  // underneath (e.g. "Save & Add Another" keeps AddMember open).
  useEffect(() => {
    const onMemberRecorded = () => fetchFromServer(false)
    eventEmitter.on('memberRecorded', onMemberRecorded)
    return () => { eventEmitter.off('memberRecorded', onMemberRecorded) }
  }, [fetchFromServer])

  // ── Pull-to-refresh always hits network ──────────────────────────────────
  const onRefresh = () => {
    setRefreshing(true)
    fetchFromServer(false)
  }

  // ── Search filter ─────────────────────────────────────────────────────────
  const filteredMembers = useMemo(() => {
    if (!search.trim()) return allMembers
    const s = search.toLowerCase()
    return allMembers.filter(
      (m) =>
        m.name.toLowerCase().includes(s) ||
        m.reg_no.includes(s) ||
        m.phone.includes(s) ||
        m.national_id.toLowerCase().includes(s)
    )
  }, [allMembers, search])

  const sections = useMemo(
    () => toSections([...filteredMembers].sort((a, b) => a.name.localeCompare(b.name))),
    [filteredMembers]
  )

  // ── Render helpers ────────────────────────────────────────────────────────
  const handlePress = (item: Member) => {
    setSelectedMemberId(item.id)
    setSelectedMember(item)
    setModalVisible(true)
  }

  const renderItem = ({ item }: { item: Member }) => {
    const { bg, fg } = avatarColour(item.name)
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => handlePress(item)}
        activeOpacity={0.72}
      >
        {/* Avatar */}
        <View style={[styles.avatar, { backgroundColor: bg }]}>
          <Text style={[styles.avatarText, { color: fg }]}>{initials(item.name)}</Text>
        </View>

        {/* Info */}
        <View style={styles.info}>
          <View style={styles.nameRow}>
            <Text style={styles.memberName} numberOfLines={1}>{item.name}</Text>
            <View style={styles.regChip}>
              <Text style={styles.regChipText}>#{item.reg_no}</Text>
            </View>
          </View>
          <View style={styles.subRow}>
            <Ionicons name="call-outline" size={11} color="#9e8e7e" />
            <Text style={styles.subText}>{item.phone || '—'}</Text>
          </View>
        </View>

        {/* Chevron */}
        <Ionicons name="chevron-forward" size={16} color="#d9cdb8" />
      </TouchableOpacity>
    )
  }

  const renderSectionHeader = ({ section }: { section: Section }) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionLetter}>{section.title}</Text>
    </View>
  )

  // ── Skeleton loader (cache-first: only shown before first paint) ──────────
  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.skeletonSearch} />
        {[1, 2, 3, 4, 5].map((i) => (
          <View key={i} style={[styles.card, { opacity: 1 - i * 0.12 }]}>
            <View style={[styles.avatar, { backgroundColor: '#EDE6D8' }]} />
            <View style={styles.info}>
              <View style={styles.skeletonLine} />
              <View style={[styles.skeletonLine, { width: '55%', marginTop: 6 }]} />
            </View>
          </View>
        ))}
      </View>
    )
  }

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* Search bar */}
      <View style={styles.searchWrapper}>
        <Ionicons name="search" size={17} color="#8c6239" style={styles.searchIcon} />
        <TextInput
          placeholder="Search name, reg no, or phone"
          placeholderTextColor="#9e8e7e"
          value={search}
          onChangeText={setSearch}
          style={styles.searchInput}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={17} color="#9e8e7e" />
          </TouchableOpacity>
        )}
      </View>

      {/* Member count */}
      <View style={styles.countRow}>
        <Text style={styles.countText}>
          {filteredMembers.length}{search ? ' result' : ' member'}{filteredMembers.length !== 1 ? 's' : ''}
        </Text>
      </View>

      {/* Error banner — only shown when there's nothing cached to display */}
      {error ? (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={16} color="#c62828" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => fetchFromServer(true)}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* A-Z member list */}
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#8c6239']}
            tintColor="#8c6239"
          />
        }
        contentContainerStyle={{ paddingBottom: 100 }}
        stickySectionHeadersEnabled={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={48} color="#d9cdb8" />
            <Text style={styles.emptyTitle}>
              {search ? 'No matches' : 'No members yet'}
            </Text>
            <Text style={styles.emptySubtext}>
              {search
                ? 'Try a different name, reg no, or phone number'
                : 'Add your first member using the + button'}
            </Text>
          </View>
        }
      />

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        activeOpacity={0.85}
        onPress={() => navigation.navigate('AddMember')}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      <MemberDetailModal
        visible={modalVisible}
        memberId={selectedMemberId}
        cachedMember={selectedMember}
        onClose={() => setModalVisible(false)}
      />
    </View>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF7F1',
    paddingHorizontal: 16,
    paddingTop: 8,
  },

  // Search
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E4DBCB',
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  searchIcon: { marginRight: 7 },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
    color: '#2E2018',
    fontFamily: undefined, // inherits system font
  },

  // Count label
  countRow: { marginBottom: 6, paddingLeft: 2 },
  countText: {
    fontSize: 12,
    color: '#9e8e7e',
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.3,
  },

  // Error
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffebee',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  errorText: { flex: 1, color: '#c62828', fontSize: 13, marginLeft: 6 },
  retryText: { color: '#8c6239', fontWeight: '700', fontSize: 13, marginLeft: 8 },

  // Section header
  sectionHeader: {
    paddingTop: 16,
    paddingBottom: 5,
    paddingLeft: 2,
  },
  sectionLetter: {
    fontSize: 13,
    fontWeight: '700',
    color: '#C8623D',
    letterSpacing: 0.5,
  },

  // Card
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#E4DBCB',
    padding: 12,
    marginBottom: 7,
    gap: 11,
    shadowColor: '#2E2018',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },

  // Avatar
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // Info block
  info: { flex: 1, minWidth: 0 },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flexWrap: 'nowrap',
  },
  memberName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2E2018',
    flexShrink: 1,
  },
  regChip: {
    backgroundColor: '#F4EEE3',
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
    flexShrink: 0,
  },
  regChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#5C4128',
    fontVariant: ['tabular-nums'],
  },
  subRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  subText: {
    fontSize: 12,
    color: '#8A7C6B',
  },

  // Skeleton
  skeletonSearch: {
    height: 44,
    borderRadius: 12,
    backgroundColor: '#EDE6D8',
    marginBottom: 10,
  },
  skeletonLine: {
    height: 12,
    borderRadius: 6,
    backgroundColor: '#EDE6D8',
    width: '75%',
  },

  // Empty
  emptyContainer: { alignItems: 'center', marginTop: 64 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: '#6b5e53', marginTop: 14 },
  emptySubtext: {
    fontSize: 13,
    color: '#9e8e7e',
    marginTop: 5,
    textAlign: 'center',
    maxWidth: 260,
  },

  // FAB
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 28,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#C8623D',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#C8623D',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
})