// src/services/syncService.ts
import NetInfo from '@react-native-community/netinfo';
import api from '../api/client';
import {
  getDeliveriesToSync,
  updateDeliveryState,
  addSyncLog,
  markDeliverySynced,
} from '../db';
import eventEmitter from './eventEmitter';

const syncingInProgress = new Set<string>();
const getRetryDelay = (attempt: number): number => {
  switch (attempt) {
    case 0: return 30;
    case 1: return 60;
    case 2: return 300;
    case 3: return 900;
    default: return 3600;
  }
};

export const syncPendingDeliveries = async () => {
  const netState = await NetInfo.fetch();
  if (!netState.isConnected || !netState.isInternetReachable) return;

  const pending = await getDeliveriesToSync();
  if (pending.length === 0) return;

  eventEmitter.emit('syncStarted', pending.length);

  for (const delivery of pending) {
    if (syncingInProgress.has(delivery.local_uuid)) continue;
    syncingInProgress.add(delivery.local_uuid);

    const attempt = (delivery.retry_count || 0) + 1;

    try {
      // 1. Mark as syncing
      await updateDeliveryState(delivery.local_uuid, {
        status: 'syncing',
        last_attempt_at: new Date().toISOString(),
        retry_count: attempt,
        next_retry_at: null,
      });
      await addSyncLog({
        local_uuid: delivery.local_uuid,
        client_uuid: delivery.client_uuid,
        attempt_no: attempt,
        operation: 'sync_start',
        status: 'syncing',
      });

      // 2. POST to server
      const response = await api.post('/deliveries', {
        type: delivery.coffee_type,
        memberId: delivery.member_id,
        kgs: delivery.kgs,
        client_uuid: delivery.client_uuid,
        recording_type: 'offline_sync',
      });

      const data = response.data;
      if (!data.confirmed) throw new Error('Server did not confirm delivery');

      await addSyncLog({
        local_uuid: delivery.local_uuid,
        client_uuid: delivery.client_uuid,
        attempt_no: attempt,
        operation: 'post_success',
        status: 'syncing',
        server_response: JSON.stringify(data),
      });

      // 3. Verification step
      await updateDeliveryState(delivery.local_uuid, { status: 'verifying' });
      const verifyRes = await api.get(`/deliveries?client_uuid=${delivery.client_uuid}`);
      const verifyData = verifyRes.data;

      if (!verifyData.exists || verifyData.client_uuid !== delivery.client_uuid) {
        throw new Error('Verification failed: delivery not found on server');
      }

      await addSyncLog({
        local_uuid: delivery.local_uuid,
        client_uuid: delivery.client_uuid,
        attempt_no: attempt,
        operation: 'verification_success',
        status: 'verifying',
        server_response: JSON.stringify(verifyData),
      });

      // 4. Mark synced
      const receiptNo = verifyData.receipt_no;
      await markDeliverySynced(delivery.local_uuid, receiptNo);

      await addSyncLog({
        local_uuid: delivery.local_uuid,
        client_uuid: delivery.client_uuid,
        attempt_no: attempt,
        operation: 'sync_complete',
        status: 'synced',
        server_response: receiptNo,
      });

    } catch (error: any) {
      console.error(`Sync failed for ${delivery.local_uuid}:`, error);

      const newRetryCount = attempt;
      const delaySeconds = getRetryDelay(newRetryCount);
      const nextRetryAt = new Date(Date.now() + delaySeconds * 1000).toISOString();

      await updateDeliveryState(delivery.local_uuid, {
        status: 'failed',
        sync_error: error.message || 'Unknown error',
        next_retry_at: nextRetryAt,
      });

      await addSyncLog({
        local_uuid: delivery.local_uuid,
        client_uuid: delivery.client_uuid,
        attempt_no: newRetryCount,
        operation: 'sync_failed',
        status: 'failed',
        error_message: error.message,
      });
    } finally {
      syncingInProgress.delete(delivery.local_uuid);
    }
  }

  const remaining = await getDeliveriesToSync();
  eventEmitter.emit('syncFinished', { syncedCount: pending.length - remaining.length, failedCount: remaining.length });
};

export const startSyncListener = () => {
  NetInfo.addEventListener(async (state) => {
    if (state.isConnected && state.isInternetReachable) {
      await syncPendingDeliveries();
    }
  });
};