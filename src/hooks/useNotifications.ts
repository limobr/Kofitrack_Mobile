import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import {
  fetchUnreadCount,
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  NotificationItem,
} from '../services/notificationService';

// Mirrors the web hook (backend src/hooks/useNotifications.ts): poll just
// the cheap unread count for the badge, fetch the full list lazily only
// once the panel is actually opened.
const UNREAD_COUNT_POLL_MS = 30 * 1000;

export function useNotifications(enabled: boolean = true) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listLoaded, setListLoaded] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshUnreadCount = useCallback(async () => {
    if (!enabled) return;
    try {
      const count = await fetchUnreadCount();
      setUnreadCount(count);
    } catch {
      // Silent -- a missed poll just leaves the badge stale for one cycle.
    }
  }, [enabled]);

  const refreshList = useCallback(async () => {
    if (!enabled) return;
    setListLoading(true);
    try {
      const items = await fetchNotifications();
      setNotifications(items);
      setListLoaded(true);
    } catch {
      // Leave whatever list was already loaded in place.
    } finally {
      setListLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    refreshUnreadCount();
    pollRef.current = setInterval(refreshUnreadCount, UNREAD_COUNT_POLL_MS);

    // Pause polling while the app is backgrounded, and refresh immediately
    // on foreground so the badge isn't stale after the device was asleep.
    const onAppStateChange = (state: AppStateStatus) => {
      if (state === 'active') {
        refreshUnreadCount();
        if (!pollRef.current) {
          pollRef.current = setInterval(refreshUnreadCount, UNREAD_COUNT_POLL_MS);
        }
      } else if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
    const subscription = AppState.addEventListener('change', onAppStateChange);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      subscription.remove();
    };
  }, [enabled, refreshUnreadCount]);

  const markRead = useCallback(async (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)));
    setUnreadCount((prev) => Math.max(0, prev - 1));
    try {
      await markNotificationRead(id);
    } catch {
      // Best-effort; a failed mark-read just gets corrected on next refresh.
    }
  }, []);

  const markAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
    try {
      await markAllNotificationsRead();
    } catch {
      // Best-effort; a failed mark-all-read just gets corrected on next refresh.
    }
  }, []);

  return {
    unreadCount,
    notifications,
    listLoading,
    listLoaded,
    refreshList,
    refreshUnreadCount,
    markRead,
    markAllRead,
  };
}

export type UseNotificationsReturn = ReturnType<typeof useNotifications>;
