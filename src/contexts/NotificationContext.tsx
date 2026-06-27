// src/contexts/NotificationContext.tsx
//
// Single source of truth for notification state.
// Replaces the per-component polling in useNotifications.ts with a
// purely event-driven model:
//   - On app launch (user signs in)
//   - On app foreground (AppState "active")
//   - On useFocusEffect in key screens (call refreshUnreadCount())
//   - When the user opens/closes the notification panel
//   - Never on a timer.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AppState, AppStateStatus } from 'react-native';
import {
  fetchUnreadCount,
  fetchNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  NotificationItem,
} from '../services/notificationService';

// ─── Types ────────────────────────────────────────────────────────────────────

interface NotificationContextValue {
  /** Badge count — kept in sync without polling */
  unreadCount: number;

  /** Full notification list — only fetched when the panel is opened */
  notifications: NotificationItem[];
  listLoading: boolean;
  listLoaded: boolean;

  /**
   * Refresh the unread badge count.
   * Call this from:
   *  - useFocusEffect on Dashboard, Deliveries, Transactions, Members, Reports
   *  - AppState "active" handler (already wired here)
   *  - After any action that may produce a notification (record delivery, etc.)
   */
  refreshUnreadCount: () => Promise<void>;

  /** Fetch the full list — called automatically when the panel opens */
  refreshList: () => Promise<void>;

  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

interface Props {
  children: React.ReactNode;
  /** Pass false when no user is signed in to suppress all network calls */
  enabled: boolean;
}

export function NotificationProvider({ children, enabled }: Props) {
  const [unreadCount, setUnreadCount]   = useState(0);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [listLoading, setListLoading]   = useState(false);
  const [listLoaded, setListLoaded]     = useState(false);

  // Guard against concurrent refreshes firing the same request twice
  const fetchingCount = useRef(false);
  const fetchingList  = useRef(false);

  // ── Unread count ──────────────────────────────────────────────────────────

  const refreshUnreadCount = useCallback(async () => {
    if (!enabled || fetchingCount.current) return;
    fetchingCount.current = true;
    try {
      const count = await fetchUnreadCount();
      setUnreadCount(count);
    } catch {
      // Silent — badge just stays as-is until the next trigger
    } finally {
      fetchingCount.current = false;
    }
  }, [enabled]);

  // ── Full list ─────────────────────────────────────────────────────────────

  const refreshList = useCallback(async () => {
    if (!enabled || fetchingList.current) return;
    fetchingList.current = true;
    setListLoading(true);
    try {
      const items = await fetchNotifications();
      setNotifications(items);
      setListLoaded(true);
      // Sync the badge with what the server just told us
      setUnreadCount(items.filter((n) => !n.isRead).length);
    } catch {
      // Leave whatever was already loaded in place
    } finally {
      setListLoading(false);
      fetchingList.current = false;
    }
  }, [enabled]);

  // ── Trigger 1: app launch / sign-in ──────────────────────────────────────

  useEffect(() => {
    if (!enabled) {
      // User signed out — reset state
      setUnreadCount(0);
      setNotifications([]);
      setListLoaded(false);
      return;
    }
    refreshUnreadCount();
  }, [enabled]); // intentionally omitting refreshUnreadCount — stable ref

  // ── Trigger 2: app foreground ─────────────────────────────────────────────

  useEffect(() => {
    if (!enabled) return;

    const onAppStateChange = (state: AppStateStatus) => {
      if (state === 'active') {
        refreshUnreadCount();
      }
    };

    const sub = AppState.addEventListener('change', onAppStateChange);
    return () => sub.remove();
  }, [enabled, refreshUnreadCount]);

  // ── Mark read / mark all ──────────────────────────────────────────────────

  const markRead = useCallback(async (id: string) => {
    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
    try {
      await markNotificationRead(id);
    } catch {
      // Best-effort; next refreshUnreadCount corrects any drift
    }
  }, []);

  const markAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
    try {
      await markAllNotificationsRead();
    } catch {
      // Best-effort
    }
  }, []);

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <NotificationContext.Provider
      value={{
        unreadCount,
        notifications,
        listLoading,
        listLoaded,
        refreshUnreadCount,
        refreshList,
        markRead,
        markAllRead,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useNotificationContext(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error(
      'useNotificationContext must be used inside <NotificationProvider>'
    );
  }
  return ctx;
}
