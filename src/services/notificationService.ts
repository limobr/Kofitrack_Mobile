// src/services/notificationService.ts
//
// Mobile counterpart of the web app's /api/notifications* routes
// (see backend src/app/api/notifications/**). Same endpoints, same
// response shapes -- the backend's getAuthenticatedUser() already
// accepts the mobile Bearer token, so no server changes were needed.
import api from '../api/client';

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: string;
  priority: string;
  isRead: boolean;
  readAt: string | null;
  actionUrl: string | null;
  createdAt: string;
}

export async function fetchUnreadCount(): Promise<number> {
  const { data } = await api.get('/notifications/unread-count');
  return data.count ?? 0;
}

export async function fetchNotifications(): Promise<NotificationItem[]> {
  const { data } = await api.get('/notifications');
  return data.notifications ?? [];
}

export async function markNotificationRead(id: string): Promise<void> {
  await api.patch(`/notifications/${id}`);
}

export async function markAllNotificationsRead(): Promise<void> {
  await api.post('/notifications/mark-all-read');
}
