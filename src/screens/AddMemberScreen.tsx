import React, { useState, useRef } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Animated,
  ActivityIndicator,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import api from '../api/client'

export default function AddMemberScreen() {
  const [form, setForm] = useState({
    name: '',
    phone: '',
    national_id: '',
    email: '',
  })
  const [loading, setLoading] = useState(false)

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

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const saveMember = async () => {
    if (!form.name.trim() || !form.phone.trim()) {
      showToast('Name and phone are required', 'error')
      return
    }
    setLoading(true)
    try {
      const { data } = await api.post('/members', {
        name: form.name.trim(),
        phone: form.phone.trim(),
        national_id: form.national_id.trim() || 'N/A',
        email: form.email.trim() || null,
      })
      showToast(`${data.member.name} added (Reg ${data.member.reg_no})`, 'success')
      setForm({
        name: '',
        phone: '',
        national_id: '',
        email: '',
      })
    } catch (e: any) {
      showToast(e.response?.data?.error || 'Failed to add member', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {toast && (
        <Animated.View
          style={[
            styles.toastOverlay,
            toast.type === 'success' ? styles.toastSuccess : styles.toastError,
            { opacity: toastOpacity, transform: [{ translateY: toastTranslateY }] },
          ]}
          pointerEvents="none"
        >
          <Ionicons name={toast.type === 'success' ? 'checkmark-circle' : 'alert-circle'} size={20} color={toast.type === 'success' ? '#2e7d32' : '#c62828'} />
          <Text style={styles.toastText}>{toast.text}</Text>
        </Animated.View>
      )}
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <View style={styles.iconCircle}><Ionicons name="person-add" size={28} color="#fff" /></View>
          <Text style={styles.title}>Register New Member</Text>
          <Text style={styles.subtitle}>Fill in the details below. Form stays open after saving.</Text>
        </View>

        <Text style={styles.label}>Full Name *</Text>
        <View style={styles.inputWrapper}>
          <Ionicons name="person-outline" size={18} color="#8c6239" style={styles.inputIcon} />
          <TextInput placeholder="John Doe" placeholderTextColor="#9e8e7e" value={form.name} onChangeText={(v) => handleChange('name', v)} style={styles.input} autoCapitalize="words" />
        </View>

        <Text style={styles.label}>Phone Number *</Text>
        <View style={styles.inputWrapper}>
          <Ionicons name="call-outline" size={18} color="#8c6239" style={styles.inputIcon} />
          <TextInput placeholder="07XX XXX XXX" placeholderTextColor="#9e8e7e" value={form.phone} onChangeText={(v) => handleChange('phone', v)} keyboardType="phone-pad" style={styles.input} />
        </View>

        <Text style={styles.label}>National ID</Text>
        <View style={styles.inputWrapper}>
          <Ionicons name="card-outline" size={18} color="#8c6239" style={styles.inputIcon} />
          <TextInput placeholder="e.g. 12345678" placeholderTextColor="#9e8e7e" value={form.national_id} onChangeText={(v) => handleChange('national_id', v)} style={styles.input} />
        </View>

        <Text style={styles.label}>Email</Text>
        <View style={styles.inputWrapper}>
          <Ionicons name="mail-outline" size={18} color="#8c6239" style={styles.inputIcon} />
          <TextInput placeholder="john@example.com" placeholderTextColor="#9e8e7e" value={form.email} onChangeText={(v) => handleChange('email', v)} keyboardType="email-address" autoCapitalize="none" style={styles.input} />
        </View>

        <TouchableOpacity onPress={saveMember} disabled={loading} style={[styles.saveBtn, loading && styles.saveBtnDisabled]}>
          {loading ? <ActivityIndicator size="small" color="#fff" /> : <View style={styles.saveBtnContent}><Ionicons name="add-circle-outline" size={20} color="#fff" /><Text style={styles.saveBtnText}>Save & Add Another</Text></View>}
        </TouchableOpacity>
        <Text style={styles.footerHint}>After saving, the form clears ready for the next member.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#faf9f6' },
  scrollContent: { padding: 20 },
  toastOverlay: {
    position: 'absolute', top: 20, left: 20, right: 20, flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, paddingHorizontal: 16, borderRadius: 14, zIndex: 999,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 8,
  },
  toastSuccess: { backgroundColor: '#e8f5e9' },
  toastError: { backgroundColor: '#ffebee' },
  toastText: { marginLeft: 10, fontSize: 15, fontWeight: '600', color: '#1a1512' },
  header: { alignItems: 'center', marginBottom: 28 },
  iconCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#8c6239', justifyContent: 'center', alignItems: 'center', marginBottom: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 4 },
  title: { fontSize: 22, fontWeight: '700', color: '#3d2b1f', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#6b5e53', textAlign: 'center' },
  label: { fontSize: 14, fontWeight: '600', color: '#6b5e53', marginBottom: 8, marginTop: 4 },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#d9d0c7', marginBottom: 16, paddingHorizontal: 14 },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, paddingVertical: 14, fontSize: 16, color: '#1a1512' },
  saveBtn: { backgroundColor: '#3d2b1f', borderRadius: 14, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnContent: { flexDirection: 'row', alignItems: 'center' },
  saveBtnText: { color: '#fff', fontSize: 17, fontWeight: '700', marginLeft: 8 },
  footerHint: { textAlign: 'center', color: '#9e8e7e', fontSize: 13, marginTop: 16 },
})