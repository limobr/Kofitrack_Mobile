import React, { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../navigation/types'
import { useAuth } from '../contexts/AuthContext'
import { getFactorySettings } from '../services/factorySettingsCache'
import { getPrintJobs, subscribeToPrintQueue } from '../services/printQueue'
import AsyncStorage from '@react-native-async-storage/async-storage'

type Nav = NativeStackNavigationProp<RootStackParamList>

// ─── Tokens ───────────────────────────────────────────────────────────────────
const BRAND_DARK = '#2E2018'
const UMBER      = '#8C6239'
const LINE       = '#E4DBCB'
const MUTED      = '#8A7C6B'
const BG         = '#FAF7F1'
const DANGER     = '#C8623D'

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

// ─── Section label ─────────────────────────────────────────────────────────────
function GroupLabel({ label }: { label: string }) {
  return <Text style={styles.groupLabel}>{label}</Text>
}

// ─── Menu card row ─────────────────────────────────────────────────────────────
interface RowProps {
  label: string
  value?: string
  badge?: number
  danger?: boolean
  onPress: () => void
  isFirst?: boolean
  isLast?: boolean
  loading?: boolean
}

function MenuRow({
  label, value, badge, danger, onPress, isFirst, isLast, loading,
}: RowProps) {
  return (
    <TouchableOpacity
      style={[
        styles.row,
        isFirst  && styles.rowFirst,
        isLast   && styles.rowLast,
        !isLast  && styles.rowBorder,
        danger   && styles.rowDangerBg,
      ]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[styles.rowLabel, danger && styles.rowLabelDanger]}>{label}</Text>

      <View style={styles.rowRight}>
        {loading ? (
          <ActivityIndicator size="small" color={MUTED} />
        ) : value ? (
          <Text style={styles.rowValue}>{value}</Text>
        ) : null}

        {badge != null && badge > 0 && (
          <View style={styles.rowBadge}>
            <Text style={styles.rowBadgeText}>{badge > 99 ? '99+' : badge}</Text>
          </View>
        )}

        <Text style={[styles.rowChev, danger && styles.rowChevDanger]}>›</Text>
      </View>
    </TouchableOpacity>
  )
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function AccountScreen() {
  const navigation = useNavigation<Nav>()
  const { user, signOut } = useAuth()

  const [printerName, setPrinterName]     = useState<string | null>(null)
  const [printerLoading, setPrinterLoading] = useState(true)
  const [factoryName, setFactoryName]     = useState('')
  const [printJobCount, setPrintJobCount] = useState(0)

  // Load printer
  const loadPrinter = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem('selectedPrinter')
      if (raw) {
        try {
          const parsed = JSON.parse(raw)
          setPrinterName(parsed.name || parsed.address || null)
        } catch {
          setPrinterName(raw)
        }
      } else {
        setPrinterName(null)
      }
    } catch (e) {
      console.error('Failed to load printer info', e)
    } finally {
      setPrinterLoading(false)
    }
  }, [])

  // Load factory name from same cache as Dashboard / Header
  const loadFactory = useCallback(async () => {
    const settings = await getFactorySettings()
    if (settings.name) setFactoryName(settings.name)
  }, [])

  // Print queue count
  const loadPrintCount = useCallback(async () => {
    const jobs = await getPrintJobs()
    setPrintJobCount(jobs.length)
  }, [])

  useEffect(() => {
    loadPrinter()
    loadFactory()
    loadPrintCount()
    const unsub = subscribeToPrintQueue(loadPrintCount)
    return unsub
  }, [loadPrinter, loadFactory, loadPrintCount])

  const handleLogout = () => {
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: async () => {
          try { await signOut() }
          catch { Alert.alert('Error', 'Could not log out. Please try again.') }
        },
      },
    ])
  }

  const initials    = user?.name  ? getInitials(user.name) : '?'
  const displayName = user?.name  ?? 'Unknown'
  const role        = user?.role  ?? 'Clerk'
  const factory     = factoryName || 'Factory'

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* ── Profile card ─────────────────────────────────────────────────── */}
      <View style={styles.profileCard}>
        <View style={styles.profileAvatar}>
          <Text style={styles.profileInitials}>{initials}</Text>
        </View>
        <View style={styles.profileText}>
          <Text style={styles.profileName}>{displayName}</Text>
          <Text style={styles.profileRole}>
            {role.replace('_', ' ').toUpperCase()} · {factory.toUpperCase()}
          </Text>
        </View>
      </View>

      {/* ── Device ───────────────────────────────────────────────────────── */}
      <GroupLabel label="Device" />
      <View style={styles.card}>
        <MenuRow
          label="Printer"
          value={printerLoading ? undefined : (printerName ?? 'Not configured')}
          loading={printerLoading}
          onPress={() => navigation.navigate('PrinterSettings')}
          isFirst
          isLast={false}
        />
        <MenuRow
          label="PIN Lock"
          onPress={() => navigation.navigate('PinLock')}
          isFirst={false}
          isLast
        />
      </View>

      {/* ── Data & Sync ───────────────────────────────────────────────────── */}
      <GroupLabel label="Data & Sync" />
      <View style={styles.card}>
        <MenuRow
          label="Print Queue"
          badge={printJobCount}
          onPress={() => navigation.navigate('PrintQueue')}
          isFirst
          isLast={false}
        />
        <MenuRow
          label="Sync Logs"
          onPress={() => navigation.navigate('SyncLogs')}
          isFirst={false}
          isLast
        />
      </View>

      {/* ── Account ───────────────────────────────────────────────────────── */}
      <GroupLabel label="Account" />
      <View style={styles.card}>
        <MenuRow
          label="Log Out"
          danger
          onPress={handleLogout}
          isFirst
          isLast
        />
      </View>
    </ScrollView>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  content:   { padding: 18, paddingBottom: 48 },

  // Profile card
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BRAND_DARK,
    borderRadius: 18,
    padding: 20,
    marginBottom: 28,
    gap: 14,
  },
  profileAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: UMBER,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileInitials: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 20,
    letterSpacing: 0.5,
  },
  profileText: { gap: 4 },
  profileName: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
  profileRole: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    letterSpacing: 0.1,
  },

  // Section label
  groupLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: MUTED,
    letterSpacing: 0.1,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginLeft: 2,
  },

  // Card container
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: LINE,
    overflow: 'hidden',
    marginBottom: 22,
  },

  // Row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  rowFirst:     { borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  rowLast:      { borderBottomLeftRadius: 16, borderBottomRightRadius: 16 },
  rowBorder:    { borderBottomWidth: 1, borderBottomColor: LINE },
  rowDangerBg:  {},
  rowLabel:     { flex: 1, fontSize: 15, fontWeight: '600', color: BRAND_DARK },
  rowLabelDanger: { color: DANGER },
  rowRight:     { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowValue:     { fontSize: 13, color: MUTED, fontWeight: '500' },
  rowBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: DANGER,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
  },
  rowBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  rowChev:      { fontSize: 18, color: MUTED, lineHeight: 20 },
  rowChevDanger: { color: DANGER },
})