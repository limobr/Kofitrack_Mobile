// src/hooks/useRefreshNotificationsOnFocus.ts
//
// Drop this into any screen that should trigger a notification badge
// refresh when the user navigates to it:
//
//   Dashboard, Deliveries, Transactions, Members, Reports
//
// Usage (one line per screen):
//
//   import { useRefreshNotificationsOnFocus } from '../hooks/useRefreshNotificationsOnFocus'
//   // inside the component:
//   useRefreshNotificationsOnFocus()
//
// That's it — no other wiring needed.

import { useCallback } from 'react'
import { useFocusEffect } from '@react-navigation/native'
import { useNotificationContext } from '../contexts/NotificationContext'

export function useRefreshNotificationsOnFocus() {
  const { refreshUnreadCount } = useNotificationContext()

  useFocusEffect(
    useCallback(() => {
      refreshUnreadCount()
    }, [refreshUnreadCount])
  )
}
