// src/hooks/useNotifications.ts
//
// Thin re-export that delegates to NotificationContext.
// All components that previously called useNotifications() directly
// now share the same singleton state — no more per-instance polling.
//
// The `enabled` parameter is kept for API compatibility but is now a
// no-op: the provider (in App.tsx) is the single place that gates on
// whether a user is signed in.

import { useNotificationContext } from '../contexts/NotificationContext';

export function useNotifications(_enabled: boolean = true) {
  return useNotificationContext();
}

export type UseNotificationsReturn = ReturnType<typeof useNotifications>;