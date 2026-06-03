import React, { useState, useEffect } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation, useRoute } from '@react-navigation/native'
import api from '../api/client'

interface RouteParams {
  memberId: string
}

export default function EditMemberScreen() {
  const navigation = useNavigation()
  const route = useRoute()
  const { memberId } = route.params as RouteParams

  const [form, setForm] = useState({
    name: '',
    phone: '',
    national_id: '',
    email: '',
  })
  const [regNo, setRegNo] = useState('')
  const [loading, setLoading] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    fetchMember()
  }, [])

  const fetchMember = async () => {
    try {
      const { data } = await api.get(`/members/${memberId}`)
      const member = data.member
      setRegNo(member.reg_no)
      setForm({
        name: member.name,
        phone: member.phone || '',
        national_id: member.national_id === 'N/A' ? '' : member.national_id,
        email: member.email || '',
      })
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'Failed to load member')
      navigation.goBack()
    } finally {
      setFetching(false)
    }
  }

  const handleChange = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const handleUpdate = async () => {
    if (!form.name.trim() || !form.phone.trim()) {
      setError('Name and phone are required.')
      return
    }
    setLoading(true)
    setError('')
    setSuccess('')
    try {
      await api.put(`/members/${memberId}`, {
        name: form.name.trim(),
        phone: form.phone.trim(),
        national_id: form.national_id.trim() || 'N/A',
        email: form.email.trim() || null,
      })
      setSuccess('Member updated successfully.')
      setTimeout(() => navigation.goBack(), 1500)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Update failed')
    } finally {
      setLoading(false)
    }
  }

  if (fetching) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#8c6239" />
        <Text style={styles.loadingText}>Loading member data...</Text>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Registration number as a badge */}
        <View style={styles.regBadgeContainer}>
          <Text style={styles.regLabel}>Member ID</Text>
          <Text style={styles.regNumber}>{regNo}</Text>
        </View>

        {error ? (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={18} color="#c62828" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
        {success ? (
          <View style={styles.successBanner}>
            <Ionicons name="checkmark-circle" size={18} color="#2e7d32" />
            <Text style={styles.successText}>{success}</Text>
          </View>
        ) : null}

        <Text style={styles.label}>Full Name *</Text>
        <View style={styles.inputWrapper}>
          <Ionicons name="person-outline" size={18} color="#8c6239" style={styles.inputIcon} />
          <TextInput
            placeholder="Full Name"
            value={form.name}
            onChangeText={(v) => handleChange('name', v)}
            style={styles.input}
          />
        </View>

        <Text style={styles.label}>Phone Number *</Text>
        <View style={styles.inputWrapper}>
          <Ionicons name="call-outline" size={18} color="#8c6239" style={styles.inputIcon} />
          <TextInput
            placeholder="Phone Number"
            value={form.phone}
            onChangeText={(v) => handleChange('phone', v)}
            keyboardType="phone-pad"
            style={styles.input}
          />
        </View>

        <Text style={styles.label}>National ID</Text>
        <View style={styles.inputWrapper}>
          <Ionicons name="card-outline" size={18} color="#8c6239" style={styles.inputIcon} />
          <TextInput
            placeholder="National ID"
            value={form.national_id}
            onChangeText={(v) => handleChange('national_id', v)}
            style={styles.input}
          />
        </View>

        <Text style={styles.label}>Email</Text>
        <View style={styles.inputWrapper}>
          <Ionicons name="mail-outline" size={18} color="#8c6239" style={styles.inputIcon} />
          <TextInput
            placeholder="Email"
            value={form.email}
            onChangeText={(v) => handleChange('email', v)}
            keyboardType="email-address"
            autoCapitalize="none"
            style={styles.input}
          />
        </View>

        <TouchableOpacity style={styles.updateBtn} onPress={handleUpdate} disabled={loading}>
          {loading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.updateBtnText}>Update Member</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#faf9f6' },
  scrollContent: { padding: 20 },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#faf9f6' },
  loadingText: { marginTop: 12, color: '#6b5e53' },
  regBadgeContainer: {
    backgroundColor: '#f0ece6',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#d9d0c7',
  },
  regLabel: { fontSize: 12, fontWeight: '600', color: '#6b5e53', textTransform: 'uppercase' },
  regNumber: { fontSize: 24, fontWeight: '700', color: '#8c6239', marginTop: 4 },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffebee',
    borderRadius: 10,
    padding: 10,
    marginBottom: 16,
  },
  errorText: { color: '#c62828', marginLeft: 8, flex: 1 },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8f5e9',
    borderRadius: 10,
    padding: 10,
    marginBottom: 16,
  },
  successText: { color: '#2e7d32', marginLeft: 8, flex: 1 },
  label: { fontSize: 14, fontWeight: '600', color: '#6b5e53', marginBottom: 8, marginTop: 4 },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d9d0c7',
    marginBottom: 16,
    paddingHorizontal: 14,
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, paddingVertical: 14, fontSize: 16, color: '#1a1512' },
  updateBtn: {
    backgroundColor: '#3d2b1f',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  updateBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
})