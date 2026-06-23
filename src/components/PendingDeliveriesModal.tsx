import React, { useRef } from 'react';
import {
  View, Text, FlatList, StyleSheet, Modal, TouchableOpacity,
  Animated, ActivityIndicator, Alert, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { height: screenHeight } = Dimensions.get('window');

interface PendingDelivery {
  id: number;
  local_uuid: string;
  client_uuid: string;
  coffee_type: string;
  member_id: string;
  member_name: string;
  kgs: number;
  recorded_at: string;
  status: string;
  retry_count: number;
  sync_error: string | null;
}

interface Props {
  visible: boolean;
  pendingDeliveries: PendingDelivery[];
  loadingPending: boolean;
  syncingPendingId: string | null;
  onClose: () => void;
  onSyncAll: () => void;
  onSyncSingle: (item: PendingDelivery) => void;
  onDelete: (local_uuid: string) => void;
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'synced': return '#2e7d32';
    case 'failed': return '#c62828';
    case 'syncing': return '#8c6239';
    case 'verifying': return '#f59e0b';
    default: return '#6b5e53';
  }
};

export default function PendingDeliveriesModal({
  visible,
  pendingDeliveries,
  loadingPending,
  syncingPendingId,
  onClose,
  onSyncAll,
  onSyncSingle,
  onDelete,
}: Props) {
  const slideAnim = useRef(new Animated.Value(screenHeight)).current;

  React.useEffect(() => {
    if (visible) {
      Animated.timing(slideAnim, {
        toValue: 0, duration: 300, useNativeDriver: true,
      }).start();
    } else {
      slideAnim.setValue(screenHeight);
    }
  }, [visible]);

  const handleClose = () => {
    Animated.timing(slideAnim, {
      toValue: screenHeight, duration: 300, useNativeDriver: true,
    }).start(() => onClose());
  };

  const confirmDelete = (local_uuid: string) => {
    Alert.alert('Delete Pending', 'Remove from queue?', [
      { text: 'Cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onDelete(local_uuid) },
    ]);
  };

  const renderItem = ({ item }: { item: PendingDelivery }) => (
    <View style={styles.pendingCard}>
      <View style={styles.pendingHeader}>
        <Text style={styles.pendingMember}>{item.member_name}</Text>
        <Text style={styles.pendingKgs}>{item.kgs} kg</Text>
      </View>
      <Text style={styles.pendingDate}>
        Recorded: {new Date(item.recorded_at).toLocaleString()}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, marginBottom: 6 }}>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
          <Text style={styles.statusBadgeText}>{item.status.toUpperCase()}</Text>
        </View>
        {item.retry_count > 0 && (
          <Text style={styles.retryCount}>Retries: {item.retry_count}</Text>
        )}
      </View>
      {item.sync_error && (
        <Text style={styles.pendingError}>Error: {item.sync_error}</Text>
      )}
      <View style={styles.pendingActions}>
        {(item.status === 'pending' || item.status === 'failed') && (
          <TouchableOpacity
            style={styles.pendingSyncBtn}
            onPress={() => onSyncSingle(item)}
            disabled={syncingPendingId === item.local_uuid}
          >
            {syncingPendingId === item.local_uuid ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                <Ionicons name="sync" size={16} color="#fff" />
                <Text style={styles.pendingSyncText}>Sync</Text>
              </>
            )}
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.pendingDeleteBtn}
          onPress={() => confirmDelete(item.local_uuid)}
        >
          <Ionicons name="trash-outline" size={16} color="#c62828" />
          <Text style={styles.pendingDeleteText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="none">
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={handleClose}
      >
        <Animated.View
          style={[styles.container, { transform: [{ translateY: slideAnim }] }]}
        >
          <TouchableOpacity activeOpacity={1} style={styles.content}>
            {/* Handle bar */}
            <View style={styles.handleBar} />

            <Text style={styles.title}>Pending Deliveries</Text>
            <Text style={styles.subtitle}>
              Saved locally. Will sync when online.
            </Text>

            {loadingPending ? (
              <ActivityIndicator size="large" color="#8c6239" style={{ marginVertical: 20 }} />
            ) : pendingDeliveries.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Ionicons name="checkmark-circle-outline" size={40} color="#2e7d32" />
                <Text style={styles.emptyText}>All caught up</Text>
              </View>
            ) : (
              <FlatList
                data={pendingDeliveries}
                keyExtractor={(item) => item.local_uuid}
                renderItem={renderItem}
                style={{ maxHeight: screenHeight * 0.55 }}
                showsVerticalScrollIndicator
              />
            )}

            <View style={styles.buttons}>
              <TouchableOpacity style={styles.cancelBtn} onPress={handleClose}>
                <Text style={styles.cancelText}>Close</Text>
              </TouchableOpacity>
              {pendingDeliveries.length > 0 && (
                <TouchableOpacity style={styles.syncAllBtn} onPress={onSyncAll}>
                  <Ionicons name="sync" size={18} color="#fff" />
                  <Text style={styles.syncAllText}>Sync All</Text>
                </TouchableOpacity>
              )}
            </View>
          </TouchableOpacity>
        </Animated.View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  container: {
    width: '100%',
    maxHeight: screenHeight * 0.9,
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  content: { padding: 20 },
  handleBar: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#d9d0c7', alignSelf: 'center', marginBottom: 16,
  },
  title: {
    fontSize: 20, fontWeight: 'bold', color: '#3d2b1f',
    textAlign: 'center', marginBottom: 6,
  },
  subtitle: {
    fontSize: 13, color: '#6b5e53', textAlign: 'center', marginBottom: 16,
  },
  emptyWrap: { alignItems: 'center', paddingVertical: 24 },
  emptyText: { fontSize: 15, color: '#2e7d32', marginTop: 8, fontWeight: '600' },
  pendingCard: {
    backgroundColor: '#fef9e7', borderRadius: 12,
    padding: 12, marginBottom: 12,
    borderWidth: 1, borderColor: '#e0d9d0',
  },
  pendingHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 6,
  },
  pendingMember: { fontSize: 16, fontWeight: '700', color: '#3d2b1f' },
  pendingKgs: { fontSize: 15, fontWeight: '600', color: '#8c6239' },
  pendingDate: { fontSize: 12, color: '#6b5e53', marginBottom: 4 },
  statusBadge: {
    borderRadius: 4, paddingHorizontal: 6,
    paddingVertical: 2, marginRight: 8,
  },
  statusBadgeText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  retryCount: { fontSize: 11, color: '#6b5e53' },
  pendingError: { fontSize: 12, color: '#c62828', marginBottom: 8 },
  pendingActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12 },
  pendingSyncBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#8c6239', paddingVertical: 6,
    paddingHorizontal: 12, borderRadius: 8,
  },
  pendingSyncText: { color: '#fff', marginLeft: 6, fontSize: 13, fontWeight: '600' },
  pendingDeleteBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', paddingVertical: 6,
    paddingHorizontal: 12, borderRadius: 8,
    borderWidth: 1, borderColor: '#c62828',
  },
  pendingDeleteText: { color: '#c62828', marginLeft: 6, fontSize: 13 },
  buttons: {
    flexDirection: 'row', justifyContent: 'space-between', marginTop: 20,
  },
  cancelBtn: {
    flex: 1, paddingVertical: 12, marginRight: 8,
    borderRadius: 10, borderWidth: 1, borderColor: '#d9d0c7',
    alignItems: 'center',
  },
  cancelText: { color: '#6b5e53', fontWeight: '600' },
  syncAllBtn: {
    flex: 1, flexDirection: 'row', justifyContent: 'center',
    alignItems: 'center', backgroundColor: '#8c6239',
    paddingVertical: 12, marginLeft: 8, borderRadius: 10,
  },
  syncAllText: { color: '#fff', fontWeight: '600', marginLeft: 8 },
});
