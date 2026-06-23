import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator,
  TouchableOpacity, RefreshControl, TextInput, Alert,
  SectionList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { getAllSyncLogs, clearSyncLogs, SyncLog } from '../db';
import Header from '../components/Header';

interface GroupedLog {
  local_uuid: string;
  logs: SyncLog[];
  latestStatus: string;
  receiptNo?: string;
  syncError?: string;
}

const operationLabels: Record<string, string> = {
  insert: '📝 Recorded offline',
  sync_start: '🔄 Sync started',
  post_success: '✅ Uploaded to server',
  verify_start: '🔍 Verifying with server',
  verification_success: '✓ Verification passed',
  sync_complete: '✔️ Delivery synced',
  sync_failed: '❌ Sync failed',
  mark_synced: '🏁 Marked synced locally',
};

export default function SyncLogsScreen() {
  const [groupedLogs, setGroupedLogs] = useState<GroupedLog[]>([]);
  const [filtered, setFiltered] = useState<GroupedLog[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'synced' | 'failed' | 'pending'>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const allLogs = await getAllSyncLogs();
      // Group by local_uuid
      const groups: Record<string, SyncLog[]> = {};
      allLogs.forEach(log => {
        const key = log.local_uuid || 'unknown';
        if (!groups[key]) groups[key] = [];
        groups[key].push(log);
      });
      // Sort logs within each group by created_at ascending
      const grouped: GroupedLog[] = Object.entries(groups).map(([uuid, logs]) => {
        logs.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        const latest = logs[logs.length - 1];
        const receiptLog = logs.find(l => l.server_response?.startsWith('CD-') || l.server_response?.startsWith('MD-'));
        return {
          local_uuid: uuid,
          logs,
          latestStatus: latest.status,
          receiptNo: receiptLog?.server_response || undefined,
          syncError: logs.find(l => l.error_message)?.error_message || undefined,
        };
      });
      // Sort groups by newest activity first
      grouped.sort((a, b) => {
        const aLatest = a.logs[a.logs.length - 1]?.created_at || '';
        const bLatest = b.logs[b.logs.length - 1]?.created_at || '';
        return bLatest.localeCompare(aLatest);
      });
      setGroupedLogs(grouped);
      applyFilters(grouped, search, statusFilter);
    } catch (error) {
      console.error('Failed to load sync logs', error);
      Alert.alert('Error', 'Could not load sync logs');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const applyFilters = (groups: GroupedLog[], searchText: string, filter: string) => {
    let result = [...groups];
    if (searchText.trim()) {
      const lower = searchText.toLowerCase();
      result = result.filter(g =>
        g.local_uuid.toLowerCase().includes(lower) ||
        (g.receiptNo && g.receiptNo.toLowerCase().includes(lower))
      );
    }
    if (filter !== 'all') {
      result = result.filter(g => g.latestStatus === filter);
    }
    setFiltered(result);
  };

  useEffect(() => {
    applyFilters(groupedLogs, search, statusFilter);
  }, [search, statusFilter, groupedLogs]);

  useFocusEffect(
    useCallback(() => {
      loadLogs();
    }, [])
  );

  const handleRefresh = () => {
    setRefreshing(true);
    loadLogs();
  };

  const handleClearLogs = () => {
    Alert.alert(
      'Clear Logs',
      'Are you sure you want to delete all sync logs? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await clearSyncLogs();
            await loadLogs();
          },
        },
      ]
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'synced': return '#2e7d32';
      case 'failed': return '#c62828';
      case 'syncing': return '#f59e0b';
      default: return '#6b5e53';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'synced': return 'checkmark-circle';
      case 'failed': return 'alert-circle';
      case 'syncing': return 'sync';
      default: return 'time-outline';
    }
  };

  const renderGroup = ({ item }: { item: GroupedLog }) => {
    const statusColor = getStatusColor(item.latestStatus);
    const statusIcon = getStatusIcon(item.latestStatus);
    const date = new Date(item.logs[item.logs.length - 1]?.created_at).toLocaleString();
    return (
      <View style={styles.groupCard}>
        <View style={styles.groupHeader}>
          <View style={styles.groupTitleRow}>
            <Ionicons name={statusIcon} size={20} color={statusColor} />
            <Text style={styles.groupUuid}>Delivery: {item.local_uuid.slice(-12)}</Text>
            <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
              <Text style={styles.statusText}>{item.latestStatus.toUpperCase()}</Text>
            </View>
          </View>
          {item.receiptNo && (
            <Text style={styles.receiptText}>📄 Receipt: {item.receiptNo}</Text>
          )}
          {item.syncError && (
            <Text style={styles.errorText}>⚠️ Error: {item.syncError}</Text>
          )}
          <Text style={styles.dateText}>{date}</Text>
        </View>

        <View style={styles.timeline}>
          {item.logs.map((log, idx) => (
            <View key={idx} style={styles.timelineItem}>
              <View style={styles.timelineDot} />
              {idx < item.logs.length - 1 && <View style={styles.timelineLine} />}
              <View style={styles.timelineContent}>
                <Text style={styles.timelineOperation}>{operationLabels[log.operation] || log.operation}</Text>
                <Text style={styles.timelineDetail}>
                  {log.attempt_no ? `Attempt ${log.attempt_no}` : ''}
                  {log.server_response && !log.server_response.startsWith('CD-') ? ` | ${log.server_response.slice(0, 50)}` : ''}
                </Text>
                <Text style={styles.timelineTime}>{new Date(log.created_at).toLocaleTimeString()}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Header title="Sync Logs" showBack={true} />
      
      {/* Filter bar */}
      <View style={styles.filterBar}>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={18} color="#6b5e53" style={styles.searchIcon} />
          <TextInput
            placeholder="Search by receipt or delivery ID..."
            placeholderTextColor="#9e8e7e"
            value={search}
            onChangeText={setSearch}
            style={styles.searchInput}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color="#9e8e7e" />
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.filterTabs}>
          <TouchableOpacity
            style={[styles.filterTab, statusFilter === 'all' && styles.filterTabActive]}
            onPress={() => setStatusFilter('all')}
          >
            <Text style={[styles.filterTabText, statusFilter === 'all' && styles.filterTabTextActive]}>All</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterTab, statusFilter === 'synced' && styles.filterTabActive]}
            onPress={() => setStatusFilter('synced')}
          >
            <Text style={[styles.filterTabText, statusFilter === 'synced' && styles.filterTabTextActive]}>Synced</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterTab, statusFilter === 'failed' && styles.filterTabActive]}
            onPress={() => setStatusFilter('failed')}
          >
            <Text style={[styles.filterTabText, statusFilter === 'failed' && styles.filterTabTextActive]}>Failed</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterTab, statusFilter === 'pending' && styles.filterTabActive]}
            onPress={() => setStatusFilter('pending')}
          >
            <Text style={[styles.filterTabText, statusFilter === 'pending' && styles.filterTabTextActive]}>Pending</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={handleClearLogs} style={styles.clearButton}>
          <Ionicons name="trash-outline" size={20} color="#c62828" />
          <Text style={styles.clearButtonText}>Clear All</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} size="large" color="#8c6239" />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.local_uuid}
          renderItem={renderGroup}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} colors={['#8c6239']} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="document-text-outline" size={48} color="#d9d0c7" />
              <Text style={styles.emptyText}>No sync logs found</Text>
              <Text style={styles.emptySubtext}>Sync activities will appear here</Text>
            </View>
          }
          contentContainerStyle={{ paddingBottom: 20 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#faf9f6' },
  filterBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0d9d0',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d9d0c7',
    paddingHorizontal: 10,
    marginBottom: 12,
  },
  searchIcon: { marginRight: 6 },
  searchInput: { flex: 1, paddingVertical: 8, fontSize: 15, color: '#1a1512' },
  filterTabs: { flexDirection: 'row', marginBottom: 12 },
  filterTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
    marginHorizontal: 4,
    backgroundColor: '#f0ece6',
  },
  filterTabActive: { backgroundColor: '#8c6239' },
  filterTabText: { fontSize: 13, fontWeight: '600', color: '#6b5e53' },
  filterTabTextActive: { color: '#fff' },
  clearButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffebee',
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
  },
  clearButtonText: { color: '#c62828', fontWeight: '600', fontSize: 14 },
  loader: { marginTop: 40 },
  groupCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e0d9d0',
    overflow: 'hidden',
  },
  groupHeader: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#f0ece6' },
  groupTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 8 },
  groupUuid: { fontSize: 14, fontWeight: '600', color: '#3d2b1f', flex: 1 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  statusText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  receiptText: { fontSize: 13, color: '#2e7d32', fontWeight: '500', marginTop: 4 },
  errorText: { fontSize: 13, color: '#c62828', marginTop: 4 },
  dateText: { fontSize: 11, color: '#9e8e7e', marginTop: 6 },
  timeline: { paddingHorizontal: 16, paddingVertical: 12 },
  timelineItem: { flexDirection: 'row', marginBottom: 16, position: 'relative' },
  timelineDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#8c6239', marginTop: 4, zIndex: 1 },
  timelineLine: { position: 'absolute', left: 5, top: 16, bottom: -16, width: 2, backgroundColor: '#d9d0c7' },
  timelineContent: { flex: 1, marginLeft: 16, paddingBottom: 8 },
  timelineOperation: { fontSize: 14, fontWeight: '600', color: '#3d2b1f' },
  timelineDetail: { fontSize: 12, color: '#6b5e53', marginTop: 2 },
  timelineTime: { fontSize: 11, color: '#9e8e7e', marginTop: 4 },
  emptyContainer: { alignItems: 'center', marginTop: 80 },
  emptyText: { fontSize: 16, color: '#9e8e7e', marginTop: 12 },
  emptySubtext: { fontSize: 13, color: '#bdb3a8', marginTop: 4 },
});