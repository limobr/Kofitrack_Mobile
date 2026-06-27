import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import NetInfo from '@react-native-community/netinfo'
import api from '../api/client'

// ─── Types ───────────────────────────────────────────────────────────────────

interface MemberDetail {
  id: string
  reg_no: string
  name: string
  phone: string | null
  national_id: string | null
  email: string | null
  reg_date: string
  created_at: string
  updated_at: string
  creator?: { full_name: string } | null
  updater?: { full_name: string } | null
}

/** Minimal cached fields passed in from the list — used for instant header paint */
interface CachedMember {
  id: string
  reg_no: string
  name: string
  phone?: string
  national_id?: string
}

interface Props {
  visible: boolean
  memberId: string | null
  cachedMember?: CachedMember | null   // optional: pre-fill header while loading
  onClose: () => void
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function MemberDetailModal({ visible, memberId, cachedMember, onClose }: Props) {
  const navigation = useNavigation<any>()
  const [member, setMember]   = useState<MemberDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    if (visible && memberId) {
      fetchMember()
    } else {
      setMember(null)
      setOffline(false)
    }
  }, [visible, memberId])

  const fetchMember = async () => {
    // Check connectivity before firing the network call
    const net = await NetInfo.fetch()
    if (!net.isConnected) {
      setOffline(true)
      setLoading(false)
      return
    }

    setOffline(false)
    setLoading(true)
    try {
      const { data } = await api.get(`/members/${memberId}`)
      setMember(data.member)
    } catch (err) {
      // If the request fails after we thought we were online,
      // fall back to the offline state so the user sees something useful
      setOffline(true)
      console.error('Failed to fetch member details', err)
    } finally {
      setLoading(false)
    }
  }

  const handleEdit = () => {
    onClose()
    navigation.navigate('EditMember', { memberId })
  }

  // The name we can show even before the full fetch completes
  const displayName = member?.name ?? cachedMember?.name ?? ''
  const displayReg  = member?.reg_no ?? cachedMember?.reg_no ?? ''
  const { bg, fg } = displayName ? avatarColour(displayName) : { bg: '#F4EEE3', fg: '#5C4128' }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modal}>

          {/* Close button — always visible */}
          <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={22} color="#6b5e53" />
          </TouchableOpacity>

          {/* ── Loading ── */}
          {loading && (
            <View style={styles.centreState}>
              <ActivityIndicator size="large" color="#8c6239" />
              <Text style={styles.centreStateText}>Loading details…</Text>
            </View>
          )}

          {/* ── Offline state ── */}
          {!loading && offline && (
            <View style={styles.offlineWrap}>
              {/* Still render the header with cached data if we have it */}
              {displayName ? (
                <View style={styles.offlineHeader}>
                  <View style={[styles.avatar, { backgroundColor: bg }]}>
                    <Text style={[styles.avatarText, { color: fg }]}>{initials(displayName)}</Text>
                  </View>
                  <View style={styles.headerInfo}>
                    <Text style={styles.name}>{displayName}</Text>
                    {displayReg ? <Text style={styles.regNo}>#{displayReg}</Text> : null}
                  </View>
                </View>
              ) : null}

              <View style={styles.offlineCard}>
                <Ionicons name="cloud-offline-outline" size={36} color="#C8623D" />
                <Text style={styles.offlineTitle}>Not available offline</Text>
                <Text style={styles.offlineBody}>
                  Member details need an internet connection. Connect to Wi-Fi or mobile data and try again.
                </Text>
                <TouchableOpacity style={styles.retryBtn} onPress={fetchMember}>
                  <Ionicons name="refresh" size={16} color="#fff" />
                  <Text style={styles.retryBtnText}>Try again</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ── Full member detail ── */}
          {!loading && !offline && member && (
            <ScrollView showsVerticalScrollIndicator={false} bounces={false}>
              {/* Header */}
              <View style={[styles.profileHeader, { backgroundColor: bg + '55' }]}>
                <View style={[styles.avatar, { backgroundColor: bg }]}>
                  <Text style={[styles.avatarText, { color: fg }]}>{initials(member.name)}</Text>
                </View>
                <View style={styles.headerInfo}>
                  <Text style={styles.name}>{member.name}</Text>
                  <Text style={styles.regNo}>#{member.reg_no}</Text>
                </View>
              </View>

              {/* Personal Info */}
              <View style={styles.content}>
                <Text style={styles.sectionTitle}>Personal Information</Text>
                <View style={styles.infoGrid}>
                  <InfoRow label="Phone"             value={member.phone} />
                  <InfoRow label="Email"             value={member.email} />
                  <InfoRow label="National ID"       value={member.national_id} />
                  <InfoRow label="Registration Date" value={new Date(member.reg_date).toLocaleDateString()} />
                </View>

                <Text style={styles.sectionTitle}>Audit Information</Text>
                <View style={styles.auditGrid}>
                  <AuditRow
                    label="Created by"
                    name={member.creator?.full_name}
                    date={member.created_at}
                  />
                  <AuditRow
                    label="Last updated by"
                    name={member.updater?.full_name}
                    date={member.updated_at}
                    last
                  />
                </View>
              </View>

              {/* Footer */}
              <View style={styles.footer}>
                <TouchableOpacity style={styles.editButton} onPress={handleEdit}>
                  <Ionicons name="create-outline" size={18} color="#fff" />
                  <Text style={styles.editButtonText}>Edit Member</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}

        </View>
      </View>
    </Modal>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <View style={styles.infoItem}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value || '—'}</Text>
    </View>
  )
}

function AuditRow({
  label, name, date, last,
}: { label: string; name?: string | null; date: string; last?: boolean }) {
  return (
    <View style={[styles.auditItem, last && { marginBottom: 0 }]}>
      <Text style={styles.auditLabel}>{label}</Text>
      <Text style={styles.auditValue}>{name || '—'}</Text>
      <Text style={styles.auditDate}>{new Date(date).toLocaleString()}</Text>
    </View>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(46,32,24,0.55)',
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: '#FAF7F1',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '88%',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
  },
  closeBtn: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EDE6D8',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Loading / centre state
  centreState: { paddingVertical: 56, alignItems: 'center' },
  centreStateText: { marginTop: 12, color: '#8A7C6B', fontSize: 14 },

  // Offline
  offlineWrap: { paddingBottom: 36 },
  offlineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    paddingTop: 28,
    borderBottomWidth: 1,
    borderBottomColor: '#E4DBCB',
    gap: 14,
  },
  offlineCard: {
    margin: 20,
    padding: 24,
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E4DBCB',
    alignItems: 'center',
    gap: 8,
  },
  offlineTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2E2018',
    marginTop: 4,
  },
  offlineBody: {
    fontSize: 13,
    color: '#8A7C6B',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 8,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#C8623D',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    marginTop: 4,
  },
  retryBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // Profile header
  profileHeader: {
    paddingTop: 36,
    paddingHorizontal: 20,
    paddingBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E4DBCB',
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  avatarText: { fontSize: 24, fontWeight: '700' },
  headerInfo: { flex: 1 },
  name: { fontSize: 20, fontWeight: '700', color: '#2E2018', marginBottom: 4 },
  regNo: { fontSize: 13, fontWeight: '600', color: '#8C6239' },

  // Content
  content: { padding: 20 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: '#8A7C6B',
    marginBottom: 12,
    marginTop: 4,
  },
  infoGrid: { marginBottom: 24 },
  infoItem: { marginBottom: 14 },
  label: { fontSize: 12, fontWeight: '600', color: '#8A7C6B', marginBottom: 3 },
  value: { fontSize: 16, fontWeight: '500', color: '#2E2018' },
  auditGrid: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E4DBCB',
    padding: 14,
    marginBottom: 8,
  },
  auditItem: { marginBottom: 14 },
  auditLabel: { fontSize: 11, fontWeight: '600', color: '#8A7C6B', marginBottom: 2 },
  auditValue: { fontSize: 14, fontWeight: '600', color: '#2E2018', marginBottom: 2 },
  auditDate: { fontSize: 11, color: '#C8623D' },

  // Footer
  footer: {
    padding: 16,
    paddingBottom: 28,
    borderTopWidth: 1,
    borderTopColor: '#E4DBCB',
  },
  editButton: {
    backgroundColor: '#2E2018',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 28,
    gap: 8,
  },
  editButtonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
})