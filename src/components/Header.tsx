import React, { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../navigation/types'
import { useAuth } from '../contexts/AuthContext'
import { useNotifications } from '../hooks/useNotifications'
import NotificationsPanel from './NotificationsPanel'

type NavigationProp = NativeStackNavigationProp<RootStackParamList>

interface Props {
  title: string
  showBack?: boolean
  showAccount?: boolean
  onBackPress?: () => void
  leftElement?: React.ReactNode
  rightElement?: React.ReactNode
}

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

  // Same signal the web Header uses ("authenticated and on a gated
  // route") to decide whether it's even worth polling -- here that's just
  // "is someone logged in," since the bell only ever renders inside the
  // authenticated tab stack anyway (see showAccount usage in AppNavigator).
  const notifications = useNotifications(!!user)
  const [notificationsOpen, setNotificationsOpen] = useState(false)

  const handleBack = onBackPress || (() => navigation.goBack())

  const renderLeft = () => {
    if (leftElement) return leftElement
    if (showBack) {
      return (
        <TouchableOpacity
          onPress={handleBack}
          style={styles.leftButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="arrow-back" size={22} color="#3d2b1f" />
        </TouchableOpacity>
      )
    }
    return <View style={styles.leftPlaceholder} />
  }

  const renderRight = () => {
    if (rightElement) return rightElement
    if (showAccount) {
      return (
        <View style={styles.rightGroup}>
          <TouchableOpacity
            onPress={() => setNotificationsOpen((v) => !v)}
            style={styles.rightButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel={
              notifications.unreadCount > 0
                ? `Notifications, ${notifications.unreadCount} unread`
                : 'Notifications'
            }
          >
            <Ionicons name="notifications-outline" size={22} color="#3d2b1f" />
            {notifications.unreadCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {notifications.unreadCount > 9 ? '9+' : notifications.unreadCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => navigation.navigate('Account')}
            style={styles.rightButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="settings-outline" size={22} color="#3d2b1f" />
          </TouchableOpacity>
        </View>
      )
    }
    return <View style={styles.rightPlaceholder} />
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <View style={styles.inner}>
        {renderLeft()}
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {renderRight()}
      </View>

      {showAccount && (
        <NotificationsPanel
          open={notificationsOpen}
          onClose={() => setNotificationsOpen(false)}
          notificationsHook={notifications}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#faf9f6',
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#d9d0c7',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  leftButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f0ece6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  leftPlaceholder: { width: 36 },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#3d2b1f',
    textAlign: 'center',
    flex: 1,
  },
  rightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rightButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f0ece6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rightPlaceholder: { width: 36 },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#dc2626',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#faf9f6',
  },
  badgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 11,
  },
})