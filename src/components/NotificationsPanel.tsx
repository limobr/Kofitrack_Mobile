import React, { useEffect } from 'react'
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  FlatList,
  StyleSheet,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { NotificationItem } from '../services/notificationService'
import type { UseNotificationsReturn } from '../hooks/useNotifications'

interface NotificationsPanelProps {
  open: boolean
  onClose: () => void
  notificationsHook: UseNotificationsReturn
}

// Same hand-rolled relative time formatting as the web panel
// (backend src/components/NotificationsPanel.tsx) -- kept consistent
// rather than pulling in a date library for one more place that needs it.
function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`
  return `${Math.floor(diffMins / 1440)}d ago`
}

const TYPE_LABEL: Record<string, string> = {
  PAYMENT: 'Payment',
  ADVANCE: 'Advance',
  RATE: 'Rate',
  SEASON: 'Season',
  MEMBER: 'Member',
  SECURITY: 'Security',
  SMS: 'SMS',
  SYSTEM: 'System',
}

function NotificationRow({
  notification,
  onRead,
}: {
  notification: NotificationItem
  onRead: (id: string) => void
}) {
  // Mobile has no equivalent of the web's per-page actionUrl routes, so
  // tapping just marks the notification read rather than trying to
  // navigate anywhere.
  const handlePress = () => {
    if (!notification.isRead) onRead(notification.id)
  }

  return (
    <TouchableOpacity
      style={[styles.row, !notification.isRead && styles.rowUnread]}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      <View style={styles.rowTop}>
        <View style={styles.typeTag}>
          <Text style={styles.typeTagText}>
            {TYPE_LABEL[notification.type] || notification.type}
          </Text>
        </View>
        <Text style={styles.time}>{relativeTime(notification.createdAt)}</Text>
      </View>
      <Text style={styles.rowTitle}>{notification.title}</Text>
      <Text style={styles.rowMessage}>{notification.message}</Text>
      {!notification.isRead && <View style={styles.dot} />}
    </TouchableOpacity>
  )
}

export default function NotificationsPanel({ open, onClose, notificationsHook }: NotificationsPanelProps) {
  const { notifications, listLoading, listLoaded, refreshList, markRead, markAllRead, unreadCount } =
    notificationsHook
  const insets = useSafeAreaInsets()

  // Fetch the full list lazily, only the first time the panel is opened --
  // the badge count already polls on its own.
  useEffect(() => {
    if (open && !listLoaded) refreshList()
  }, [open, listLoaded, refreshList])

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay} />
      </TouchableWithoutFeedback>

      <View style={[styles.panel, { top: insets.top + 56 }]}>
        <View style={styles.header}>
          <Text style={styles.heading}>Notifications</Text>
          {unreadCount > 0 && (
            <TouchableOpacity onPress={markAllRead}>
              <Text style={styles.markAllBtn}>Mark all as read</Text>
            </TouchableOpacity>
          )}
        </View>

        {listLoading && !listLoaded ? (
          <Text style={styles.emptyState}>Loading…</Text>
        ) : notifications.length === 0 ? (
          <View style={styles.emptyStateBox}>
            <Text style={styles.emptyTitle}>You&rsquo;re all caught up</Text>
            <Text style={styles.emptySubtitle}>
              New activity on payments, rates, and your account will show up here.
            </Text>
          </View>
        ) : (
          <FlatList
            data={notifications}
            keyExtractor={(n) => n.id}
            style={styles.list}
            renderItem={({ item }) => <NotificationRow notification={item} onRead={markRead} />}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        )}
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  panel: {
    position: 'absolute',
    right: 16,
    left: 16,
    maxHeight: 420,
    backgroundColor: '#faf9f6',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#d9d0c7',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#d9d0c7',
  },
  heading: {
    fontSize: 16,
    fontWeight: '700',
    color: '#3d2b1f',
  },
  markAllBtn: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8c6239',
  },
  list: {
    maxHeight: 360,
  },
  separator: {
    height: 1,
    backgroundColor: '#ede8e2',
  },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    position: 'relative',
  },
  rowUnread: {
    backgroundColor: '#fffbf0',
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  typeTag: {
    backgroundColor: '#f0ece6',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  typeTagText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6b5e53',
  },
  time: {
    fontSize: 11,
    color: '#9e8e7e',
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#3d2b1f',
    marginBottom: 2,
  },
  rowMessage: {
    fontSize: 13,
    color: '#6b5e53',
  },
  dot: {
    position: 'absolute',
    top: 14,
    right: 16,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#1565c0',
  },
  emptyState: {
    padding: 24,
    textAlign: 'center',
    color: '#9e8e7e',
    fontSize: 13,
  },
  emptyStateBox: {
    padding: 24,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#3d2b1f',
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#9e8e7e',
    textAlign: 'center',
  },
})
