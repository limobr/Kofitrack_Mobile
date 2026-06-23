import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Animated,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import NetInfo from '@react-native-community/netinfo';
import api from '../api/client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { printTransactionReceipt } from '../services/printService';
import { useAuth } from '../contexts/AuthContext';
import Header from '../components/Header';

// ---------- Custom numeric keyboard ----------
interface NumericKeyboardProps {
  onKeyPress: (key: string) => void;
  onEnter: () => void;
  onClear: () => void;
  focusedInput: 'sellerReg' | 'buyerReg' | 'weight' | null;
}

const NumericKeyboard: React.FC<NumericKeyboardProps> = ({ onKeyPress, onEnter, onClear, focusedInput }) => {
  const keys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', '.', '0', '⌫'];

  return (
    <View style={styles.keyboardContainer}>
      <View style={styles.keyboardRow}>
        {keys.slice(0, 3).map(key => (
          <TouchableOpacity key={key} style={styles.keyboardKey} onPress={() => onKeyPress(key)}>
            <Text style={styles.keyboardKeyText}>{key}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.keyboardRow}>
        {keys.slice(3, 6).map(key => (
          <TouchableOpacity key={key} style={styles.keyboardKey} onPress={() => onKeyPress(key)}>
            <Text style={styles.keyboardKeyText}>{key}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.keyboardRow}>
        {keys.slice(6, 9).map(key => (
          <TouchableOpacity key={key} style={styles.keyboardKey} onPress={() => onKeyPress(key)}>
            <Text style={styles.keyboardKeyText}>{key}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.keyboardRow}>
        {keys.slice(9, 12).map(key => (
          <TouchableOpacity key={key} style={[styles.keyboardKey, key === '0' && styles.keyboardKeyZero]} onPress={() => onKeyPress(key)}>
            <Text style={styles.keyboardKeyText}>{key}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={[styles.keyboardKey, styles.keyboardClearKey]} onPress={onClear}>
          <Text style={[styles.keyboardKeyText, styles.clearText]}>Clear</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.keyboardKey, styles.keyboardEnterKey]} onPress={onEnter}>
          <Text style={[styles.keyboardKeyText, styles.enterText]}>Enter</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default function RecordTransactionScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();

  // Input refs
  const sellerRegRef = useRef<TextInput>(null);
  const buyerRegRef = useRef<TextInput>(null);
  const weightInputRef = useRef<TextInput>(null);

  // States
  const [sellerReg, setSellerReg] = useState('');
  const [buyerReg, setBuyerReg] = useState('');
  const [seller, setSeller] = useState<any>(null);
  const [buyer, setBuyer] = useState<any>(null);
  const [cumulative, setCumulative] = useState({ delivered: 0, bought: 0, sold: 0, net: 0 });
  const [cumulativeAvailable, setCumulativeAvailable] = useState(false);
  const [weight, setWeight] = useState('');
  const [type, setType] = useState<'cherry' | 'mbuni'>('cherry');
  const [loading, setLoading] = useState(false);
  const [searchingSeller, setSearchingSeller] = useState(false);
  const [searchingBuyer, setSearchingBuyer] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [focusedInput, setFocusedInput] = useState<'sellerReg' | 'buyerReg' | 'weight'>('sellerReg');

  // Print‑related
  const [printReceipt, setPrintReceipt] = useState(false);
  const [printerConfigured, setPrinterConfigured] = useState(false);
  const [bluetoothOn, setBluetoothOn] = useState(true);
  const [factorySettings, setFactorySettings] = useState<any>(null);
  const [clerkName, setClerkName] = useState('');
  const [activeSeasonName, setActiveSeasonName] = useState('');
  const [loadingSettings, setLoadingSettings] = useState(true);

  // Toast
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastTranslateY = useRef(new Animated.Value(-30)).current;
  const headerRef = useRef<View>(null);
  const [headerHeight, setHeaderHeight] = useState(100);

  const showToast = (text: string, type: 'success' | 'error') => {
    setToast({ text, type });
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

  const canPrint = printerConfigured && bluetoothOn;

  // Load print preference
  const loadPrintPreference = async () => {
    try {
      const saved = await AsyncStorage.getItem('printReceiptPreference_transaction');
      if (saved !== null) {
        const isPrintOn = saved === 'true';
        setPrintReceipt(isPrintOn);
        console.log(`🖨️ Transaction print preference loaded: ${isPrintOn ? 'ON' : 'OFF'}`);
      } else {
        console.log(`🖨️ Transaction print preference not set, default OFF`);
      }
    } catch (error) {
      console.error('Failed to load print preference:', error);
    }
  };

  const savePrintPreference = async (value: boolean) => {
    try {
      await AsyncStorage.setItem('printReceiptPreference_transaction', value.toString());
      console.log(`🖨️ Transaction print preference saved: ${value ? 'ON' : 'OFF'}`);
    } catch (error) {
      console.error('Failed to save print preference:', error);
    }
  };

  useEffect(() => {
    if (!canPrint && printReceipt) setPrintReceipt(false);
  }, [canPrint]);

  // Monitor network status
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOnline(!!(state.isConnected && state.isInternetReachable));
    });
    return () => unsubscribe();
  }, []);

  // Load settings and print preference
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem('selectedPrinter');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed.address) setPrinterConfigured(true);
        }

        const { data: factoryData } = await api.get('/factory/settings');
        setFactorySettings(factoryData);

        const { data: profileData } = await api.get('/profile');
        if (profileData?.full_name) setClerkName(profileData.full_name);

        const { data: seasonData } = await api.get('/seasons/active');
        if (seasonData?.name) setActiveSeasonName(seasonData.name);
      } catch (e) {
        console.error('Failed to load settings', e);
      } finally {
        setLoadingSettings(false);
      }

      try {
        const BleModule = require('react-native-ble-plx');
        const manager = new BleModule.BleManager();
        const state = await manager.state();
        setBluetoothOn(state === 'PoweredOn');
      } catch (_) {}

      await loadPrintPreference();
    })();
  }, []);

  const fetchSellerCumulative = async (sellerId: string, coffeeType: string) => {
    if (!isOnline) {
      setCumulativeAvailable(false);
      return null;
    }
    try {
      const { data } = await api.get(
        `/cumulatives/member?member_id=${sellerId}&type=${coffeeType}`
      );
      setCumulative(data);
      setCumulativeAvailable(true);
      return data;
    } catch (e: any) {
      setCumulativeAvailable(false);
      showToast(e.response?.data?.error || 'Failed to load totals', 'error');
      return null;
    }
  };

  useEffect(() => {
    if (seller) fetchSellerCumulative(seller.id, type);
  }, [type, isOnline]);

  const searchSeller = async () => {
    if (!sellerReg.trim()) {
      showToast('Enter seller registration number', 'error');
      return;
    }
    setSearchingSeller(true);
    try {
      const { data } = await api.get(`/members/search?reg_no=${sellerReg}`);
      if (data.member) {
        setSeller(data.member);
        await fetchSellerCumulative(data.member.id, type);
        showToast(`Seller ${data.member.name} found`, 'success');
        // Move focus to buyer registration
        setFocusedInput('buyerReg');
        buyerRegRef.current?.focus();
      } else {
        showToast('Seller not found', 'error');
        setSeller(null);
        setCumulative({ delivered: 0, bought: 0, sold: 0, net: 0 });
        setCumulativeAvailable(false);
      }
    } catch (e: any) {
      showToast(e.response?.data?.error || 'Search failed', 'error');
    } finally {
      setSearchingSeller(false);
    }
  };

  const searchBuyer = async () => {
    if (!buyerReg.trim()) {
      showToast('Enter buyer registration number', 'error');
      return;
    }
    setSearchingBuyer(true);
    try {
      const { data } = await api.get(`/members/search?reg_no=${buyerReg}`);
      if (data.member) {
        setBuyer(data.member);
        showToast(`Buyer ${data.member.name} found`, 'success');
        // Move focus to weight input
        setFocusedInput('weight');
        weightInputRef.current?.focus();
      } else {
        showToast('Buyer not found', 'error');
        setBuyer(null);
      }
    } catch (e: any) {
      showToast(e.response?.data?.error || 'Search failed', 'error');
    } finally {
      setSearchingBuyer(false);
    }
  };

  const clearAll = () => {
    setSellerReg('');
    setBuyerReg('');
    setWeight('');
    setSeller(null);
    setBuyer(null);
    setCumulative({ delivered: 0, bought: 0, sold: 0, net: 0 });
    setCumulativeAvailable(false);
    setFocusedInput('sellerReg');
    sellerRegRef.current?.focus();
    showToast('Form cleared', 'success');
  };

  const handleKeyPress = (key: string) => {
    if (key === '⌫') {
      if (focusedInput === 'sellerReg') setSellerReg(prev => prev.slice(0, -1));
      else if (focusedInput === 'buyerReg') setBuyerReg(prev => prev.slice(0, -1));
      else if (focusedInput === 'weight') setWeight(prev => prev.slice(0, -1));
    } else if (key === '.') {
      if (focusedInput === 'weight' && !weight.includes('.')) {
        setWeight(prev => prev + (prev === '' ? '0.' : '.'));
      }
    } else {
      // digits 0-9
      if (focusedInput === 'sellerReg') setSellerReg(prev => prev + key);
      else if (focusedInput === 'buyerReg') setBuyerReg(prev => prev + key);
      else if (focusedInput === 'weight') setWeight(prev => prev + key);
    }
  };

  const handleEnter = async () => {
    if (focusedInput === 'sellerReg') {
      await searchSeller();
    } else if (focusedInput === 'buyerReg') {
      await searchBuyer();
    } else if (focusedInput === 'weight') {
      await saveTransaction();
    }
  };

  const saveTransaction = async () => {
    if (!seller || !buyer || !weight || parseFloat(weight) <= 0) {
      showToast('Fill all fields correctly', 'error');
      return;
    }
    if (seller.id === buyer.id) {
      showToast('Seller and buyer cannot be the same', 'error');
      return;
    }
    setLoading(true);
    setFocusedInput('sellerReg');
    sellerRegRef.current?.focus();

    try {
      const { data: txData } = await api.post('/transactions', {
        type,
        sellerId: seller.id,
        buyerId: buyer.id,
        kgs: parseFloat(weight),
      });

      showToast('Transaction recorded', 'success');
      setWeight('');

      const updatedCumulative = await fetchSellerCumulative(seller.id, type);

      if (printReceipt && printerConfigured && updatedCumulative) {
        try {
          const printerRaw = await AsyncStorage.getItem('selectedPrinter');
          const printer = printerRaw ? JSON.parse(printerRaw) : {};
          const pwStr = await AsyncStorage.getItem('paperWidth');
          const paperWidth = (pwStr === '80' ? 80 : 58) as 58 | 80;
          const now = new Date();

          await printTransactionReceipt(
            seller.name,
            seller.reg_no,
            buyer.name,
            buyer.reg_no,
            parseFloat(weight),
            type,
            now.toLocaleDateString(),
            now.toLocaleTimeString(),
            {
              printerAddress: printer.address,
              paperWidth,
              receiptSettings: factorySettings?.settings?.receipt,
              factoryInfo: factorySettings?.settings?.factoryInfo,
              factoryName: factorySettings?.name,
              season: activeSeasonName,
              clerk: clerkName,
              receiptNo: txData?.transaction?.receipt_no || txData?.id,
              netTotal: updatedCumulative.net,
            }
          );
          showToast('Receipt printed', 'success');
        } catch (printErr) {
          showToast('Print failed, but transaction saved', 'error');
        }
      }
    } catch (e: any) {
      showToast(e.response?.data?.error || 'Failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleTogglePrint = (value: boolean) => {
    if (value && !canPrint) {
      Alert.alert(
        'Printer Not Ready',
        !bluetoothOn
          ? 'Bluetooth is off. Please turn it on and configure your printer in settings.'
          : 'No printer has been configured. Please go to Account settings to set up your printer.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Go to Settings', onPress: () => navigation.navigate('Account') },
        ]
      );
      return;
    }
    setPrintReceipt(value);
    savePrintPreference(value);
  };

  const headerRight = (
    <View style={styles.headerRightContainer}>
      <View style={[styles.statusIndicator, isOnline ? styles.onlineBg : styles.offlineBg]}>
        <Ionicons
          name={isOnline ? 'wifi' : 'cloud-offline'}
          size={14}
          color={isOnline ? '#2e7d32' : '#c62828'}
        />
        <Text style={[styles.statusText, isOnline ? styles.onlineText : styles.offlineText]}>
          {isOnline ? 'Online' : 'Offline'}
        </Text>
      </View>
      <TouchableOpacity
        style={[styles.printToggle, printReceipt && styles.printToggleActive]}
        onPress={() => handleTogglePrint(!printReceipt)}
        disabled={!canPrint}
      >
        <Ionicons name="print-outline" size={20} color={printReceipt ? '#fff' : '#6b5e53'} />
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <View ref={headerRef} onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}>
        <Header title="Record Transaction" showBack={true} rightElement={headerRight} />
      </View>
      {toast && (
        <Animated.View
          style={[
            styles.toastOverlay,
            toast.type === 'success' ? styles.toastSuccess : styles.toastError,
            { opacity: toastOpacity, transform: [{ translateY: toastTranslateY }], top: headerHeight + 8 },
          ]}
          pointerEvents="none"
        >
          <Ionicons
            name={toast.type === 'success' ? 'checkmark-circle' : 'alert-circle'}
            size={20}
            color={toast.type === 'success' ? '#2e7d32' : '#c62828'}
          />
          <Text style={styles.toastText}>{toast.text}</Text>
        </Animated.View>
      )}
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Coffee Type</Text>
        <View style={styles.typeToggle}>
          <TouchableOpacity
            onPress={() => setType('cherry')}
            style={[styles.toggleBtn, type === 'cherry' && styles.activeToggle]}
          >
            <Ionicons name="leaf" size={18} color={type === 'cherry' ? '#fff' : '#8c6239'} />
            <Text style={[styles.toggleText, type === 'cherry' && styles.activeToggleText]}>Cherry</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setType('mbuni')}
            style={[styles.toggleBtn, type === 'mbuni' && styles.activeToggle]}
          >
            <Ionicons name="leaf" size={18} color={type === 'mbuni' ? '#fff' : '#8c6239'} />
            <Text style={[styles.toggleText, type === 'mbuni' && styles.activeToggleText]}>Mbuni</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>Seller Registration Number</Text>
        <View style={styles.searchRow}>
          <TextInput
            ref={sellerRegRef}
            placeholder="e.g. 1"
            placeholderTextColor="#9e8e7e"
            value={sellerReg}
            onChangeText={setSellerReg}
            style={styles.searchInput}
            keyboardType="numeric"
            onFocus={() => setFocusedInput('sellerReg')}
            showSoftInputOnFocus={false}
            autoFocus={true}
          />
          <TouchableOpacity onPress={searchSeller} style={styles.searchBtn} disabled={searchingSeller}>
            {searchingSeller ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="search" size={20} color="#fff" />}
          </TouchableOpacity>
        </View>

        {/* Seller info area */}
        <View style={styles.memberCard}>
          {seller ? (
            <>
              <View style={styles.memberHeader}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{seller.name.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>{seller.name}</Text>
                  <Text style={styles.memberReg}>Reg No: {seller.reg_no}</Text>
                </View>
              </View>

              {cumulativeAvailable ? (
                <View style={styles.cumulativeGrid}>
                  <View style={styles.cumItem}>
                    <Text style={styles.cumLabel}>Delivered</Text>
                    <Text style={styles.cumValue}>{cumulative.delivered.toFixed(2)} kg</Text>
                  </View>
                  <View style={styles.cumItem}>
                    <Text style={styles.cumLabel}>Bought</Text>
                    <Text style={styles.cumValue}>{cumulative.bought.toFixed(2)} kg</Text>
                  </View>
                  <View style={styles.cumItem}>
                    <Text style={styles.cumLabel}>Sold</Text>
                    <Text style={styles.cumValue}>{cumulative.sold.toFixed(2)} kg</Text>
                  </View>
                  <View style={[styles.cumItem, styles.netItem]}>
                    <Text style={styles.cumLabel}>Net</Text>
                    <Text style={[styles.cumValue, styles.netValue]}>{cumulative.net.toFixed(2)} kg</Text>
                  </View>
                </View>
              ) : (
                <View style={styles.offlineMessageContainer}>
                  <Ionicons name="cloud-offline-outline" size={24} color="#6b5e53" />
                  <Text style={styles.offlineMessage}>
                    {isOnline ? 'Cumulative totals unavailable' : 'Offline – cumulative totals unavailable'}
                  </Text>
                  <Text style={styles.offlineSubMessage}>
                    {isOnline ? 'Please try again later' : 'Connect to the internet to see up‑to‑date balances.'}
                  </Text>
                </View>
              )}
            </>
          ) : (
            <View style={styles.placeholderMemberContainer}>
              <Ionicons name="person-outline" size={40} color="#d9d0c7" />
              <Text style={styles.placeholderMemberText}>Enter seller registration</Text>
              <Text style={styles.placeholderMemberSubtext}>Tap search to find seller</Text>
            </View>
          )}
        </View>

        <Text style={styles.label}>Buyer Registration Number</Text>
        <View style={styles.searchRow}>
          <TextInput
            ref={buyerRegRef}
            placeholder="e.g. 2"
            placeholderTextColor="#9e8e7e"
            value={buyerReg}
            onChangeText={setBuyerReg}
            style={styles.searchInput}
            keyboardType="numeric"
            onFocus={() => setFocusedInput('buyerReg')}
            showSoftInputOnFocus={false}
          />
          <TouchableOpacity onPress={searchBuyer} style={styles.searchBtn} disabled={searchingBuyer}>
            {searchingBuyer ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="search" size={20} color="#fff" />}
          </TouchableOpacity>
        </View>

        {/* Buyer info area */}
        <View style={[styles.memberCard, styles.buyerCard]}>
          {buyer ? (
            <View style={styles.memberHeader}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{buyer.name.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.memberInfo}>
                <Text style={styles.memberName}>{buyer.name}</Text>
                <Text style={styles.memberReg}>Reg No: {buyer.reg_no}</Text>
              </View>
            </View>
          ) : (
            <View style={styles.placeholderMemberContainer}>
              <Ionicons name="person-outline" size={40} color="#d9d0c7" />
              <Text style={styles.placeholderMemberText}>Enter buyer registration</Text>
              <Text style={styles.placeholderMemberSubtext}>Tap search to find buyer</Text>
            </View>
          )}
        </View>

        <Text style={styles.label}>Weight (kg)</Text>
        <TextInput
          ref={weightInputRef}
          placeholder="0.00"
          placeholderTextColor="#9e8e7e"
          value={weight}
          onChangeText={setWeight}
          style={[styles.weightInput, (!seller || !buyer) && styles.disabledInput]}
          editable={!!seller && !!buyer}
          onFocus={() => setFocusedInput('weight')}
          showSoftInputOnFocus={false}
        />
      </ScrollView>

      <View style={styles.bottomFixedArea}>
        <NumericKeyboard
          onKeyPress={handleKeyPress}
          onEnter={handleEnter}
          onClear={clearAll}
          focusedInput={focusedInput}
        />
        <TouchableOpacity
          onPress={saveTransaction}
          disabled={loading || !seller || !buyer}
          style={[styles.saveBtn, (loading || !seller || !buyer) && styles.saveBtnDisabled]}
        >
          {loading ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.saveBtnText}>Save Transaction</Text>}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ==================== Styles ====================
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#faf9f6' },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 20 },
  bottomFixedArea: { paddingHorizontal: 20, paddingBottom: 20 },
  headerRightContainer: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
    gap: 4,
  },
  onlineBg: { backgroundColor: '#e8f5e9' },
  offlineBg: { backgroundColor: '#ffebee' },
  statusText: { fontSize: 12, fontWeight: '600' },
  onlineText: { color: '#2e7d32' },
  offlineText: { color: '#c62828' },
  printToggle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f0ece6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  printToggleActive: { backgroundColor: '#8c6239' },
  toastOverlay: {
    position: 'absolute',
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

  label: { fontSize: 14, fontWeight: '600', color: '#6b5e53', marginBottom: 8 },
  typeToggle: { flexDirection: 'row', marginBottom: 20 },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#d9d0c7',
    backgroundColor: '#fff',
    marginHorizontal: 4,
  },
  activeToggle: { backgroundColor: '#3d2b1f', borderColor: '#3d2b1f' },
  toggleText: { fontSize: 15, fontWeight: '600', color: '#3d2b1f', marginLeft: 6 },
  activeToggleText: { color: '#fff' },

  searchRow: { flexDirection: 'row', marginBottom: 20 },
  searchInput: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d9d0c7',
    color: '#1a1512',
  },
  searchBtn: {
    width: 50,
    backgroundColor: '#3d2b1f',
    borderRadius: 12,
    marginLeft: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },

  memberCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#e0d9d0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
    minHeight: 150,
  },
  buyerCard: {
  marginBottom: 20,
  minHeight: 80,
  paddingVertical: 12,
  paddingHorizontal: 18,
  backgroundColor: '#fff',
  borderRadius: 16,
  borderWidth: 1,
  borderColor: '#e0d9d0',
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06,
  shadowRadius: 8,
  elevation: 3,
},
  memberHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#8c6239',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { color: '#fff', fontSize: 22, fontWeight: '700' },
  memberInfo: { marginLeft: 12 },
  memberName: { fontSize: 18, fontWeight: '700', color: '#3d2b1f' },
  memberReg: { fontSize: 13, color: '#6b5e53', marginTop: 2 },

  cumulativeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cumItem: {
    flex: 1,
    minWidth: '22%',
    backgroundColor: '#f0ece6',
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
  },
  cumLabel: { fontSize: 11, fontWeight: '600', color: '#6b5e53', textTransform: 'uppercase', marginBottom: 4 },
  cumValue: { fontSize: 14, fontWeight: '700', color: '#3d2b1f' },
  netItem: { backgroundColor: '#e8f5e9' },
  netValue: { color: '#2e7d32' },

  offlineMessageContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    backgroundColor: '#fef9e7',
    borderRadius: 12,
    marginTop: 4,
  },
  offlineMessage: { fontSize: 14, fontWeight: '600', color: '#b45309', marginTop: 8, textAlign: 'center' },
  offlineSubMessage: { fontSize: 12, color: '#6b5e53', marginTop: 4, textAlign: 'center' },

  placeholderMemberContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,   // reduced from 20
  },
  placeholderMemberText: { fontSize: 16, fontWeight: '600', color: '#6b5e53', marginTop: 8 },
  placeholderMemberSubtext: { fontSize: 13, color: '#9e8e7e', marginTop: 4 },

  weightInput: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    fontSize: 18,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d9d0c7',
    color: '#1a1512',
    marginBottom: 12,
  },
  disabledInput: { backgroundColor: '#faf9f6', color: '#9e8e7e' },

  keyboardContainer: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e0d9d0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  keyboardRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 8 },
  keyboardKey: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginHorizontal: 6,
    backgroundColor: '#f0ece6',
    borderRadius: 10,
  },
  keyboardKeyZero: { flex: 2 },
  keyboardClearKey: { backgroundColor: '#ffebee' },
  keyboardEnterKey: { backgroundColor: '#3d2b1f' },
  keyboardKeyText: { fontSize: 22, fontWeight: '600', color: '#3d2b1f' },
  clearText: { color: '#c62828' },
  enterText: { color: '#fff', fontSize: 18, fontWeight: '700' },

  saveBtn: {
    backgroundColor: '#3d2b1f',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});