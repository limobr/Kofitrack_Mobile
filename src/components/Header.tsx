import React, { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../navigation/types'
import { useAuth } from '../contexts/AuthContext'
import { useNotifications } from '../hooks/useNotifications'
import NotificationsPanel from './NotificationsPanel'
import PrintQueueModal from './PrintQueueModal'
import { getPrintJobs, subscribeToPrintQueue } from '../services/printQueue'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { getFactorySettings } from '../services/factorySettingsCache'
import { isBluetoothEnabled } from '../services/bluetoothClassic'

type NavigationProp = NativeStackNavigationProp<RootStackParamList>

interface Props {
  title: string
  showBack?: boolean
  showAccount?: boolean
  onBackPress?: () => void
  leftElement?: React.ReactNode
  rightElement?: React.ReactNode
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0] ?? '')
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

// ─── Colour tokens ────────────────────────────────────────────────────────────
const BRAND_DARK = '#2E2018'
const UMBER      = '#8C6239'
const LINE       = '#E4DBCB'
const MUTED      = '#8A7C6B'
const BG         = '#FAF7F1'
const TERRACOTTA = '#C8623D'

export default function Header({
  title,
  showBack = false,
  showAccount = false,
  onBackPress,
  leftElement,
  rightElement,
}: Props) {
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<NavigationProp>()
  const { user } = useAuth()

  const notifications = useNotifications(!!user)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [printQueueOpen, setPrintQueueOpen] = useState(false)
  const [printJobCount, setPrintJobCount] = useState(0)
  const [factoryName, setFactoryName] = useState('')
  const [needsAttention, setNeedsAttention] = useState(false)

  // Load factory name from cache (same source as Dashboard)
  useEffect(() => {
    getFactorySettings().then((settings) => {
      if (settings.name) setFactoryName(settings.name)
    })
  }, [])

  const refreshPrintCount = useCallback(async () => {
    const jobs = await getPrintJobs()
    setPrintJobCount(jobs.length)
  }, [])

  // Attention dot: show when print pref is ON + Bluetooth off, OR any jobs are queued/failed
  const checkAttention = useCallback(async () => {
    try {
      const jobs = await getPrintJobs()
      // Any pending or failed jobs = attention needed
      if (jobs.length > 0) {
        setNeedsAttention(true)
        return
      }
      // Print preference ON but Bluetooth off
      const pref = await AsyncStorage.getItem('printReceiptPreference')
      if (pref === 'true') {
        const enabled = await isBluetoothEnabled()
        if (!enabled) { setNeedsAttention(true); return }
      }
      setNeedsAttention(false)
    } catch (_) {}
  }, [])

  useEffect(() => {
    if (!showAccount) return
    refreshPrintCount()
    checkAttention()
    const unsub = subscribeToPrintQueue(() => {
      refreshPrintCount()
      checkAttention()
    })
    return unsub
  }, [showAccount, refreshPrintCount, checkAttention])

  const handleBack = onBackPress || (() => navigation.goBack())

  const isMainHeader = showAccount && !showBack

  // ── Right-side actions (main header only) ─────────────────────────────────
  const renderMainActions = () => {
    if (rightElement) return rightElement

    const initials = user?.name ? getInitials(user.name) : '?'

    return (
      <View style={styles.rightGroup}>
        {/* Notifications */}
        <TouchableOpacity
          onPress={() => setNotificationsOpen((v) => !v)}
          style={styles.iconButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel={
            notifications.unreadCount > 0
              ? `Notifications, ${notifications.unreadCount} unread`
              : 'Notifications'
          }
        >
          {/* Bell drawn from Views — no icon library */}
          <View style={styles.bellWrap}>
            <View style={styles.bellCup} />
            <View style={styles.bellClapper} />
          </View>
          {notifications.unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {notifications.unreadCount > 9 ? '9+' : notifications.unreadCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Avatar — opens Settings; red dot when attention needed */}
        <TouchableOpacity
          onPress={() => navigation.navigate('Account')}
          style={styles.avatarWrap}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel={needsAttention ? 'Open settings — attention required' : 'Open settings'}
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          {needsAttention && <View style={styles.attentionDot} />}
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + (isMainHeader ? 12 : 6) }]}>
      {isMainHeader ? (
        // ── Full brand header for the four main tabs ────────────────────────
        <>
          <View style={styles.brandRow}>
            {/* Brand glyph + factory name */}
            <View style={styles.brandMark}>
              <View style={styles.brandGlyph}>
                <Text style={styles.brandGlyphText}>K</Text>
              </View>
              <View>
                <Text style={styles.factoryLabel} numberOfLines={1}>
                  {factoryName || 'KofiTrack'}
                </Text>
                <Text style={styles.factoryMeta}>FACTORY</Text>
              </View>
            </View>

            {renderMainActions()}
          </View>

          {/* Page title */}
          <View style={styles.pageTitleRow}>
            <Text style={styles.pageTitle}>{title}</Text>
          </View>
        </>
      ) : (
        // ── Compact header for stack screens (back button) ──────────────────
        <View style={styles.compactInner}>
          {leftElement ?? (
            showBack ? (
              <TouchableOpacity
                onPress={handleBack}
                style={styles.backButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityLabel="Go back"
              >
                <View style={styles.backArrowWrap}>
                  <View style={styles.backArrowStem} />
                  <View style={styles.backArrowHead} />
                </View>
              </TouchableOpacity>
            ) : (
              <View style={styles.compactSpacer} />
            )
          )}

          <Text style={styles.compactTitle} numberOfLines={1}>
            {title}
          </Text>

          {/* Right side: custom element if provided, otherwise a mirror spacer
              to keep the title optically centred */}
          {rightElement ? (
            <View style={styles.compactRight}>{rightElement}</View>
          ) : (
            <View style={styles.compactSpacer} />
          )}
        </View>
      )}

      {/* Panels — rendered outside the layout flow */}
      {showAccount && (
        <>
          <NotificationsPanel
            open={notificationsOpen}
            onClose={() => setNotificationsOpen(false)}
            notificationsHook={notifications}
          />
          <PrintQueueModal
            visible={printQueueOpen}
            onClose={() => setPrintQueueOpen(false)}
          />
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: BG,
    paddingHorizontal: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
  },

  // ── Brand / main header ──────────────────────────────────────────────────
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandMark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 12,
  },
  brandGlyph: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: BRAND_DARK,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  brandGlyphText: {
    color: BG,
    fontWeight: '700',
    fontSize: 15,
  },
  factoryLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: BRAND_DARK,
    letterSpacing: 0.1,
  },
  factoryMeta: {
    fontSize: 10,
    color: MUTED,
    letterSpacing: 0.08,
    marginTop: 1,
  },
  pageTitleRow: {
    marginTop: 14,
  },
  pageTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: BRAND_DARK,
    letterSpacing: -0.3,
  },

  // ── Right-side action buttons ────────────────────────────────────────────
  rightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 0,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: LINE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Bell: a rounded rectangle body + a small base bar
  bellWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 18,
    height: 18,
  },
  bellCup: {
    width: 12,
    height: 10,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    borderWidth: 2,
    borderColor: BRAND_DARK,
    backgroundColor: 'transparent',
  },
  bellClapper: {
    width: 6,
    height: 3,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
    backgroundColor: BRAND_DARK,
    marginTop: -1,
  },
  avatarWrap: {
    position: 'relative',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: UMBER,
    justifyContent: 'center',
    alignItems: 'center',
  },
  attentionDot: {
    position: 'absolute',
    top: -3,
    right: -3,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#E53E3E',
    borderWidth: 1.5,
    borderColor: BG,
  },
  avatarText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
    letterSpacing: 0.5,
  },
  badge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: TERRACOTTA,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: BG,
  },
  badgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 11,
  },

  // ── Compact (back-button) header ─────────────────────────────────────────
  compactInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 2,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: LINE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Back arrow: a horizontal stem + a diagonal tick, both drawn as thin Views
  backArrowWrap: {
    width: 16,
    height: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backArrowStem: {
    position: 'absolute',
    width: 12,
    height: 2,
    borderRadius: 1,
    backgroundColor: BRAND_DARK,
  },
  backArrowHead: {
    position: 'absolute',
    left: 1,
    width: 8,
    height: 8,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    borderColor: BRAND_DARK,
    borderRadius: 1,
    transform: [{ rotate: '45deg' }],
  },
  compactTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: BRAND_DARK,
    textAlign: 'center',
    marginHorizontal: 8,
  },
  compactSpacer: {
    width: 36,
  },
  compactRight: {
    flexShrink: 0,
  },
})