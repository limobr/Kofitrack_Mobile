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
import api from '../api/client'

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

interface Props {
  visible: boolean
  memberId: string | null
  onClose: () => void
}

export default function MemberDetailModal({ visible, memberId, onClose }: Props) {
  const navigation = useNavigation<any>()
  const [member, setMember] = useState<MemberDetail | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (visible && memberId) {
      fetchMember()
    } else {
      setMember(null)
    }
  }, [visible, memberId])

  const fetchMember = async () => {
    setLoading(true)
    try {
      const { data } = await api.get(`/members/${memberId}`)
      setMember(data.member)
    } catch (err) {
      console.error('Failed to fetch member details', err)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleString()
  const initial = member?.name?.charAt(0).toUpperCase() || '?'

  const handleEdit = () => {
    onClose()
    navigation.navigate('EditMember', { memberId })
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={24} color="#6b5e53" />
          </TouchableOpacity>

          {loading ? (
            <View style={styles.skeletonContainer}>
              <ActivityIndicator size="large" color="#8c6239" />
              <Text style={styles.skeletonText}>Loading member details...</Text>
            </View>
          ) : member ? (
            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Header */}
              <View style={styles.profileHeader}>
                <View style={styles.avatar}><Text style={styles.avatarText}>{initial}</Text></View>
                <View style={styles.headerInfo}>
                  <Text style={styles.name}>{member.name}</Text>
                  <Text style={styles.regNo}>Member ID: {member.reg_no}</Text>
                </View>
              </View>

              {/* Personal Info */}
              <View style={styles.content}>
                <Text style={styles.sectionTitle}>Personal Information</Text>
                <View style={styles.infoGrid}>
                  <View style={styles.infoItem}><Text style={styles.label}>Phone</Text><Text style={styles.value}>{member.phone || '—'}</Text></View>
                  <View style={styles.infoItem}><Text style={styles.label}>Email</Text><Text style={styles.value}>{member.email || '—'}</Text></View>
                  <View style={styles.infoItem}><Text style={styles.label}>National ID</Text><Text style={styles.value}>{member.national_id || '—'}</Text></View>
                  <View style={styles.infoItem}><Text style={styles.label}>Registration Date</Text><Text style={styles.value}>{new Date(member.reg_date).toLocaleDateString()}</Text></View>
                </View>

                {/* Audit Trail */}
                <Text style={styles.sectionTitle}>Audit Information</Text>
                <View style={styles.auditGrid}>
                  <View style={styles.auditItem}>
                    <Text style={styles.auditLabel}>Created By</Text>
                    <Text style={styles.auditValue}>{member.creator?.full_name || '—'}</Text>
                    <Text style={styles.auditDate}>{formatDate(member.created_at)}</Text>
                  </View>
                  <View style={styles.auditItem}>
                    <Text style={styles.auditLabel}>Last Updated By</Text>
                    <Text style={styles.auditValue}>{member.updater?.full_name || '—'}</Text>
                    <Text style={styles.auditDate}>{formatDate(member.updated_at)}</Text>
                  </View>
                </View>
              </View>

              {/* Edit Button */}
              <View style={styles.footer}>
                <TouchableOpacity style={styles.editButton} onPress={handleEdit}>
                  <Ionicons name="create-outline" size={18} color="#fff" />
                  <Text style={styles.editButtonText}>Edit Member</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          ) : null}
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  modal: { width: '90%', maxWidth: 400, maxHeight: '85%', backgroundColor: '#fff', borderRadius: 20, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, elevation: 5 },
  closeBtn: { position: 'absolute', top: 16, right: 16, zIndex: 10, padding: 4 },
  skeletonContainer: { padding: 40, alignItems: 'center' },
  skeletonText: { marginTop: 12, color: '#6b5e53' },
  profileHeader: { paddingTop: 40, paddingHorizontal: 20, paddingBottom: 20, backgroundColor: '#fdf7f5', flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#e0d5c5' },
  avatar: { width: 70, height: 70, borderRadius: 35, backgroundColor: '#3d2b1f', justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  avatarText: { fontSize: 28, fontWeight: '700', color: '#fff' },
  headerInfo: { flex: 1 },
  name: { fontSize: 20, fontWeight: '700', color: '#3d2b1f', marginBottom: 4 },
  regNo: { fontSize: 14, color: '#8c6239' },
  content: { padding: 20 },
  sectionTitle: { fontSize: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, color: '#6b5e53', marginBottom: 12, borderLeftWidth: 3, borderLeftColor: '#8c6239', paddingLeft: 8 },
  infoGrid: { marginBottom: 24 },
  infoItem: { marginBottom: 12 },
  label: { fontSize: 12, fontWeight: '600', color: '#6b5e53', marginBottom: 2 },
  value: { fontSize: 16, fontWeight: '500', color: '#3d2b1f' },
  auditGrid: { backgroundColor: '#faf9f6', borderRadius: 12, padding: 12, marginBottom: 16 },
  auditItem: { marginBottom: 12 },
  auditLabel: { fontSize: 11, fontWeight: '600', color: '#6b5e53', marginBottom: 2 },
  auditValue: { fontSize: 14, fontWeight: '600', color: '#3d2b1f', marginBottom: 2 },
  auditDate: { fontSize: 11, color: '#8c6239' },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: '#d9d0c7' },
  editButton: { backgroundColor: '#3d2b1f', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 10, borderRadius: 24, gap: 8 },
  editButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
})