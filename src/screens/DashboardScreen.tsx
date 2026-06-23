import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl, Dimensions,
} from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { useSyncStatus } from '../hooks/useSyncStatus';
import eventEmitter from '../services/eventEmitter';
import { refreshFactorySettings } from '../services/factorySettingsCache';
import { isPinEnabled } from '../utils/pinLock';

const { width } = Dimensions.get('window');
const isTablet = width >= 768;

// ---------- Types ----------
interface DeliverySplit { cherry: number; mbuni: number; }
interface TodayStats { deliveriesKg: number; deliveriesCount: number; transactionsKg: number; transactionsCount: number; deliverySplit: DeliverySplit; }
interface SeasonProgress { deliveries: { cherry: number; mbuni: number; total: number }; transactions: { sold: number; bought: number; total: number }; }
interface ActivityItem { id: string; type: 'delivery' | 'transaction'; memberName: string; kgs: number; coffeeType: string; clerkId: string; clerkName: string; createdAt: Date | null; receiptNo?: string | null; relativeTime: string; counterPartyName?: string; }
interface DashboardData { user: { fullName: string; firstName: string; role: string; }; factoryName: string; activeSeason: { name: string; endDate: Date | null; daysRemaining: number | null; } | null; today: { user: TodayStats; factory: TodayStats; }; seasonProgress: SeasonProgress; trend: number[]; recentActivity: ActivityItem[]; memberCount: number; workerCount: number; }

// ---------- Helpers ----------
const formatNumber = (num: number): string => {
  if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
  return num.toString();
};

const getGreeting = (): string => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

const getDayAbbrev = (date: Date): string =>
  date.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 2);

// ---------- Subcomponents ----------

// StatCard: onPress only wired up when a handler is explicitly passed
const StatCard = ({ label, value, onPress }: { label: string; value: number; onPress?: () => void }) => (
  <TouchableOpacity
    style={styles.statCard}
    onPress={onPress}
    activeOpacity={onPress ? 0.7 : 1}
    disabled={!onPress}
  >
    <Text style={styles.statNumber}>{formatNumber(value)}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </TouchableOpacity>
);

const SplitPill = ({ cherry, mbuni }: { cherry: number; mbuni: number }) => (
  <View style={styles.splitPill}>
    <View style={styles.splitItem}>
      <View style={[styles.splitDot, { backgroundColor: '#3d2b1f' }]} />
      <Ionicons name="leaf" size={14} color="#3d2b1f" style={{ marginRight: 6 }} />
      <Text style={styles.splitText}>{formatNumber(cherry)} kg Cherry</Text>
    </View>
    <View style={styles.splitDivider} />
    <View style={styles.splitItem}>
      <View style={[styles.splitDot, { backgroundColor: '#8c6239' }]} />
      <Ionicons name="cafe" size={14} color="#8c6239" style={{ marginRight: 6 }} />
      <Text style={styles.splitText}>{formatNumber(mbuni)} kg Mbuni</Text>
    </View>
  </View>
);

const TrendBar = ({ data }: { data: number[] }) => {
  const max = Math.max(...data, 1);
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (6 - i));
    return d;
  });
  return (
    <View style={styles.trendContainer}>
      {data.map((value, idx) => (
        <View key={idx} style={styles.trendBarWrapper}>
          {value > 0 && <Text style={styles.trendValue}>{formatNumber(value)}</Text>}
          <View style={[styles.trendBar, {
            height: Math.max(4, (value / max) * 40),
            backgroundColor: idx === 6 ? '#3d2b1f' : '#e0d9d0',
          }]} />
          <Text style={[styles.trendLabel, idx === 6 && styles.trendLabelToday]}>
            {getDayAbbrev(days[idx])}
          </Text>
        </View>
      ))}
    </View>
  );
};

// Activity rows are read-only labels — no navigation on tap
const RecentActivityRow = ({ item }: { item: ActivityItem }) => {
  const isDelivery = item.type === 'delivery';
  const iconName = isDelivery ? 'leaf' : 'swap-horizontal';
  const iconBg = isDelivery ? '#e8f5e9' : '#e3f2fd';
  const iconColor = isDelivery ? '#2e7d32' : '#1565c0';
  const typeLabel = isDelivery
    ? (item.coffeeType === 'CHERRY' ? 'Cherry' : 'Mbuni')
    : (item.coffeeType === 'CHERRY' ? 'Sold Cherry' : 'Sold Mbuni');
  const memberName = isDelivery
    ? item.memberName
    : `${item.memberName} → ${item.counterPartyName}`;

  return (
    <View style={styles.activityRow}>
      <View style={[styles.activityIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={iconName} size={20} color={iconColor} />
      </View>
      <View style={styles.activityContent}>
        <Text style={styles.activityMember} numberOfLines={1}>{memberName}</Text>
        <View style={styles.activityMeta}>
          <Text style={styles.activityType}>{typeLabel}</Text>
          <Text style={styles.activityTime}>{item.relativeTime}</Text>
          <View style={styles.syncStatusDot} />
        </View>
      </View>
      <Text style={styles.activityKgs}>{formatNumber(item.kgs)} kg</Text>
    </View>
  );
};

const ActionButton = ({
  icon, title, onPress, accent,
}: { icon: any; title: string; onPress: () => void; accent?: boolean }) => (
  <TouchableOpacity
    style={[styles.actionCard, accent && styles.actionCardAccent]}
    onPress={onPress}
    activeOpacity={0.7}
  >
    <View style={[styles.actionIconBg, accent && styles.actionIconBgAccent]}>
      <Ionicons name={icon} size={24} color={accent ? '#f59e0b' : '#8c6239'} />
    </View>
    <Text style={styles.actionText}>{title}</Text>
  </TouchableOpacity>
);

// Pin security alert banner
const PinAlertBanner = ({ onGoToPin }: { onGoToPin: () => void }) => (
  <View style={styles.pinAlertBanner}>
    <View style={styles.pinAlertIconWrap}>
      <Ionicons name="lock-open" size={22} color="#b45309" />
    </View>
    <View style={styles.pinAlertBody}>
      <Text style={styles.pinAlertTitle}>App PIN not set</Text>
      <Text style={styles.pinAlertText}>
        Without a PIN, anyone who picks up this device can access member records,
        delivery history, and financial data. Protect your factory's information by
        enabling a PIN lock now.
      </Text>
      <TouchableOpacity onPress={onGoToPin} style={styles.pinAlertLink}>
        <Ionicons name="shield-checkmark-outline" size={14} color="#92400e" />
        <Text style={styles.pinAlertLinkText}>Set up PIN Lock →</Text>
      </TouchableOpacity>
    </View>
  </View>
);

// ---------- Main Screen ----------
export default function DashboardScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { pendingCount, refreshPendingCount } = useSyncStatus();
  const isFocused = useIsFocused();
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [pinEnabled, setPinEnabled] = useState<boolean | null>(null); // null = not yet checked
  const lastFetchTime = useRef(0);
  const isFetching = useRef(false);

  // Check pin status whenever screen is focused
  useEffect(() => {
    if (isFocused) {
      isPinEnabled().then(setPinEnabled);
    }
  }, [isFocused]);

  const fetchDashboard = useCallback(async (isRefresh = false) => {
    const now = Date.now();
    if (isFetching.current) return;
    if (!isRefresh && now - lastFetchTime.current < 2000) return;
    lastFetchTime.current = now;
    isFetching.current = true;
    if (!isRefresh) setLoading(true);
    setError('');
    try {
      refreshFactorySettings().catch(() => {});
      const { data } = await api.get('/dashboard/mobile');
      setDashboardData(data);
      await AsyncStorage.setItem('@dashboard_cache', JSON.stringify(data));
    } catch (e: any) {
      const message = e.response?.data?.error || e.message || 'Failed to load dashboard';
      setError(message);
      const cached = await AsyncStorage.getItem('@dashboard_cache');
      if (cached) setDashboardData(JSON.parse(cached));
    } finally {
      setLoading(false);
      setRefreshing(false);
      isFetching.current = false;
    }
  }, []);

  useEffect(() => {
    if (isFocused) fetchDashboard();
  }, [isFocused, fetchDashboard]);

  useEffect(() => {
    const onRecord = () => {
      fetchDashboard(true);
      refreshPendingCount();
    };
    eventEmitter.on('deliveryRecorded', onRecord);
    eventEmitter.on('transactionRecorded', onRecord);
    eventEmitter.on('syncFinished', onRecord);
    return () => {
      eventEmitter.off('deliveryRecorded', onRecord);
      eventEmitter.off('transactionRecorded', onRecord);
      eventEmitter.off('syncFinished', onRecord);
    };
  }, [fetchDashboard, refreshPendingCount]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchDashboard(true);
    refreshPendingCount();
    isPinEnabled().then(setPinEnabled);
  };

  if (loading && !dashboardData) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#8c6239" />
        <Text style={styles.loadingText}>Loading dashboard...</Text>
      </View>
    );
  }

  const data = dashboardData!;
  const isAdmin = data.user?.role === 'factory_admin';
  const firstName = data.user?.firstName || 'User';
  const greeting = getGreeting();
  const factoryName = data.factoryName || 'Factory';
  const activeSeason = data.activeSeason;
  const daysRemaining = activeSeason?.daysRemaining;
  const todayData = data.today;
  const seasonProgress = data.seasonProgress;
  const trend = data.trend || [0, 0, 0, 0, 0, 0, 0];
  const recentActivity = data.recentActivity || [];

  const showSeasonPill = !!activeSeason?.name;
  const showUserDeliverySplit = (todayData.user.deliverySplit.cherry + todayData.user.deliverySplit.mbuni) > 0;
  const showFactoryDeliverySplit = (todayData.factory.deliverySplit.cherry + todayData.factory.deliverySplit.mbuni) > 0;
  const showTrend = trend.some(v => v > 0);
  const showTransactionBought = seasonProgress.transactions.bought > 0;
  // Show banner only once we've confirmed pin is off (null = still loading check)
  const showPinAlert = pinEnabled === false;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#8c6239']} tintColor="#8c6239" />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>{greeting}, {firstName}</Text>
          <Text style={styles.factoryName}>{factoryName}</Text>
          {showSeasonPill && (
            <View style={styles.seasonPill}>
              <View style={styles.seasonDot} />
              <Text style={styles.seasonText}>
                {activeSeason.name}
                {daysRemaining !== null && `  ·  ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} left`}
              </Text>
            </View>
          )}
          {!showSeasonPill && <Text style={styles.noSeason}>No active season</Text>}
        </View>
        <View style={styles.headerRight}>
          <Text style={styles.updatedText}>
            Updated {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      </View>

      {/* Pending Sync Banner */}
      {pendingCount > 0 && (
        <TouchableOpacity
          style={styles.pendingBanner}
          onPress={() => navigation.navigate('PendingDeliveries')}
        >
          <Ionicons name="cloud-upload" size={18} color="#f59e0b" />
          <Text style={styles.pendingBannerText}>{pendingCount} delivery(ies) pending sync</Text>
          <Ionicons name="chevron-forward" size={16} color="#6b5e53" />
        </TouchableOpacity>
      )}

      {/* PIN Security Alert — shown only when pin is not set */}
      {showPinAlert && (
        <PinAlertBanner onGoToPin={() => navigation.navigate('PinLock')} />
      )}

      {/* My Activity Today */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>My Activity Today</Text>
        <View style={styles.statsRow}>
          <StatCard label="My Deliveries" value={todayData.user.deliveriesCount} />
          <StatCard label="My Transactions" value={todayData.user.transactionsCount} />
        </View>
        {showUserDeliverySplit && (
          <SplitPill
            cherry={todayData.user.deliverySplit.cherry}
            mbuni={todayData.user.deliverySplit.mbuni}
          />
        )}
      </View>

      {/* Factory Today */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Factory Today</Text>
        <View style={styles.statsRow}>
          <StatCard label="All Deliveries" value={todayData.factory.deliveriesCount} />
          <StatCard label="All Transactions" value={todayData.factory.transactionsCount} />
        </View>
        {showFactoryDeliverySplit && (
          <SplitPill
            cherry={todayData.factory.deliverySplit.cherry}
            mbuni={todayData.factory.deliverySplit.mbuni}
          />
        )}
      </View>

      {/* Operations (Admin only) — labels only, no navigation */}
      {isAdmin && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Operations</Text>
          <View style={styles.statsRow}>
            <StatCard label="Members" value={data.memberCount || 0} />
            <StatCard label="Workers" value={data.workerCount || 0} />
          </View>
        </View>
      )}

      {/* Season Progress */}
      {activeSeason && (
        <View style={styles.seasonCard}>
          <Text style={styles.seasonCardTitle}>Season {activeSeason.name}</Text>
          <View style={styles.seasonRow}>
            <View style={styles.seasonItem}>
              <View style={[styles.seasonDot, { backgroundColor: '#3d2b1f' }]} />
              <Text style={styles.seasonLabel}>Cherry</Text>
              <Text style={styles.seasonValue}>{formatNumber(seasonProgress.deliveries.cherry)} kg</Text>
            </View>
            <View style={styles.seasonItem}>
              <View style={[styles.seasonDot, { backgroundColor: '#8c6239' }]} />
              <Text style={styles.seasonLabel}>Mbuni</Text>
              <Text style={styles.seasonValue}>{formatNumber(seasonProgress.deliveries.mbuni)} kg</Text>
            </View>
            <View style={styles.seasonItem}>
              <View style={[styles.seasonDot, { backgroundColor: '#1a1512' }]} />
              <Text style={styles.seasonLabel}>Total</Text>
              <Text style={styles.seasonValue}>{formatNumber(seasonProgress.deliveries.total)} kg</Text>
            </View>
          </View>
          <View style={styles.seasonDivider} />
          <View style={styles.seasonRow}>
            <View style={styles.seasonItem}>
              <View style={[styles.seasonDot, { backgroundColor: '#1565c0' }]} />
              <Text style={styles.seasonLabel}>Transacted</Text>
              <Text style={styles.seasonValue}>{formatNumber(seasonProgress.transactions.sold)} kg</Text>
            </View>
            {showTransactionBought && (
              <View style={styles.seasonItem}>
                <View style={[styles.seasonDot, { backgroundColor: '#2e7d32' }]} />
                <Text style={styles.seasonLabel}>Bought</Text>
                <Text style={styles.seasonValue}>{formatNumber(seasonProgress.transactions.bought)} kg</Text>
              </View>
            )}
            <View style={styles.seasonItem}>
              <View style={[styles.seasonDot, { backgroundColor: '#1a1512' }]} />
              <Text style={styles.seasonLabel}>Total</Text>
              <Text style={styles.seasonValue}>{formatNumber(seasonProgress.transactions.total)} kg</Text>
            </View>
          </View>
        </View>
      )}

      {/* 7-Day Delivery Trend */}
      {showTrend && (
        <View style={styles.trendSection}>
          <Text style={styles.sectionTitle}>7‑Day Delivery Trend</Text>
          <TrendBar data={trend} />
        </View>
      )}

      {/* Recent Activity — plain list, no tap navigation */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{isAdmin ? 'Recent Activity' : 'My Recent Records'}</Text>
        {recentActivity.length === 0 ? (
          <View style={styles.emptyActivity}>
            <Ionicons name="document-text-outline" size={32} color="#d9d0c7" />
            <Text style={styles.emptyText}>No activity recorded today</Text>
          </View>
        ) : (
          recentActivity.map(item => <RecentActivityRow key={item.id} item={item} />)
        )}
      </View>

      {/* Quick Actions — the only interactive navigation elements */}
      <View style={styles.actionsSection}>
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionsGrid}>
          <ActionButton icon="leaf" title="Record Delivery" onPress={() => navigation.navigate('RecordDelivery')} />
          <ActionButton icon="swap-horizontal" title="Record Transaction" onPress={() => navigation.navigate('RecordTransaction')} />
          {isAdmin && (
            <ActionButton icon="person-add" title="Add Member" onPress={() => navigation.navigate('AddMember')} />
          )}
          {pendingCount > 0 && (
            <ActionButton
              icon="cloud-upload"
              title={`Sync Now (${pendingCount})`}
              onPress={() => navigation.navigate('PendingDeliveries')}
              accent
            />
          )}
        </View>
      </View>
    </ScrollView>
  );
}

// ---------- Styles ----------
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#faf9f6' },
  contentContainer: { padding: 16, paddingBottom: 32 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#faf9f6' },
  loadingText: { marginTop: 12, color: '#6b5e53', fontSize: 16 },

  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, backgroundColor: '#faf9f6', marginHorizontal: -16, paddingHorizontal: 16, paddingVertical: 20, borderBottomWidth: 1, borderBottomColor: '#e0d9d0' },
  greeting: { fontSize: 20, fontWeight: '700', color: '#3d2b1f' },
  factoryName: { fontSize: 14, color: '#6b5e53', marginTop: 2 },
  seasonPill: { flexDirection: 'row', alignItems: 'center', marginTop: 8, backgroundColor: '#f0ece6', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, alignSelf: 'flex-start' },
  seasonDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#f59e0b', marginRight: 6 },
  seasonText: { fontSize: 12, color: '#3d2b1f' },
  noSeason: { fontSize: 12, color: '#9e8e7e', marginTop: 8 },
  headerRight: { alignItems: 'flex-end' },
  updatedText: { fontSize: 10, color: '#9e8e7e' },

  // Pending banner
  pendingBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fffbf0', borderLeftWidth: 4, borderLeftColor: '#f59e0b', padding: 12, borderRadius: 10, marginBottom: 16, justifyContent: 'space-between' },
  pendingBannerText: { flex: 1, marginLeft: 8, fontWeight: '500', color: '#6b5e53' },

  // PIN alert banner
  pinAlertBanner: { flexDirection: 'row', backgroundColor: '#fff7ed', borderLeftWidth: 4, borderLeftColor: '#f59e0b', borderRadius: 12, padding: 14, marginBottom: 20, gap: 12 },
  pinAlertIconWrap: { paddingTop: 2 },
  pinAlertBody: { flex: 1 },
  pinAlertTitle: { fontSize: 14, fontWeight: '700', color: '#92400e', marginBottom: 4 },
  pinAlertText: { fontSize: 13, color: '#78350f', lineHeight: 19 },
  pinAlertLink: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 5 },
  pinAlertLinkText: { fontSize: 13, fontWeight: '600', color: '#92400e', textDecorationLine: 'underline' },

  // Sections
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#3d2b1f', marginBottom: 12 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  statCard: { flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#e0d9d0', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 2 },
  statNumber: { fontSize: 24, fontWeight: '800', color: '#3d2b1f' },
  statLabel: { fontSize: 12, color: '#6b5e53', marginTop: 4, textAlign: 'center' },

  // Split pill
  splitPill: { flexDirection: 'row', backgroundColor: '#f0ece6', borderRadius: 30, paddingVertical: 8, paddingHorizontal: 12, marginTop: 12, justifyContent: 'space-between', alignItems: 'center' },
  splitItem: { flexDirection: 'row', alignItems: 'center', flex: 1, justifyContent: 'center' },
  splitDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  splitText: { fontSize: 12, fontWeight: '500', color: '#3d2b1f' },
  splitDivider: { width: 1, height: 20, backgroundColor: '#d9d0c7', marginHorizontal: 12 },

  // Season card
  seasonCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: '#e0d9d0' },
  seasonCardTitle: { fontSize: 14, fontWeight: '700', color: '#8c6239', marginBottom: 12, textTransform: 'uppercase' },
  seasonRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  seasonItem: { flex: 1, alignItems: 'center' },
  seasonLabel: { fontSize: 11, color: '#6b5e53', marginTop: 4 },
  seasonValue: { fontSize: 14, fontWeight: '700', color: '#3d2b1f', marginTop: 2 },
  seasonDivider: { height: 1, backgroundColor: '#f0ece6', marginVertical: 12 },

  // Trend
  trendSection: { marginBottom: 24 },
  trendContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingVertical: 8, backgroundColor: '#fff', borderRadius: 16, paddingHorizontal: 12, borderWidth: 1, borderColor: '#e0d9d0' },
  trendBarWrapper: { alignItems: 'center', flex: 1 },
  trendValue: { fontSize: 10, color: '#6b5e53', marginBottom: 4 },
  trendBar: { width: isTablet ? 20 : 16, borderRadius: 8, marginBottom: 6 },
  trendLabel: { fontSize: 10, color: '#9e8e7e' },
  trendLabelToday: { fontWeight: '700', color: '#3d2b1f' },

  // Activity rows (non-tappable)
  activityRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#ede8e2' },
  activityIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  activityContent: { flex: 1 },
  activityMember: { fontSize: 14, fontWeight: '600', color: '#1a1512' },
  activityMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  activityType: { fontSize: 11, color: '#8c6239', backgroundColor: '#f0ece6', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, marginRight: 8 },
  activityTime: { fontSize: 11, color: '#9e8e7e' },
  syncStatusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#2e7d32', marginLeft: 8 },
  activityKgs: { fontSize: 15, fontWeight: '700', color: '#3d2b1f', marginLeft: 8 },
  emptyActivity: { alignItems: 'center', paddingVertical: 32, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#ede8e2' },
  emptyText: { marginTop: 8, fontSize: 14, color: '#9e8e7e' },

  // Quick actions
  actionsSection: { marginBottom: 16 },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  actionCard: { flex: 1, minWidth: isTablet ? 150 : '45%', backgroundColor: '#fff', borderRadius: 16, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#e0d9d0' },
  actionCardAccent: { borderColor: '#f59e0b', backgroundColor: '#fffbf0' },
  actionIconBg: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#f0ece6', alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  actionIconBgAccent: { backgroundColor: '#fef3c7' },
  actionText: { fontSize: 13, fontWeight: '600', color: '#3d2b1f', textAlign: 'center' },
});