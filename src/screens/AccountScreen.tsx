import React, { useState, useEffect } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert, ActivityIndicator } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import { useAuth } from '../contexts/AuthContext'
import AsyncStorage from '@react-native-async-storage/async-storage'

export default function AccountScreen() {
  const navigation = useNavigation<any>()
  const { signOut } = useAuth()

  const [printerInfo, setPrinterInfo] = useState<{ name: string; address: string; paperWidth: number } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadPrinterInfo()
  }, [])

  const loadPrinterInfo = async () => {
    try {
      const raw = await AsyncStorage.getItem('selectedPrinter')
      let name = '', address = ''
      if (raw) {
        try {
          const parsed = JSON.parse(raw)
          address = parsed.address || ''
          name = parsed.name || ''
        } catch {
          address = raw
          name = ''
        }
      }
      const pw = await AsyncStorage.getItem('paperWidth')
      const paperWidth = pw ? Number(pw) : 58
      if (address) {
        setPrinterInfo({ name: name || address, address, paperWidth })
      } else {
        setPrinterInfo(null)
      }
    } catch (e) {
      console.error('Failed to load printer info', e)
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: async () => {
        try {
          await signOut()
        } catch (e) {
          Alert.alert('Error', 'Could not log out. Please try again.')
        }
      }},
    ])
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Printer info card */}
      <View style={styles.infoCard}>
        <Ionicons name="print-outline" size={22} color="#8c6239" />
        <View style={styles.infoTextContainer}>
          <Text style={styles.infoLabel}>Printer</Text>
          {loading ? (
            <ActivityIndicator size="small" color="#8c6239" />
          ) : printerInfo ? (
            <>
              <Text style={styles.infoValue}>{printerInfo.name}</Text>
              <Text style={styles.infoSubtext}>{printerInfo.paperWidth}mm paper</Text>
            </>
          ) : (
            <Text style={styles.infoPlaceholder}>Not configured</Text>
          )}
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('PrinterSettings')}>
          <Text style={styles.editLink}>Edit</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.menuItem} onPress={() => navigation.navigate('PinLock')}>
        <Ionicons name="lock-closed-outline" size={24} color="#3d2b1f" />
        <Text style={styles.menuItemText}>Pin Lock</Text>
        <Ionicons name="chevron-forward" size={20} color="#9e8e7e" />
      </TouchableOpacity>

      <TouchableOpacity style={styles.menuItem} onPress={() => navigation.navigate('SyncLogs')}>
        <Ionicons name="document-text-outline" size={24} color="#3d2b1f" />
        <Text style={styles.menuItemText}>Sync Logs</Text>
        <Ionicons name="chevron-forward" size={20} color="#9e8e7e" />
      </TouchableOpacity>

      <TouchableOpacity style={[styles.menuItem, styles.logoutItem]} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={24} color="#c62828" />
        <Text style={[styles.menuItemText, styles.logoutText]}>Log Out</Text>
        <Ionicons name="chevron-forward" size={20} color="#c62828" />
      </TouchableOpacity>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#faf9f6' },
  content: { padding: 16, paddingBottom: 30 },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#e0d9d0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  infoTextContainer: { flex: 1, marginLeft: 12 },
  infoLabel: { fontSize: 12, fontWeight: '600', color: '#9e8e7e', marginBottom: 2 },
  infoValue: { fontSize: 15, fontWeight: '600', color: '#3d2b1f' },
  infoSubtext: { fontSize: 12, color: '#6b5e53', marginTop: 2 },
  infoPlaceholder: { fontSize: 14, color: '#9e8e7e', fontStyle: 'italic' },
  editLink: { color: '#8c6239', fontWeight: '600', fontSize: 14 },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e0d9d0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  menuItemText: { flex: 1, fontSize: 16, fontWeight: '600', color: '#3d2b1f', marginLeft: 12 },
  logoutItem: { borderColor: '#ffebee' },
  logoutText: { color: '#c62828' },
})