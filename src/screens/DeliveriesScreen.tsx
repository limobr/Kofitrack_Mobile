import React, {
  useState, useEffect, useCallback, useRef, useMemo,
} from 'react';
import {
  View, Text, TextInput, SectionList, StyleSheet,
  ActivityIndicator, TouchableOpacity, RefreshControl,
  Alert, Modal, Animated, Dimensions, Platform,
  LayoutAnimation, UIManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import NetInfo from '@react-native-community/netinfo';
import api from '../api/client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { enqueuePrintJob } from '../services/printQueue';
import { syncPendingDeliveries } from '../services/syncService';
import {
  getAllLocalDeliveries,
  deletePendingDelivery,
  markDeliverySynced,
  updateDeliveryState,
} from '../db';
import eventEmitter from '../services/eventEmitter';
import { useSyncStatus } from '../hooks/useSyncStatus';
import PendingDeliveriesModal from '../components/PendingDeliveriesModal';
import {
  refreshFactorySettings,
  getFactorySettings,
} from '../services/factorySettingsCache';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width: screenWidth } = Dimensions.get('window');

const isTablet = screenWidth >= 768;
const LIST_FLEX = isTablet ? 0.92 : 0.88;
const RAIL_FLEX = isTablet ? 0.08 : 0.12;

const PAGE_SIZE = 50;

// ─── Types ───────────────────────────────────────────────────────────────────

interface DeliveriesScreenProps {
  type: 'cherry' | 'mbuni';
}

interface Delivery {
  id: number;
  coffee_type: string;
  kgs_delivered: number;
  delivery_date: string;
  delivery_time: string;
  members: { name: string; reg_no: string } | null;
  profiles: { full_name: string } | null;
  receipt_no?: string | null;
  recording_type?: string;
  isPending?: boolean;
  pendingStatus?: string;
  season_name?: string;
}

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

interface DayGroup {
  dayLabel: string;
  dayKey: string;
  items: Delivery[];
  _type: 'dayGroup';
}

interface Section {
  title: string;
  monthKey: string;
  data: DayGroup[];
}

interface MonthEntry {
  key: string;
  label: string;
  year: string;
  count?: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const fmt24 = (timeStr: string): string => {
  if (!timeStr) return '—';
  if (timeStr.includes('T')) return new Date(timeStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  return timeStr.slice(0, 5);
};

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

const groupDeliveries = (deliveries: Delivery[]): Section[] => {
  if (!deliveries.length) return [];

  const sorted = [...deliveries].sort((a, b) => {
    const da = new Date(`${a.delivery_date}T${a.delivery_time || '00:00'}`);
    const db = new Date(`${b.delivery_date}T${b.delivery_time || '00:00'}`);
    return db.getTime() - da.getTime();
  });

  const monthMap = new Map<string, Map<string, Delivery[]>>();
  for (const item of sorted) {
    const mk = getMonthKey(item.delivery_date);
    if (!mk) continue;
    const dk = item.delivery_date;
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
    sections.push({ title: getMonthTitle(mk), monthKey: mk, data });
  }
  return sections;
};

// ─── Sub-components ──────────────────────────────────────────────────────────

const SyncDot = ({ item }: { item: Delivery }) => {
  if (item.isPending) {
    const color =
      item.pendingStatus === 'failed'  ? '#c62828' :
      item.pendingStatus === 'syncing' ? '#2196f3' :
      '#f59e0b';
    return <View style={[styles.syncDot, { backgroundColor: color }]} />;
  }
  return <View style={[styles.syncDot, { backgroundColor: '#2e7d32' }]} />;
};

const DeliveryRow = React.memo(({ item, onLongPress }: {
  item: Delivery;
  onLongPress: (item: Delivery) => void;
}) => {
  const [expanded, setExpanded] = useState(false);

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded(v => !v);
  };

  const kgs = Number(item.kgs_delivered) || 0;
  const memberDisplay = item.members?.reg_no && item.members?.name
    ? `${item.members.reg_no}. ${item.members.name}`
    : item.members?.name || 'Unknown';

  return (
    <TouchableOpacity
      style={[styles.row, item.isPending && styles.rowPending]}
      onPress={toggle}
      onLongPress={() => onLongPress(item)}
      activeOpacity={0.8}
    >
      <View style={styles.rowMain}>
        <View style={styles.rowLeft}>
          <SyncDot item={item} />
          <Text style={styles.rowName} numberOfLines={1}>{memberDisplay}</Text>
        </View>
        <View style={styles.rowRight}>
          <Text style={styles.rowKgs}>{kgs % 1 === 0 ? kgs : kgs.toFixed(1)}kg</Text>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={14}
            color="#9e8e7e"
            style={{ marginLeft: 6 }}
          />
        </View>
      </View>

      <View style={styles.rowSub}>
        <Text style={styles.rowMeta}>{fmt24(item.delivery_time)}</Text>
        {item.receipt_no && !item.isPending && (
          <>
            <Text style={styles.metaDot}>·</Text>
            <Text style={[styles.rowMeta, styles.receiptMono]}>{item.receipt_no}</Text>
          </>
        )}
        {item.isPending && (
          <>
            <Text style={styles.metaDot}>·</Text>
            <Text style={[styles.rowMeta, { color: '#f59e0b' }]}>Pending sync</Text>
          </>
        )}
      </View>

      {expanded && (
        <View style={styles.rowExpanded}>
          <View style={styles.expandDivider} />
          <View style={styles.expandGrid}>
            {item.coffee_type && (
              <View style={styles.expandField}>
                <Text style={styles.expandLabel}>Coffee</Text>
                <Text style={styles.expandValue}>{item.coffee_type}</Text>
              </View>
            )}
            {item.profiles?.full_name && (
              <View style={styles.expandField}>
                <Text style={styles.expandLabel}>Clerk</Text>
                <Text style={styles.expandValue}>{item.profiles.full_name}</Text>
              </View>
            )}
            <View style={styles.expandField}>
              <Text style={styles.expandLabel}>Recorded</Text>
              <Text style={styles.expandValue}>
                {new Date(item.delivery_date).toLocaleDateString('en-GB', {
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
          <Text style={styles.railFloatText}>
            {getMonthTitle(hoveredKey).replace(/ /g, '\n')}
          </Text>
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

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function DeliveriesScreen({ type }: DeliveriesScreenProps) {
  const navigation = useNavigation<any>();
  const { pendingCount: globalPendingCount, refreshPendingCount } = useSyncStatus();

  const [serverDeliveries, setServerDeliveries]           = useState<Delivery[]>([]);
  const [pendingDeliveriesList, setPendingDeliveriesList] = useState<Delivery[]>([]);
  const [search, setSearch]         = useState('');
  const [loading, setLoading]       = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]           = useState('');
  const [hasMore, setHasMore]       = useState(true);

  const offsetRef  = useRef(0);
  const isFetching = useRef(false);

  // ─── KEY FIX: track whether the mount-init has completed.
  // useFocusEffect fires on the very first focus, which is BEFORE or DURING
  // the mount useEffect's async work. We block it until init is done.
  const initDoneRef = useRef(false);

  const [selectedItem, setSelectedItem]               = useState<Delivery | null>(null);
  const [menuVisible, setMenuVisible]                 = useState(false);
  const [pendingModalVisible, setPendingModalVisible] = useState(false);
  const [pendingDeliveries, setPendingDeliveries]     = useState<PendingDelivery[]>([]);
  const [loadingPending, setLoadingPending]           = useState(false);
  const [syncingPendingId, setSyncingPendingId]       = useState<string | null>(null);

  const [printerAddress, setPrinterAddress]   = useState('');
  const [paperWidth, setPaperWidth]           = useState<58 | 80>(58);
  const [factorySettings, setFactorySettings] = useState<any>(null);

  const [months, setMonths]           = useState<MonthEntry[]>([]);
  const [activeMonth, setActiveMonth] = useState('');

  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const toastOpacity    = useRef(new Animated.Value(0)).current;
  const toastTranslateY = useRef(new Animated.Value(-30)).current;

  const sectionListRef  = useRef<SectionList>(null);
  const monthSectionMap = useRef<Record<string, number>>({});

  // ─── Toast ──────────────────────────────────────────────────────────────────

  const showToast = (text: string, toastType: 'success' | 'error') => {
    setToast({ text, type: toastType });
    toastTranslateY.setValue(-30);
    toastOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(toastOpacity,    { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.timing(toastTranslateY, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start();
    setTimeout(() => {
      Animated.parallel([
        Animated.timing(toastOpacity,    { toValue: 0, duration: 300, useNativeDriver: true }),
        Animated.timing(toastTranslateY, { toValue: -30, duration: 300, useNativeDriver: true }),
      ]).start(() => setToast(null));
    }, 3000);
  };

  // ─── Settings ───────────────────────────────────────────────────────────────

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const raw = await AsyncStorage.getItem('selectedPrinter');
        if (raw) {
          const { address } = JSON.parse(raw);
          if (address) setPrinterAddress(address);
        }
        const pw = await AsyncStorage.getItem('paperWidth');
        if (pw) setPaperWidth(Number(pw) as 58 | 80);

        // Use the shared cache: try a live refresh first, fall back to
        // the cached/disk copy so the header is never "KOFITRACK FACTORY"
        // just because the device is currently offline.
        const settings = await refreshFactorySettings();
        if (settings) setFactorySettings(settings);
        else {
          const cached = await getFactorySettings();
          if (cached) setFactorySettings(cached);
        }
      } catch {}
    };
    loadSettings();
  }, []);

  // ─── Cache ───────────────────────────────────────────────────────────────────

  const CACHE_KEY = '@deliveries_cache_v2';

  const loadCache = async (coffeeType: string): Promise<Delivery[] | null> => {
    try {
      const cached = await AsyncStorage.getItem(`${CACHE_KEY}_${coffeeType}`);
      if (cached) {
        const data = JSON.parse(cached);
        if (data.type === coffeeType && data.deliveries?.length) return data.deliveries;
      }
    } catch {}
    return null;
  };

  const saveCache = async (coffeeType: string, deliveries: Delivery[]) => {
    if (!deliveries.length) return;
    try {
      await AsyncStorage.setItem(`${CACHE_KEY}_${coffeeType}`, JSON.stringify({
        type: coffeeType,
        deliveries: deliveries.slice(0, PAGE_SIZE),
        timestamp: Date.now(),
      }));
    } catch {}
  };

  // ─── Fetch ───────────────────────────────────────────────────────────────────

  const fetchServerDeliveries = useCallback(async (reset: boolean, caller: string): Promise<Delivery[]> => {
    console.log(`📦 [${type}] fetchServerDeliveries called — reset=${reset} caller="${caller}" isFetching=${isFetching.current} offset=${offsetRef.current}`);

    if (isFetching.current) {
      console.warn(`⛔ [${type}] fetchServerDeliveries BLOCKED — already in flight (caller="${caller}")`);
      return [];
    }

    const net = await NetInfo.fetch();
    console.log(`🌐 [${type}] network isConnected=${net.isConnected}`);

    if (!net.isConnected) {
      if (reset) setHasMore(false);
      console.log(`📴 [${type}] offline — skipping fetch`);
      return [];
    }

    const currentOffset = reset ? 0 : offsetRef.current;
    isFetching.current = true;
    console.log(`🔒 [${type}] isFetching locked`);

    try {
      const url = `/deliveries?type=${type}&sortKey=delivery_date&sortDir=desc&limit=${PAGE_SIZE}&offset=${currentOffset}`;
      console.log(`🔗 [${type}] GET ${url}`);
      const { data } = await api.get(url);

      const newDeliveries: Delivery[] = (data.deliveries || []).map((d: any) => ({
        ...d,
        kgs_delivered: Number(d.kgs_delivered),
        isPending: false,
      }));

      console.log(`✅ [${type}] fetch returned ${newDeliveries.length} items (reset=${reset})`);

      if (reset) {
        setServerDeliveries(newDeliveries);
        offsetRef.current = PAGE_SIZE;
        setHasMore(newDeliveries.length === PAGE_SIZE);
        await saveCache(type, newDeliveries);
        console.log(`💾 [${type}] serverDeliveries SET to ${newDeliveries.length} items`);
      } else {
        setServerDeliveries(prev => {
          const merged = [...prev, ...newDeliveries];
          console.log(`💾 [${type}] serverDeliveries APPENDED — prev=${prev.length} new=${newDeliveries.length} total=${merged.length}`);
          return merged;
        });
        offsetRef.current = offsetRef.current + PAGE_SIZE;
        setHasMore(newDeliveries.length === PAGE_SIZE);
      }
      return newDeliveries;
    } catch (err: any) {
      console.error(`❌ [${type}] fetch ERROR — ${err.message}`);
      setError(err.message);
      return [];
    } finally {
      isFetching.current = false;
      console.log(`🔓 [${type}] isFetching unlocked`);
    }
  }, [type]);

  // ─── Pending list ────────────────────────────────────────────────────────────

  const loadPendingList = useCallback(async () => {
    console.log(`⏳ [${type}] loadPendingList`);
    const local = await getAllLocalDeliveries();
    const pending = local
      .filter(p => p.coffee_type === type && p.status !== 'synced')
      .map(p => ({
        id: 0,
        coffee_type: p.coffee_type,
        kgs_delivered: p.kgs,
        delivery_date: p.recorded_at.split('T')[0],
        delivery_time: new Date(p.recorded_at).toLocaleTimeString(),
        members: { name: p.member_name, reg_no: '' },
        profiles: { full_name: `Pending (${p.status})` },
        isPending: true,
        pendingStatus: p.status,
      }));
    console.log(`⏳ [${type}] loadPendingList found ${pending.length} pending`);
    setPendingDeliveriesList(pending);
  }, [type]);

  // ─── Refresh (pull-to-refresh / focus re-fetch) ───────────────────────────────

  const refreshAll = useCallback(async (caller: string) => {
    console.log(`🔄 [${type}] refreshAll called by="${caller}"`);
    setRefreshing(true);
    await fetchServerDeliveries(true, `refreshAll[${caller}]`);
    await loadPendingList();
    setRefreshing(false);
    console.log(`🔄 [${type}] refreshAll done`);
  }, [fetchServerDeliveries, loadPendingList]);

  // ─── Mount init ──────────────────────────────────────────────────────────────
  // Runs once when the component mounts (key={type} guarantees one mount per type).
  // Sets initDoneRef=true when finished so useFocusEffect knows not to double-fetch.

  useEffect(() => {
    let cancelled = false;
    console.log(`🚀 [${type}] mount init — starting`);

    const init = async () => {
      // 1. Instant paint from cache, if we have one — regardless of
      // online/offline state. This avoids showing a blank spinner on every
      // cold open while online when we already have something to show.
      const cached = await loadCache(type);
      console.log(`🚀 [${type}] mount init — cache items=${cached?.length ?? 0}`);
      if (cached && cached.length) {
        if (!cancelled) {
          setServerDeliveries(cached);
          setLoading(false);
        }
      } else {
        if (!cancelled) setLoading(true);
      }

      // 2. Background refresh from server (replaces cache silently on success)
      const net = await NetInfo.fetch();
      console.log(`🚀 [${type}] mount init — isConnected=${net.isConnected}`);

      if (cancelled) {
        console.log(`🚀 [${type}] mount init — cancelled before fetch`);
        return;
      }

      if (net.isConnected) {
        await fetchServerDeliveries(true, 'mountInit');
      } else if (!cached) {
        // no cache and offline — nothing more we can do
        console.log(`🚀 [${type}] mount init — offline, no cache`);
        setHasMore(false);
      }

      if (!cancelled) {
        await loadPendingList();
        setLoading(false);
        initDoneRef.current = true;
        console.log(`🚀 [${type}] mount init — COMPLETE, initDone=true`);
      }
    };

    init();
    return () => {
      cancelled = true;
      console.log(`🚀 [${type}] mount init — cleanup (cancelled)`);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Empty deps is intentional: type is stable for this instance's lifetime.

  // ─── Focus re-fetch ───────────────────────────────────────────────────────────
  // Only fires AFTER initDoneRef=true, preventing the double-fetch that was
  // wiping the list. On first focus (mount), init handles the fetch; subsequent
  // focuses (returning from RecordDelivery, etc.) trigger a real refresh.

  useFocusEffect(useCallback(() => {
    if (!initDoneRef.current) {
      console.log(`👁️ [${type}] useFocusEffect — init not done yet, skipping`);
      return;
    }
    console.log(`👁️ [${type}] useFocusEffect — init done, refreshing`);
    refreshAll('focusEffect');
  }, [refreshAll]));

  // ─── Periodic background check ───────────────────────────────────────────────

  useEffect(() => {
    const checkNew = async () => {
      const net = await NetInfo.fetch();
      if (!net.isConnected || isFetching.current) return;
      try {
        const { data } = await api.get(
          `/deliveries?type=${type}&sortKey=delivery_date&sortDir=desc&limit=1&offset=0`
        );
        const latestId = data.deliveries?.[0]?.id;
        setServerDeliveries(prev => {
          if (latestId && prev.length > 0 && latestId > prev[0]?.id) {
            console.log(`🔔 [${type}] background check — new delivery detected, refreshing`);
            fetchServerDeliveries(true, 'backgroundCheck');
            loadPendingList();
          }
          return prev;
        });
      } catch {}
    };

    const interval = setInterval(checkNew, 60_000);
    return () => clearInterval(interval);
  }, [fetchServerDeliveries, loadPendingList, type]);

  // ─── Load more (pagination) ──────────────────────────────────────────────────

  const loadMore = async () => {
    // Guard against onEndReached firing while mount-init's cache paint is
    // showing but the background refresh (which sets the real offset)
    // hasn't completed yet — otherwise this fires at offset=0 and appends
    // a duplicate first page on top of the cached items, causing duplicate
    // keys in the SectionList.
    if (!initDoneRef.current || loadingMore || !hasMore || isFetching.current) return;
    const net = await NetInfo.fetch();
    if (!net.isConnected) return;
    console.log(`📄 [${type}] loadMore — offset=${offsetRef.current}`);
    setLoadingMore(true);
    await fetchServerDeliveries(false, 'loadMore');
    setLoadingMore(false);
  };

  // ─── Sync event listener ─────────────────────────────────────────────────────

  useEffect(() => {
    const onSyncFinished = () => {
      console.log(`🔁 [${type}] syncFinished event`);
      refreshAll('syncFinished');
      refreshPendingCount();
      if (pendingModalVisible) loadPendingDeliveriesModal();
    };
    eventEmitter.on('syncFinished', onSyncFinished);
    return () => eventEmitter.off('syncFinished', onSyncFinished);
  }, [pendingModalVisible]);

  // ─── Derived data ────────────────────────────────────────────────────────────

  const allDeliveries = useMemo(() => {
    let combined = [...pendingDeliveriesList, ...serverDeliveries];
    if (search.trim()) {
      const s = search.toLowerCase();
      combined = combined.filter(d =>
        d.members?.name?.toLowerCase().includes(s) ||
        d.profiles?.full_name?.toLowerCase().includes(s)
      );
    }
    console.log(`📊 [${type}] allDeliveries — server=${serverDeliveries.length} pending=${pendingDeliveriesList.length} combined=${combined.length}`);
    return combined;
  }, [pendingDeliveriesList, serverDeliveries, search]);

  const sections = useMemo(() => {
    const s = groupDeliveries(allDeliveries);
    console.log(`📅 [${type}] sections — ${s.length} months, ${allDeliveries.length} total deliveries`);
    return s;
  }, [allDeliveries]);

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

  // ─── Month rail navigation ───────────────────────────────────────────────────

  const jumpToMonth = useCallback((monthKey: string) => {
    const idx = monthSectionMap.current[monthKey];
    if (idx == null) return;
    try {
      sectionListRef.current?.scrollToLocation({
        sectionIndex: idx, itemIndex: 0, animated: true, viewPosition: 0,
      });
      setActiveMonth(monthKey);
    } catch {}
  }, []);

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (!viewableItems.length) return;
    const first = viewableItems[0];
    if (first?.section?.monthKey) setActiveMonth(first.section.monthKey);
  }).current;

  const viewabilityConfig = { itemVisiblePercentThreshold: 20 };

  // ─── Pending deliveries modal ────────────────────────────────────────────────

  const loadPendingDeliveriesModal = async () => {
    setLoadingPending(true);
    try {
      const pending = await getAllLocalDeliveries();
      setPendingDeliveries(
        pending.filter(p => p.status !== 'synced').map(p => ({
          id: p.id, local_uuid: p.local_uuid, client_uuid: p.client_uuid,
          coffee_type: p.coffee_type, member_id: p.member_id,
          member_name: p.member_name, kgs: p.kgs,
          recorded_at: p.recorded_at, status: p.status,
          retry_count: p.retry_count || 0, sync_error: p.sync_error || null,
        }))
      );
    } finally {
      setLoadingPending(false);
    }
  };

  // ─── Single delivery sync ────────────────────────────────────────────────────

  const syncSingleDelivery = async (delivery: PendingDelivery) => {
    setSyncingPendingId(delivery.local_uuid);
    try {
      await updateDeliveryState(delivery.local_uuid, { status: 'syncing' });
      const response = await api.post('/deliveries', {
        type: delivery.coffee_type, memberId: delivery.member_id,
        kgs: delivery.kgs, client_uuid: delivery.client_uuid,
        recording_type: 'offline_sync',
      });
      if (!response.data.confirmed) throw new Error('Not confirmed');
      await updateDeliveryState(delivery.local_uuid, { status: 'verifying' });
      const verify = await api.get(`/deliveries?client_uuid=${delivery.client_uuid}`);
      if (!verify.data.exists) throw new Error('Verification failed');
      await markDeliverySynced(delivery.local_uuid, verify.data.receipt_no);
      await loadPendingDeliveriesModal();
      refreshPendingCount();
      await loadPendingList();
      showToast('Delivery synced', 'success');
    } catch (err: any) {
      await updateDeliveryState(delivery.local_uuid, { status: 'failed', sync_error: err.message });
      showToast('Sync failed: ' + err.message, 'error');
    } finally {
      setSyncingPendingId(null);
    }
  };

  // ─── Delete pending ──────────────────────────────────────────────────────────

  const handleDeletePending = async (local_uuid: string) => {
    await deletePendingDelivery(local_uuid);
    await loadPendingDeliveriesModal();
    refreshPendingCount();
    await loadPendingList();
  };

  // ─── Reprint receipt ─────────────────────────────────────────────────────────

  const reprintReceipt = async () => {
    if (!selectedItem || selectedItem.isPending) {
      showToast('Pending deliveries have no receipt yet', 'error');
      setMenuVisible(false);
      return;
    }
    let addr = printerAddress;
    let pw = paperWidth;
    if (!addr) {
      try {
        const raw = await AsyncStorage.getItem('selectedPrinter');
        if (raw) { const parsed = JSON.parse(raw); addr = parsed.address; setPrinterAddress(addr); }
        const pws = await AsyncStorage.getItem('paperWidth');
        if (pws) { pw = Number(pws) as 58 | 80; setPaperWidth(pw); }
      } catch {}
    }
    if (!addr) {
      showToast('No printer configured. Go to Account settings.', 'error');
      setMenuVisible(false);
      return;
    }
    const item = selectedItem;
    enqueuePrintJob({
      type: 'delivery',
      memberName: item.members?.name || '',
      regNo: item.members?.reg_no || '',
      kgs: Number(item.kgs_delivered),
      coffeeType: (item.coffee_type || type) as 'cherry' | 'mbuni',
      date: item.delivery_date,
      time: item.delivery_time,
      config: {
        printerAddress: addr,
        paperWidth: pw,
        receiptSettings: factorySettings?.settings?.receipt,
        factoryInfo: factorySettings?.settings?.factoryInfo,
        factoryName: factorySettings?.name,
        clerk: item.profiles?.full_name || '',
        receiptNo: item.receipt_no ?? undefined,
        season: (item as any).season_name || undefined,
      },
    });
    showToast('Added to print queue', 'success');
    setMenuVisible(false);
  };

  // ─── Delete delivery ──────────────────────────────────────────────────────────

  const confirmDelete = () => {
  if (!selectedItem) return;
  const kgs = Number(selectedItem.kgs_delivered).toFixed(2);
  const memberName = selectedItem.members?.name || 'Unknown';
  Alert.alert(
    'Delete Delivery',
    `Delete ${kgs} kg delivery by ${memberName}? This action cannot be undone.`,
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteDelivery(selectedItem) },
    ]
  );
  setMenuVisible(false);
};

  const deleteDelivery = async (item: Delivery) => {
  if (!item.id || item.isPending) {
    showToast('Sync first or delete from pending queue.', 'error');
    return;
  }
  const coffeeType = item.coffee_type || type;
  const url = `/deliveries?id=${item.id}&type=${coffeeType}`;
  console.log(`🗑️ Deleting delivery with URL: ${url}`);
  try {
    await api.delete(url);
    await refreshAll('deleteDelivery');
    showToast('Delivery deleted', 'success');
  } catch (e: any) {
    console.error('Delete error:', e);
    showToast(e.response?.data?.error || 'Could not delete', 'error');
  }
};

  // ─── Render helpers ───────────────────────────────────────────────────────────

  const renderSectionHeader = ({ section }: { section: any }) => {
    const customSection = section as unknown as Section;
    return (
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionHeaderText}>{customSection.title}</Text>
      </View>
    );
  };

  const renderItem = ({ item }: { item: DayGroup }) => (
    <View>
      <View style={styles.dayHeader}>
        <Text style={styles.dayHeaderText}>{item.dayLabel}</Text>
        <View style={styles.dayDivider} />
      </View>
      {item.items.map((delivery, idx) => (
        <DeliveryRow
          key={delivery.id ? delivery.id.toString() : `p-${idx}`}
          item={delivery}
          onLongPress={(d) => { setSelectedItem(d); setMenuVisible(true); }}
        />
      ))}
    </View>
  );

  const keyExtractor = (item: DayGroup, index: number) => `${item.dayKey}-${index}`;

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>

      {toast && (
        <Animated.View
          style={[
            styles.toast,
            toast.type === 'success' ? styles.toastSuccess : styles.toastError,
            { opacity: toastOpacity, transform: [{ translateY: toastTranslateY }] },
          ]}
          pointerEvents="none"
        >
          <Ionicons
            name={toast.type === 'success' ? 'checkmark-circle' : 'alert-circle'}
            size={18}
            color={toast.type === 'success' ? '#2e7d32' : '#c62828'}
          />
          <Text style={styles.toastText}>{toast.text}</Text>
        </Animated.View>
      )}

      <View style={styles.searchRow}>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={16} color="#8c6239" style={{ marginRight: 6 }} />
          <TextInput
            placeholder="Search member…"
            placeholderTextColor="#9e8e7e"
            value={search}
            onChangeText={setSearch}
            style={styles.searchInput}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color="#9e8e7e" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={16} color="#c62828" />
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
              onEndReachedThreshold={0.6}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={() => {
                    if (!initDoneRef.current) {
                      console.log(`👁️ [${type}] RefreshControl onRefresh — init not done yet, ignoring spurious fire`);
                      return;
                    }
                    refreshAll('pullToRefresh');
                  }}
                  colors={['#8c6239']}
                  tintColor="#8c6239"
                />
              }
              onViewableItemsChanged={onViewableItemsChanged}
              viewabilityConfig={viewabilityConfig}
              initialNumToRender={20}
              maxToRenderPerBatch={20}
              windowSize={10}
              ListFooterComponent={
                loadingMore
                  ? <ActivityIndicator style={{ margin: 16 }} color="#8c6239" />
                  : null
              }
              ListEmptyComponent={
                <View style={styles.empty}>
                  <Ionicons name="leaf-outline" size={40} color="#d9d0c7" />
                  <Text style={styles.emptyText}>No deliveries found</Text>
                  <Text style={styles.emptySubtext}>Try pulling to refresh</Text>
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

      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('RecordDelivery')}
      >
        <Ionicons name="add" size={26} color="#faf9f6" />
      </TouchableOpacity>

      {globalPendingCount > 0 && (
        <TouchableOpacity
          style={[styles.fab, styles.syncFab]}
          onPress={async () => {
            await loadPendingDeliveriesModal();
            setPendingModalVisible(true);
          }}
        >
          <Ionicons name="sync" size={22} color="#faf9f6" />
          <View style={styles.syncBadge}>
            <Text style={styles.syncBadgeText}>{globalPendingCount}</Text>
          </View>
        </TouchableOpacity>
      )}

      <PendingDeliveriesModal
        visible={pendingModalVisible}
        pendingDeliveries={pendingDeliveries}
        loadingPending={loadingPending}
        syncingPendingId={syncingPendingId}
        onClose={() => setPendingModalVisible(false)}
        onSyncAll={async () => {
          setPendingModalVisible(false);
          await syncPendingDeliveries();
        }}
        onSyncSingle={syncSingleDelivery}
        onDelete={handleDeletePending}
      />

      <Modal visible={menuVisible} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setMenuVisible(false)}
        >
          <View style={styles.actionMenu}>
            <Text style={styles.menuTitle}>Actions</Text>
            <TouchableOpacity style={styles.menuItem} onPress={reprintReceipt}>
              <Ionicons name="print-outline" size={20} color="#3d2b1f" />
              <Text style={styles.menuItemText}>Reprint Receipt</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.menuItem} onPress={confirmDelete}>
              <Ionicons name="trash-outline" size={20} color="#c62828" />
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

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:         { flex: 1, backgroundColor: '#faf9f6', paddingHorizontal: 12, paddingTop: 8 },
  searchRow:         { marginBottom: 8 },
  searchWrap:        { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#d9d0c7', paddingHorizontal: 10, paddingVertical: 8 },
  searchInput:       { flex: 1, fontSize: 14, color: '#1a1512' },
  errorBanner:       { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffebee', borderRadius: 8, padding: 8, marginBottom: 8 },
  errorText:         { flex: 1, color: '#c62828', fontSize: 12, marginLeft: 6 },
  retryText:         { color: '#8c6239', fontWeight: '700', fontSize: 13, marginLeft: 8 },
  mainArea:          { flex: 1, flexDirection: 'row' },
  sectionHeader:     { backgroundColor: '#faf9f6', paddingVertical: 6, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: '#e0d9d0', marginBottom: 2 },
  sectionHeaderText: { fontSize: 11, fontWeight: '800', color: '#8c6239', letterSpacing: 1.2 },
  dayHeader:         { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 4, marginTop: 4 },
  dayHeaderText:     { fontSize: 11, fontWeight: '600', color: '#9e8e7e', marginRight: 8, flexShrink: 0 },
  dayDivider:        { flex: 1, height: 1, backgroundColor: '#ede8e2' },
  row:               { backgroundColor: '#fff', paddingHorizontal: 10, marginBottom: 1, borderRadius: 8, borderWidth: 1, borderColor: '#ede8e2', minHeight: 56, justifyContent: 'center' },
  rowPending:        { backgroundColor: '#fffbf0', borderColor: '#f0c97a' },
  rowMain:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10, paddingBottom: 2 },
  rowLeft:           { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 },
  rowRight:          { flexDirection: 'row', alignItems: 'center' },
  syncDot:           { width: 7, height: 7, borderRadius: 4, marginRight: 8 },
  rowName:           { fontSize: 14, fontWeight: '600', color: '#1a1512', flex: 1 },
  rowKgs:            { fontSize: 14, fontWeight: '700', color: '#8c6239' },
  rowSub:            { flexDirection: 'row', alignItems: 'center', paddingBottom: 10, paddingLeft: 15 },
  rowMeta:           { fontSize: 11, color: '#9e8e7e' },
  receiptMono:       { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', color: '#7a6a5a' },
  metaDot:           { color: '#c9c0b6', marginHorizontal: 4, fontSize: 12 },
  rowExpanded:       { paddingBottom: 10, paddingLeft: 15 },
  expandDivider:     { height: 1, backgroundColor: '#f0ece6', marginBottom: 8 },
  expandGrid:        { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  expandField:       { marginRight: 16 },
  expandLabel:       { fontSize: 10, color: '#9e8e7e', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  expandValue:       { fontSize: 13, color: '#3d2b1f', fontWeight: '500', marginTop: 2 },
  rail:              { flex: 1, alignItems: 'center', paddingVertical: 12, paddingTop: 24, position: 'relative' },
  railLine:          { position: 'absolute', top: 24, bottom: 12, width: 1, backgroundColor: '#e0d9d0', zIndex: 0 },
  railItem:          { alignItems: 'center', paddingVertical: 5, zIndex: 1, minHeight: 44, justifyContent: 'center' },
  railLabel:         { fontSize: 10, fontWeight: '600', color: '#c9c0b6', textAlign: 'center' },
  railLabelActive:   { color: '#3d2b1f', fontWeight: '800' },
  railActiveDot:     { width: 5, height: 5, borderRadius: 3, backgroundColor: '#8c6239', marginTop: 2 },
  railFloat:         { position: 'absolute', right: '100%', top: '30%', backgroundColor: '#3d2b1f', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, zIndex: 100, minWidth: 64 },
  railFloatText:     { color: '#fff', fontSize: 11, fontWeight: '700', textAlign: 'center', textTransform: 'uppercase', lineHeight: 15 },
  empty:             { alignItems: 'center', marginTop: 60, paddingHorizontal: 24 },
  emptyText:         { fontSize: 16, fontWeight: '600', color: '#6b5e53', marginTop: 12 },
  emptySubtext:      { fontSize: 13, color: '#9e8e7e', marginTop: 4, textAlign: 'center' },
  fab:               { position: 'absolute', right: 16, bottom: 24, width: 52, height: 52, borderRadius: 26, backgroundColor: '#3d2b1f', justifyContent: 'center', alignItems: 'center', elevation: 6 },
  syncFab:           { left: 16, right: undefined, backgroundColor: '#8c6239' },
  syncBadge:         { position: 'absolute', top: -4, right: -4, backgroundColor: '#c62828', borderRadius: 10, minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4 },
  syncBadgeText:     { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  modalOverlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' },
  actionMenu:        { backgroundColor: '#fff', borderRadius: 16, padding: 20, width: '78%', maxWidth: 300 },
  menuTitle:         { fontSize: 17, fontWeight: '700', color: '#3d2b1f', marginBottom: 14, textAlign: 'center' },
  menuItem:          { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f0ece6' },
  menuItemText:      { fontSize: 15, marginLeft: 12, color: '#1a1512' },
  menuCancel:        { marginTop: 10, alignItems: 'center' },
  menuCancelText:    { fontSize: 15, fontWeight: '600', color: '#6b5e53' },
  toast:             { position: 'absolute', top: 56, left: 12, right: 12, flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, zIndex: 999, elevation: 8 },
  toastSuccess:      { backgroundColor: '#e8f5e9' },
  toastError:        { backgroundColor: '#ffebee' },
  toastText:         { marginLeft: 8, fontSize: 13, fontWeight: '600', color: '#1a1512', flex: 1 },
});