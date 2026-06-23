import { useEffect, useState } from 'react';
import eventEmitter from '../services/eventEmitter';
import { getUnsyncedCount } from '../db';

export const useSyncStatus = () => {
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  const refreshPendingCount = async () => {
    const count = await getUnsyncedCount();
    setPendingCount(count);
  };

  useEffect(() => {
    refreshPendingCount(); // load initial count

    const onSyncStarted = (count: number) => {
      setIsSyncing(true);
      setPendingCount(count);
    };
    const onSyncFinished = async ({ remainingCount }: { remainingCount: number }) => {
      setIsSyncing(false);
      setPendingCount(remainingCount);
    };

    eventEmitter.on('syncStarted', onSyncStarted);
    eventEmitter.on('syncFinished', onSyncFinished);

    return () => {
      eventEmitter.off('syncStarted', onSyncStarted);
      eventEmitter.off('syncFinished', onSyncFinished);
    };
  }, []);

  return { isSyncing, pendingCount, refreshPendingCount };
};