import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, TextInput, SectionList, StyleSheet,
  ActivityIndicator, TouchableOpacity, RefreshControl, Alert, Modal,
  Animated, Platform, Dimensions, LayoutAnimation, UIManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import NetInfo from '@react-native-community/netinfo';
import api from '../api/client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { printTransactionReceipt } from '../services/printService';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width: screenWidth } = Dimensions.get('window');
const isTablet = screenWidth >= 768;
const LIST_FLEX = isTablet ? 0.92 : 0.88;
const RAIL_FLEX = isTablet ? 0.08 : 0.12;
const PAGE_SIZE = 20;

interface Transaction {
  id: number;
  original_id?: string;
  coffee_type: string;
  kgs_transacted: number;
  transaction_date: string;
  transaction_time: string;
  seller: { name: string; reg_no: string } | null;
  buyer: { name: string; reg_no: string } | null;
  profiles: { full_name: string } | null;
  receipt_no?: string | null;
}

interface DayGroup {
  dayLabel: string;
  dayKey: string;
  items: Transaction[];
  _type: 'dayGroup';
}

interface Section {
  title: string;
  monthKey: string;
  data: DayGroup[];
  key?: string;
}

interface MonthEntry {
  key: string;
  label: string;
  year: string;
}

interface TransactionsScreenProps {
  type: 'cherry' | 'mbuni';
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers (identical to deliveries but for transactions)
const getDayLabel = (dateStr: string): string => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    d.setHours(0, 0, 0, 0);
    const diff = today.getTime() - d.getTime();
    if (diff === 0) return 'Today';
    if (diff === 86400000) return 'Yesterday';
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
};

const getMonthKey = (dateStr: string): string => dateStr?.slice(0, 7) || '';
const getMonthLabel = (key: string): string => {
  const [year, month] = key.split('-');
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleString('en', { month: 'short' });
};
const getMonthTitle = (key: string): string => {
  const [year, month] = key.split('-');
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleString('en', { month: 'long', year: 'numeric' }).toUpperCase();
};

const groupTransactions = (transactions: Transaction[]): Section[] => {
  console.log(`🗓️ [${transactions[0]?.coffee_type || 'transactions'}] groupTransactions called with ${transactions.length} items`);
  if (!transactions.length) return [];

  const sorted = [...transactions].sort((a, b) => {
    const da = new Date(`${a.transaction_date}T${a.transaction_time || '00:00'}`);
    const db = new Date(`${b.transaction_date}T${b.transaction_time || '00:00'}`);
    return db.getTime() - da.getTime();
  });

  const monthMap = new Map<string, Map<string, Transaction[]>>();
  for (const item of sorted) {
    const mk = getMonthKey(item.transaction_date);
    if (!mk) continue;
    const dk = item.transaction_date;
    if (!monthMap.has(mk)) monthMap.set(mk, new Map());
    const dayMap = monthMap.get(mk)!;
    if (!dayMap.has(dk)) dayMap.set(dk, []);
    dayMap.get(dk)!.push(item);
  }

  const sections: Section[] = [];
  for (const [mk, dayMap] of monthMap) {
    const data: DayGroup[] = [];
    for (const [dk, items] of dayMap) {
      data.push({ dayLabel: getDayLabel(dk), dayKey: dk, items, _type: 'dayGroup' });
    }
    sections.push({ title: getMonthTitle(mk), monthKey: mk, data, key: mk });
  }
  console.log(`🗓️ groupTransactions produced ${sections.length} sections`);
  return sections;
};

// ─────────────────────────────────────────────────────────────────────────────
// MonthRail component (same as deliveries)
const MonthRail = ({ months, activeMonth, onSelect }: {
  months: MonthEntry[];
  activeMonth: string;
  onSelect: (key: string) => void;
}) => {
  const [touched, setTouched] = useState(false);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const floatOpacity = useRef(new Animated.Value(0)).current;

  const showFloat = (key: string) => {
    setHoveredKey(key);
    setTouched(true);
    Animated.timing(floatOpacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
  };
  const hideFloat = () => {
    Animated.timing(floatOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      setTouched(false);
      setHoveredKey(null);
    });
  };

  return (
    <View style={styles.rail}>
      {touched && hoveredKey && (
        <Animated.View style={[styles.railFloat, { opacity: floatOpacity }]}>
          <Text style={styles.railFloatText}>{getMonthTitle(hoveredKey).replace(/ /g, '\n')}</Text>
        </Animated.View>
      )}
      <View style={styles.railLine} />
      {months.map((m) => (
        <TouchableOpacity
          key={m.key}
          style={styles.railItem}
          onPressIn={() => showFloat(m.key)}
          onPressOut={hideFloat}
          onPress={() => { onSelect(m.key); hideFloat(); }}
          hitSlop={{ top: 4, bottom: 4, left: 12, right: 12 }}
        >
          <Text style={[styles.railLabel, m.key === activeMonth && styles.railLabelActive]}>
            {m.label}
          </Text>
          {m.key === activeMonth && <View style={styles.railActiveDot} />}
        </TouchableOpacity>
      ))}
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// TransactionRow component (expandable)
const TransactionRow = React.memo(({ item, onLongPress }: { item: Transaction; onLongPress: (item: Transaction) => void }) => {
  const [expanded, setExpanded] = useState(false);
  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(v => !v);
  };
  const kgs = Number(item.kgs_transacted) || 0;
  const sellerDisplay = item.seller ? `${item.seller.reg_no}. ${item.seller.name}` : '—';
  const buyerDisplay = item.buyer ? `${item.buyer.reg_no}. ${item.buyer.name}` : '—';
  let formattedTime = item.transaction_time;
  if (formattedTime) {
    if (formattedTime.includes('T')) {
      formattedTime = new Date(formattedTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
      const parts = formattedTime.split(':');
      formattedTime = `${parts[0]}:${parts[1]}`;
    }
  } else {
    formattedTime = '—';
  }

  return (
    <TouchableOpacity
      style={styles.row}
      onPress={toggle}
      onLongPress={() => onLongPress(item)}
      activeOpacity={0.8}
    >
      <View style={styles.rowMain}>
        <View style={styles.rowLeft}>
          <View style={styles.syncDot} />
          <Text style={styles.rowName} numberOfLines={1}>{sellerDisplay} → {buyerDisplay}</Text>
        </View>
        <View style={styles.rowRight}>
          <Text style={styles.rowKgs}>{kgs % 1 === 0 ? kgs : kgs.toFixed(1)}kg</Text>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color="#9e8e7e" style={{ marginLeft: 6 }} />
        </View>
      </View>
      <View style={styles.rowSub}>
        <Text style={styles.rowMeta}>{formattedTime}</Text>
        {item.receipt_no && (
          <>
            <Text style={styles.metaDot}>·</Text>
            <Text style={[styles.rowMeta, styles.receiptMono]}>{item.receipt_no}</Text>
          </>
        )}
      </View>
      {expanded && (
        <View style={styles.rowExpanded}>
          <View style={styles.expandDivider} />
          <View style={styles.expandGrid}>
            <View style={styles.expandField}>
              <Text style={styles.expandLabel}>Coffee</Text>
              <Text style={styles.expandValue}>{item.coffee_type}</Text>
            </View>
            <View style={styles.expandField}>
              <Text style={styles.expandLabel}>Clerk</Text>
              <Text style={styles.expandValue}>{item.profiles?.full_name || '—'}</Text>
            </View>
            <View style={styles.expandField}>
              <Text style={styles.expandLabel}>Recorded</Text>
              <Text style={styles.expandValue}>
                {new Date(item.transaction_date).toLocaleDateString('en-GB', {
                  day: '2-digit', month: 'short', year: 'numeric',
                })}
              </Text>
            </View>
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// Main TransactionsScreen
export default function TransactionsScreen({ type }: TransactionsScreenProps) {
  const navigation = useNavigation<any>();

  const [serverTransactions, setServerTransactions] = useState<Transaction[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(true);
  const offsetRef = useRef(0);
  const isFetching = useRef(false);
  const initDoneRef = useRef(false);

  const [selectedItem, setSelectedItem] = useState<Transaction | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);

  const [printerAddress, setPrinterAddress] = useState<string>('');
  const [paperWidth, setPaperWidth] = useState<58 | 80>(58);
  const [factorySettings, setFactorySettings] = useState<any>(null);

  const [months, setMonths] = useState<MonthEntry[]>([]);
  const [activeMonth, setActiveMonth] = useState('');
  const sectionListRef = useRef<SectionList>(null);
  const monthSectionMap = useRef<Record<string, number>>({});

  // Toast
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTranslateY = useRef(new Animated.Value(-30)).current;
  const showToast = (text: string, toastType: 'success' | 'error') => {
    setToast({ text, type: toastType });
    toastTranslateY.setValue(-30);
    toastOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(toastOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.timing(toastTranslateY, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start();
    setTimeout(() => {
      Animated.parallel([
        Animated.timing(toastOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.timing(toastTranslateY, { toValue: -30, duration: 300, useNativeDriver: true }),
      ]).start(() => setToast(null));
    }, 3000);
  };

  // Settings
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const raw = await AsyncStorage.getItem('selectedPrinter');
        if (raw) { const { address } = JSON.parse(raw); if (address) setPrinterAddress(address); }
        const pw = await AsyncStorage.getItem('paperWidth');
        if (pw) setPaperWidth(Number(pw) as 58 | 80);
        const { data } = await api.get('/factory/settings');
        setFactorySettings(data);
      } catch {}
    };
    loadSettings();
  }, []);

  // Cache helpers
  const CACHE_KEY = '@transactions_cache_v2';
  const loadCache = async (coffeeType: string): Promise<Transaction[] | null> => {
    try {
      const cached = await AsyncStorage.getItem(`${CACHE_KEY}_${coffeeType}`);
      if (cached) {
        const data = JSON.parse(cached);
        if (data.type === coffeeType && data.transactions?.length) return data.transactions;
      }
    } catch {}
    return null;
  };
  const saveCache = async (coffeeType: string, transactions: Transaction[]) => {
    if (!transactions.length) return;
    try {
      await AsyncStorage.setItem(`${CACHE_KEY}_${coffeeType}`, JSON.stringify({
        type: coffeeType, transactions: transactions.slice(0, PAGE_SIZE), timestamp: Date.now(),
      }));
    } catch {}
  };

  // Fetch server transactions
  const fetchServerTransactions = useCallback(async (reset: boolean, caller: string): Promise<Transaction[]> => {
    console.log(`📦 [${type}] fetchServerTransactions called — reset=${reset} caller="${caller}" isFetching=${isFetching.current} offset=${offsetRef.current}`);
    if (isFetching.current) {
      console.warn(`⛔ [${type}] fetchServerTransactions BLOCKED — already in flight (caller="${caller}")`);
      return [];
    }
    const net = await NetInfo.fetch();
    console.log(`🌐 [${type}] network isConnected=${net.isConnected}`);
    if (!net.isConnected) {
      if (reset) setHasMore(false);
      return [];
    }
    const currentOffset = reset ? 0 : offsetRef.current;
    isFetching.current = true;
    console.log(`🔒 [${type}] isFetching locked`);
    try {
      const url = `/transactions?type=${type}&sortKey=transaction_date&sortDir=desc&limit=${PAGE_SIZE}&offset=${currentOffset}`;
      console.log(`🔗 [${type}] GET ${url}`);
      const { data } = await api.get(url);
      const newTransactions: Transaction[] = (data.transactions || []).map((t: any) => ({
        ...t,
        kgs_transacted: Number(t.kgs_transacted),
      }));
      console.log(`✅ [${type}] fetch returned ${newTransactions.length} items (reset=${reset})`);
      if (reset) {
        setServerTransactions(newTransactions);
        offsetRef.current = PAGE_SIZE;
        setHasMore(newTransactions.length === PAGE_SIZE);
        await saveCache(type, newTransactions);
        console.log(`💾 [${type}] serverTransactions SET to ${newTransactions.length} items`);
      } else {
        setServerTransactions(prev => {
          const merged = [...prev, ...newTransactions];
          console.log(`💾 [${type}] serverTransactions APPENDED — prev=${prev.length} new=${newTransactions.length} total=${merged.length}`);
          return merged;
        });
        offsetRef.current += PAGE_SIZE;
        setHasMore(newTransactions.length === PAGE_SIZE);
      }
      return newTransactions;
    } catch (err: any) {
      console.error(`❌ [${type}] fetch ERROR — ${err.message}`);
      setError(err.message);
      return [];
    } finally {
      isFetching.current = false;
      console.log(`🔓 [${type}] isFetching unlocked`);
    }
  }, [type]);

  const refreshAll = useCallback(async (caller: string) => {
    console.log(`🔄 [${type}] refreshAll called by="${caller}"`);
    setRefreshing(true);
    await fetchServerTransactions(true, `refreshAll[${caller}]`);
    setRefreshing(false);
    console.log(`🔄 [${type}] refreshAll done`);
  }, [fetchServerTransactions]);

  // Mount init
  useEffect(() => {
    let cancelled = false;
    console.log(`🚀 [${type}] mount init — starting`);
    const init = async () => {
      setLoading(true);
      const net = await NetInfo.fetch();
      console.log(`🚀 [${type}] mount init — isConnected=${net.isConnected}`);
      if (cancelled) return;
      if (net.isConnected) {
        await fetchServerTransactions(true, 'mountInit');
      } else {
        const cached = await loadCache(type);
        console.log(`🚀 [${type}] mount init — offline, cache items=${cached?.length ?? 0}`);
        if (!cancelled) setServerTransactions(cached || []);
      }
      if (!cancelled) {
        setLoading(false);
        initDoneRef.current = true;
        console.log(`🚀 [${type}] mount init — COMPLETE, initDone=true`);
      }
    };
    init();
    return () => { cancelled = true; };
  }, []);

  // Focus re-fetch
  useFocusEffect(useCallback(() => {
    if (!initDoneRef.current) {
      console.log(`👁️ [${type}] useFocusEffect — init not done yet, skipping`);
      return;
    }
    console.log(`👁️ [${type}] useFocusEffect — init done, refreshing`);
    refreshAll('focusEffect');
  }, [refreshAll]));

  // Periodic check for new transactions
  useEffect(() => {
    const checkNew = async () => {
      const net = await NetInfo.fetch();
      if (!net.isConnected || isFetching.current) return;
      try {
        const { data } = await api.get(
          `/transactions?type=${type}&sortKey=transaction_date&sortDir=desc&limit=1&offset=0`
        );
        const latestId = data.transactions?.[0]?.id;
        setServerTransactions(prev => {
          if (latestId && prev.length > 0 && latestId > prev[0]?.id) {
            console.log(`🔔 [${type}] background check — new transaction detected, refreshing`);
            fetchServerTransactions(true, 'backgroundCheck');
          }
          return prev;
        });
      } catch {}
    };
    const interval = setInterval(checkNew, 60000);
    return () => clearInterval(interval);
  }, [type, fetchServerTransactions]);

  // Load more
  const loadMore = async () => {
    if (loadingMore || !hasMore || isFetching.current) return;
    const net = await NetInfo.fetch();
    if (!net.isConnected) return;
    console.log(`📄 [${type}] loadMore — offset=${offsetRef.current}`);
    setLoadingMore(true);
    await fetchServerTransactions(false, 'loadMore');
    setLoadingMore(false);
  };

  // Filter and group
  const allTransactions = useMemo(() => {
    let result = [...serverTransactions];
    if (search.trim()) {
      const s = search.toLowerCase();
      result = result.filter(t =>
        t.seller?.name?.toLowerCase().includes(s) ||
        t.buyer?.name?.toLowerCase().includes(s) ||
        t.profiles?.full_name?.toLowerCase().includes(s)
      );
    }
    console.log(`📊 [${type}] allTransactions — server=${serverTransactions.length} filtered=${result.length}`);
    return result;
  }, [serverTransactions, search]);

  const sections = useMemo(() => {
    const s = groupTransactions(allTransactions);
    console.log(`📅 [${type}] sections — ${s.length} months, ${allTransactions.length} total transactions`);
    return s;
  }, [allTransactions]);

  // Update month rail
  useEffect(() => {
    if (!sections.length) return;
    const entries: MonthEntry[] = sections.map(s => ({
      key: s.monthKey,
      label: getMonthLabel(s.monthKey),
      year: s.monthKey.split('-')[0],
    }));
    setMonths(entries);
    const map: Record<string, number> = {};
    sections.forEach((s, i) => { map[s.monthKey] = i; });
    monthSectionMap.current = map;
    if (!activeMonth || !map[activeMonth]) setActiveMonth(entries[0]?.key || '');
  }, [sections]);

  const jumpToMonth = useCallback((monthKey: string) => {
    const idx = monthSectionMap.current[monthKey];
    if (idx == null) return;
    try {
      sectionListRef.current?.scrollToLocation({ sectionIndex: idx, itemIndex: 0, animated: true, viewPosition: 0 });
      setActiveMonth(monthKey);
    } catch {}
  }, []);

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (!viewableItems.length) return;
    const first = viewableItems[0];
    if (first?.section?.monthKey) setActiveMonth(first.section.monthKey);
  }).current;
  const viewabilityConfig = { itemVisiblePercentThreshold: 20 };

  // Action handlers
  const confirmDelete = () => {
    if (!selectedItem) return;
    const kgs = Number(selectedItem.kgs_transacted).toFixed(2);
    const sellerName = selectedItem.seller?.name || 'Unknown';
    const buyerName = selectedItem.buyer?.name || 'Unknown';
    Alert.alert(
      'Delete Transaction',
      `Delete ${kgs} kg transaction from ${sellerName} to ${buyerName}? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteTransaction(selectedItem) },
      ]
    );
    setMenuVisible(false);
  };

  const deleteTransaction = async (item: Transaction) => {
    if (!item.id) { showToast('Invalid transaction ID', 'error'); return; }
    const url = `/transactions?id=${item.id}&type=${item.coffee_type || type}`;
    console.log(`🗑️ [${type}] Deleting transaction: ${url}`);
    try {
      await api.delete(url);
      showToast('Transaction deleted', 'success');
      await refreshAll('delete');
    } catch (e: any) {
      showToast(e.response?.data?.error || 'Could not delete', 'error');
    }
  };

  const reprintReceipt = async () => {
    if (!selectedItem) { setMenuVisible(false); return; }
    if (!printerAddress) {
      showToast('No printer configured. Go to Account settings.', 'error');
      setMenuVisible(false); return;
    }
    const item = selectedItem;
    const kgs = Number(item.kgs_transacted) || 0;
    try {
      await printTransactionReceipt(
        item.seller?.name || 'Unknown', item.seller?.reg_no || '',
        item.buyer?.name || 'Unknown', item.buyer?.reg_no || '',
        kgs,
        (item.coffee_type || type) as 'cherry' | 'mbuni',
        item.transaction_date, item.transaction_time,
        {
          printerAddress, paperWidth,
          receiptSettings: factorySettings?.settings?.receipt,
          factoryInfo: factorySettings?.settings?.factoryInfo,
          factoryName: factorySettings?.name,
          clerk: item.profiles?.full_name || '',
          receiptNo: item.receipt_no ?? undefined,
        }
      );
      showToast('Receipt printed successfully', 'success');
    } catch (e: any) {
      showToast('Print failed: ' + e.message, 'error');
    }
    setMenuVisible(false);
  };

  const renderSectionHeader = ({ section }: { section: any }) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionHeaderText}>{section.title}</Text>
    </View>
  );

  const renderItem = ({ item }: { item: DayGroup }) => (
    <View>
      <View style={styles.dayHeader}>
        <Text style={styles.dayHeaderText}>{item.dayLabel}</Text>
        <View style={styles.dayDivider} />
      </View>
      {item.items.map((transaction, idx) => (
        <TransactionRow
          key={transaction.id ? transaction.id.toString() : `t-${idx}`}
          item={transaction}
          onLongPress={(d) => { setSelectedItem(d); setMenuVisible(true); }}
        />
      ))}
    </View>
  );

  const keyExtractor = (item: DayGroup, index: number) => `${item.dayKey}-${index}`;

  return (
    <View style={styles.container}>
      {toast && (
        <Animated.View
          style={[
            styles.toastOverlay,
            toast.type === 'success' ? styles.toastSuccess : styles.toastError,
            { opacity: toastOpacity, transform: [{ translateY: toastTranslateY }], top: 60 },
          ]}
          pointerEvents="none"
        >
          <Ionicons name={toast.type === 'success' ? 'checkmark-circle' : 'alert-circle'} size={20} color={toast.type === 'success' ? '#2e7d32' : '#c62828'} />
          <Text style={styles.toastText}>{toast.text}</Text>
        </Animated.View>
      )}

      {/* Search bar */}
      <View style={styles.searchRow}>
        <View style={styles.searchInputWrapper}>
          <Ionicons name="search" size={18} color="#8c6239" style={styles.searchIcon} />
          <TextInput
            placeholder="Search seller, buyer or clerk..."
            placeholderTextColor="#9e8e7e"
            value={search}
            onChangeText={setSearch}
            style={styles.searchInput}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color="#9e8e7e" style={styles.clearIcon} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={18} color="#c62828" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => refreshAll('retryButton')}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.mainArea}>
        <View style={{ flex: LIST_FLEX }}>
          {loading && !refreshing ? (
            <ActivityIndicator size="large" color="#8c6239" style={{ marginTop: 32 }} />
          ) : (
            <SectionList
              ref={sectionListRef}
              sections={sections}
              keyExtractor={keyExtractor}
              renderItem={renderItem}
              renderSectionHeader={renderSectionHeader}
              stickySectionHeadersEnabled
              onEndReached={loadMore}
              onEndReachedThreshold={0.4}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => refreshAll('pullToRefresh')} colors={['#8c6239']} tintColor="#8c6239" />}
              onViewableItemsChanged={onViewableItemsChanged}
              viewabilityConfig={viewabilityConfig}
              initialNumToRender={20}
              maxToRenderPerBatch={20}
              windowSize={10}
              removeClippedSubviews
              ListFooterComponent={loadingMore ? <ActivityIndicator style={{ margin: 16 }} color="#8c6239" /> : null}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Ionicons name="swap-horizontal-outline" size={48} color="#d9d0c7" />
                  <Text style={styles.emptyText}>No transactions found</Text>
                  <Text style={styles.emptySubtext}>Pull to refresh or add a transaction</Text>
                </View>
              }
              contentContainerStyle={{ paddingBottom: 100 }}
            />
          )}
        </View>
        {months.length > 0 && (
          <View style={{ flex: RAIL_FLEX }}>
            <MonthRail months={months} activeMonth={activeMonth} onSelect={jumpToMonth} />
          </View>
        )}
      </View>

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate('RecordTransaction')}>
        <Ionicons name="add" size={28} color="#faf9f6" />
      </TouchableOpacity>

      {/* Action Menu Modal */}
      <Modal visible={menuVisible} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setMenuVisible(false)}>
          <View style={styles.actionMenu}>
            <Text style={styles.menuTitle}>Actions</Text>
            <TouchableOpacity style={styles.menuItem} onPress={reprintReceipt}>
              <Ionicons name="print-outline" size={22} color="#3d2b1f" />
              <Text style={styles.menuItemText}>Reprint Receipt</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={confirmDelete}>
              <Ionicons name="trash-outline" size={22} color="#c62828" />
              <Text style={[styles.menuItemText, { color: '#c62828' }]}>Delete</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuCancel} onPress={() => setMenuVisible(false)}>
              <Text style={styles.menuCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#faf9f6', paddingHorizontal: 12, paddingTop: 8 },
  searchRow: { marginBottom: 8 },
  searchInputWrapper: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#d9d0c7', paddingHorizontal: 10, paddingVertical: 8 },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, color: '#1a1512' },
  clearIcon: { marginLeft: 8 },
  errorBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffebee', borderRadius: 8, padding: 8, marginBottom: 8 },
  errorText: { flex: 1, color: '#c62828', fontSize: 12, marginLeft: 6 },
  retryText: { color: '#8c6239', fontWeight: '700', fontSize: 13, marginLeft: 8 },
  mainArea: { flex: 1, flexDirection: 'row' },
  sectionHeader: { backgroundColor: '#faf9f6', paddingVertical: 6, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: '#e0d9d0', marginBottom: 2 },
  sectionHeaderText: { fontSize: 11, fontWeight: '800', color: '#8c6239', letterSpacing: 1.2 },
  dayHeader: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 4, marginTop: 4 },
  dayHeaderText: { fontSize: 11, fontWeight: '600', color: '#9e8e7e', marginRight: 8, flexShrink: 0 },
  dayDivider: { flex: 1, height: 1, backgroundColor: '#ede8e2' },
  row: { backgroundColor: '#fff', paddingHorizontal: 10, marginBottom: 1, borderRadius: 8, borderWidth: 1, borderColor: '#ede8e2', minHeight: 56, justifyContent: 'center' },
  rowMain: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10, paddingBottom: 2 },
  rowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 },
  rowRight: { flexDirection: 'row', alignItems: 'center' },
  syncDot: { width: 7, height: 7, borderRadius: 4, marginRight: 8, backgroundColor: '#2e7d32' },
  rowName: { fontSize: 14, fontWeight: '600', color: '#1a1512', flex: 1 },
  rowKgs: { fontSize: 14, fontWeight: '700', color: '#8c6239' },
  rowSub: { flexDirection: 'row', alignItems: 'center', paddingBottom: 10, paddingLeft: 15 },
  rowMeta: { fontSize: 11, color: '#9e8e7e' },
  receiptMono: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', color: '#7a6a5a' },
  metaDot: { color: '#c9c0b6', marginHorizontal: 4, fontSize: 12 },
  rowExpanded: { paddingBottom: 10, paddingLeft: 15 },
  expandDivider: { height: 1, backgroundColor: '#f0ece6', marginBottom: 8 },
  expandGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  expandField: { marginRight: 16 },
  expandLabel: { fontSize: 10, color: '#9e8e7e', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  expandValue: { fontSize: 13, color: '#3d2b1f', fontWeight: '500', marginTop: 2 },
  rail: { flex: 1, alignItems: 'center', paddingVertical: 12, paddingTop: 24, position: 'relative' },
  railLine: { position: 'absolute', top: 24, bottom: 12, width: 1, backgroundColor: '#e0d9d0', zIndex: 0 },
  railItem: { alignItems: 'center', paddingVertical: 5, zIndex: 1, minHeight: 44, justifyContent: 'center' },
  railLabel: { fontSize: 10, fontWeight: '600', color: '#c9c0b6', textAlign: 'center' },
  railLabelActive: { color: '#3d2b1f', fontWeight: '800' },
  railActiveDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#8c6239', marginTop: 2 },
  railFloat: { position: 'absolute', right: '100%', top: '30%', backgroundColor: '#3d2b1f', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, zIndex: 100, minWidth: 64 },
  railFloatText: { color: '#fff', fontSize: 11, fontWeight: '700', textAlign: 'center', textTransform: 'uppercase', lineHeight: 15 },
  emptyContainer: { alignItems: 'center', marginTop: 60, paddingHorizontal: 24 },
  emptyText: { fontSize: 16, fontWeight: '600', color: '#6b5e53', marginTop: 12 },
  emptySubtext: { fontSize: 13, color: '#9e8e7e', marginTop: 4, textAlign: 'center' },
  fab: { position: 'absolute', right: 16, bottom: 24, width: 52, height: 52, borderRadius: 26, backgroundColor: '#3d2b1f', justifyContent: 'center', alignItems: 'center', elevation: 6 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' },
  actionMenu: { backgroundColor: '#fff', borderRadius: 16, padding: 20, width: '78%', maxWidth: 300 },
  menuTitle: { fontSize: 17, fontWeight: '700', color: '#3d2b1f', marginBottom: 14, textAlign: 'center' },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0ece6' },
  menuItemText: { fontSize: 15, marginLeft: 12, color: '#1a1512' },
  menuCancel: { marginTop: 10, alignItems: 'center' },
  menuCancelText: { fontSize: 15, fontWeight: '600', color: '#6b5e53' },
  toastOverlay: {
    position: 'absolute',
    top: 20,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    zIndex: 999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 8,
  },
  toastSuccess: { backgroundColor: '#e8f5e9' },
  toastError: { backgroundColor: '#ffebee' },
  toastText: { marginLeft: 10, fontSize: 14, fontWeight: '600', color: '#1a1512' },
});