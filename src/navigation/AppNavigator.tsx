import React, { useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Modal, Pressable } from 'react-native'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useAuth } from '../contexts/AuthContext'
import type { RootStackParamList } from './types'
import LoginScreen from '../screens/LoginScreen'
import DashboardScreen from '../screens/DashboardScreen'
import RecordDeliveryScreen from '../screens/RecordDeliveryScreen'
import RecordTransactionScreen from '../screens/RecordTransactionScreen'
import AddMemberScreen from '../screens/AddMemberScreen'
import EditMemberScreen from '../screens/EditMemberScreen'
import MembersScreen from '../screens/MembersScreen'
import DeliveriesTabHost from '../screens/DeliveriesTabHost'
import CumulativesScreen from '../screens/CumulativesScreen'
import CumulativeDetailScreen from '../screens/CumulativeDetailScreen'
import AccountScreen from '../screens/AccountScreen'
import Header from '../components/Header'
import SyncLogsScreen from '../screens/SyncLogsScreen'
import TransactionsTabHost from '../screens/TransactionsTabHost'
import PrinterSettingsScreen from '../screens/PrinterSettingsScreen'
import PinLockScreen from '../screens/PinLockScreen'
import PrintQueueScreen from '../screens/PrintQueueScreen'
import AnalyticsScreen from '../screens/AnalyticsScreen'
import ReportsMenuScreen from '../screens/ReportsMenuScreen'

const Stack = createNativeStackNavigator<RootStackParamList>()
const Tab = createBottomTabNavigator()

// ─── Colour tokens ────────────────────────────────────────────────────────────
const BRAND_DARK = '#2E2018'
const UMBER      = '#8C6239'
const LINE       = '#E4DBCB'
const MUTED      = '#8A7C6B'
const BG         = '#FAF7F1'
const TERRACOTTA = '#C8623D'

// ─── Record FAB sheet ─────────────────────────────────────────────────────────
function RecordSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()

  function go(screen: 'RecordDelivery' | 'RecordTransaction') {
    onClose()
    navigation.navigate(screen)
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={sheet.overlay} onPress={onClose}>
        <View style={sheet.panel}>
          <Text style={sheet.heading}>Record</Text>

          <TouchableOpacity
            style={sheet.option}
            onPress={() => go('RecordDelivery')}
            activeOpacity={0.75}
          >
            <View style={[sheet.optionIcon, { backgroundColor: '#EEF3EA' }]}>
              {/* Simple leaf shape via nested views */}
              <View style={sheet.leafOuter}>
                <View style={sheet.leafInner} />
              </View>
            </View>
            <View style={sheet.optionText}>
              <Text style={sheet.optionLabel}>Delivery</Text>
              <Text style={sheet.optionSub}>Log coffee brought in by a farmer</Text>
            </View>
            <Text style={sheet.optionChev}>›</Text>
          </TouchableOpacity>

          <View style={sheet.divider} />

          <TouchableOpacity
            style={sheet.option}
            onPress={() => go('RecordTransaction')}
            activeOpacity={0.75}
          >
            <View style={[sheet.optionIcon, { backgroundColor: '#EEF0F5' }]}>
              <View style={sheet.arrowsWrap}>
                <View style={[sheet.arrowBar, { marginBottom: 3 }]} />
                <View style={[sheet.arrowBar, { alignSelf: 'flex-end' }]} />
              </View>
            </View>
            <View style={sheet.optionText}>
              <Text style={sheet.optionLabel}>Transaction</Text>
              <Text style={sheet.optionSub}>Record a transfer or payout</Text>
            </View>
            <Text style={sheet.optionChev}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={sheet.cancelBtn} onPress={onClose}>
            <Text style={sheet.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  )
}

const sheet = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(46,32,24,0.45)',
    justifyContent: 'flex-end',
  },
  panel: {
    backgroundColor: BG,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 36,
  },
  heading: {
    fontSize: 13,
    fontWeight: '700',
    color: MUTED,
    letterSpacing: 0.1,
    textTransform: 'uppercase',
    marginBottom: 18,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Leaf shape
  leafOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderTopRightRadius: 2,
    backgroundColor: '#5B6B4D',
    justifyContent: 'center',
    alignItems: 'center',
  },
  leafInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderTopRightRadius: 1,
    backgroundColor: '#EEF3EA',
  },
  // Arrows shape
  arrowsWrap: {
    width: 20,
    height: 16,
    justifyContent: 'center',
  },
  arrowBar: {
    width: 16,
    height: 3,
    borderRadius: 2,
    backgroundColor: '#3D5A8A',
  },
  optionText: {
    flex: 1,
    marginLeft: 14,
  },
  optionLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: BRAND_DARK,
  },
  optionSub: {
    fontSize: 12,
    color: MUTED,
    marginTop: 2,
  },
  optionChev: {
    fontSize: 20,
    color: MUTED,
    marginLeft: 8,
  },
  divider: {
    height: 1,
    backgroundColor: LINE,
    marginVertical: 2,
  },
  cancelBtn: {
    marginTop: 20,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: LINE,
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '600',
    color: BRAND_DARK,
  },
})

// ─── Records tab sheet (Deliveries vs Transactions) ──────────────────────────
function RecordsSheet({ visible, onClose, onSelect }: { visible: boolean; onClose: () => void; onSelect: (dest: 'deliveries' | 'transactions') => void }) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={sheet.overlay} onPress={onClose}>
        <View style={sheet.panel}>
          <Text style={sheet.heading}>Records</Text>

          <TouchableOpacity
            style={sheet.option}
            onPress={() => onSelect('deliveries')}
            activeOpacity={0.75}
          >
            <View style={[sheet.optionIcon, { backgroundColor: '#EEF3EA' }]}>
              <View style={sheet.leafOuter}>
                <View style={sheet.leafInner} />
              </View>
            </View>
            <View style={sheet.optionText}>
              <Text style={sheet.optionLabel}>Deliveries</Text>
              <Text style={sheet.optionSub}>Coffee brought in by farmers</Text>
            </View>
            <Text style={sheet.optionChev}>›</Text>
          </TouchableOpacity>

          <View style={sheet.divider} />

          <TouchableOpacity
            style={sheet.option}
            onPress={() => onSelect('transactions')}
            activeOpacity={0.75}
          >
            <View style={[sheet.optionIcon, { backgroundColor: '#EEF0F5' }]}>
              <View style={sheet.arrowsWrap}>
                <View style={[sheet.arrowBar, { marginBottom: 3 }]} />
                <View style={[sheet.arrowBar, { alignSelf: 'flex-end' }]} />
              </View>
            </View>
            <View style={sheet.optionText}>
              <Text style={sheet.optionLabel}>Transactions</Text>
              <Text style={sheet.optionSub}>Transfers and payouts between members</Text>
            </View>
            <Text style={sheet.optionChev}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={sheet.cancelBtn} onPress={onClose}>
            <Text style={sheet.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  )
}

// ─── FAB (centre tab button) ──────────────────────────────────────────────────
function RecordFAB({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={fab.btn}
      activeOpacity={0.82}
      accessibilityLabel="Record a delivery or transaction"
    >
      <Text style={fab.plus}>+</Text>
    </TouchableOpacity>
  )
}

const fab = StyleSheet.create({
  btn: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: BRAND_DARK,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
    // Subtle lift
    shadowColor: BRAND_DARK,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 6,
  },
  plus: {
    color: '#fff',
    fontSize: 28,
    lineHeight: 30,
    fontWeight: '300',
    marginTop: -1,
  },
})

// ─── Tab icon renderer (no Ionicons) ─────────────────────────────────────────
function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  const color = focused ? BRAND_DARK : MUTED

  if (name === 'Home') {
    // House shape
    return (
      <View style={{ alignItems: 'center', justifyContent: 'center', width: 24, height: 22 }}>
        {/* Roof */}
        <View style={{
          width: 0, height: 0,
          borderLeftWidth: 12, borderRightWidth: 12, borderBottomWidth: 9,
          borderLeftColor: 'transparent', borderRightColor: 'transparent',
          borderBottomColor: color,
          marginBottom: 0,
        }} />
        {/* Body */}
        <View style={{ width: 16, height: 11, backgroundColor: color, borderRadius: 1 }} />
      </View>
    )
  }

  if (name === 'Records') {
    // Two horizontal lines (list icon)
    return (
      <View style={{ gap: 4, justifyContent: 'center', height: 22 }}>
        <View style={{ width: 22, height: 2.5, borderRadius: 2, backgroundColor: color }} />
        <View style={{ width: 16, height: 2.5, borderRadius: 2, backgroundColor: color }} />
        <View style={{ width: 19, height: 2.5, borderRadius: 2, backgroundColor: color }} />
      </View>
    )
  }

  if (name === 'Members') {
    // Two overlapping circles (people)
    return (
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', width: 26, height: 22 }}>
        <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: color, opacity: focused ? 1 : 0.7 }} />
        <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: color, marginLeft: -6 }} />
      </View>
    )
  }

  if (name === 'Reports') {
    // Three rising bars
    return (
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 22 }}>
        <View style={{ width: 6, height: 10, borderRadius: 2, backgroundColor: color }} />
        <View style={{ width: 6, height: 15, borderRadius: 2, backgroundColor: color }} />
        <View style={{ width: 6, height: 20, borderRadius: 2, backgroundColor: color }} />
      </View>
    )
  }

  return null
}

// ─── Main tab navigator ───────────────────────────────────────────────────────
function MainTabs() {
  const [sheetVisible, setSheetVisible] = useState(false)
  const [recordsSheetVisible, setRecordsSheetVisible] = useState(false)
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>()

  function onSelectRecordsDestination(dest: 'deliveries' | 'transactions') {
    setRecordsSheetVisible(false)
    if (dest === 'transactions') {
      navigation.navigate('Transactions')
    } else {
      // tabPress was prevented to show the chooser, so switch tabs explicitly.
      navigation.navigate('Main', { screen: 'Records' } as never)
    }
  }

  return (
    <>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          header: () => (
            <Header
              title={getHeaderTitle(route.name)}
              showBack={false}
              showAccount={true}
            />
          ),
          tabBarIcon: ({ focused }) => {
            if (route.name === 'Record') return null // handled by tabBarButton
            return <TabIcon name={route.name} focused={focused} />
          },
          tabBarActiveTintColor: BRAND_DARK,
          tabBarInactiveTintColor: MUTED,
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '600',
            letterSpacing: 0.2,
          },
          tabBarStyle: {
            backgroundColor: BG,
            borderTopColor: LINE,
            borderTopWidth: 1,
            height: 64,
            paddingBottom: 8,
            paddingTop: 6,
          },
        })}
      >
        <Tab.Screen name="Home"    component={DashboardScreen} />
        <Tab.Screen
          name="Records"
          component={DeliveriesTabHost}
          listeners={{
            tabPress: (e) => {
              // Always show the chooser instead of jumping straight to Deliveries —
              // Transactions has no other entry point from the tab bar.
              e.preventDefault()
              setRecordsSheetVisible(true)
            },
          }}
        />

        {/* Centre FAB slot */}
        <Tab.Screen
          name="Record"
          component={DashboardScreen}  // never actually rendered
          options={{
            tabBarLabel: '',
            tabBarButton: () => (
              <RecordFAB onPress={() => setSheetVisible(true)} />
            ),
          }}
          listeners={{
            tabPress: (e) => e.preventDefault(),
          }}
        />

        <Tab.Screen name="Members" component={MembersScreen} />
        <Tab.Screen name="Reports" component={ReportsMenuScreen} />
      </Tab.Navigator>

      <RecordSheet visible={sheetVisible} onClose={() => setSheetVisible(false)} />
      <RecordsSheet
        visible={recordsSheetVisible}
        onClose={() => setRecordsSheetVisible(false)}
        onSelect={onSelectRecordsDestination}
      />
    </>
  )
}

function getHeaderTitle(name: string) {
  switch (name) {
    case 'Home':    return 'Dashboard'
    case 'Records': return 'Records'
    case 'Members': return 'Members'
    case 'Reports': return 'Reports'
    default:        return 'KofiTrack'
  }
}

// ─── Root navigator ───────────────────────────────────────────────────────────
export default function AppNavigator() {
  const { user, loading } = useAuth()

  if (loading) return null

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {user ? (
            <>
              <Stack.Screen name="Main" component={MainTabs} />
              <Stack.Screen name="RecordDelivery"    component={RecordDeliveryScreen}    options={{ headerShown: false }} />
              <Stack.Screen name="RecordTransaction" component={RecordTransactionScreen} options={{ headerShown: false }} />
              <Stack.Screen
                name="Transactions"
                component={TransactionsTabHost}
                options={{ headerShown: true, header: () => <Header title="Transactions" showBack={true} /> }}
              />
              <Stack.Screen
                name="AddMember"
                component={AddMemberScreen}
                options={{ headerShown: true, header: () => <Header title="Add Member" showBack={true} /> }}
              />
              <Stack.Screen
                name="EditMember"
                component={EditMemberScreen}
                options={{ headerShown: true, header: () => <Header title="Edit Member" showBack={true} /> }}
              />
              <Stack.Screen
                name="CumulativeDetail"
                component={CumulativeDetailScreen}
                options={{ headerShown: true, header: () => <Header title="Member Breakdown" showBack={true} /> }}
              />
              <Stack.Screen
                name="Account"
                component={AccountScreen}
                options={{ headerShown: true, header: () => <Header title="Settings" showBack={true} /> }}
              />
              <Stack.Screen name="PrinterSettings" component={PrinterSettingsScreen} options={{ headerShown: false }} />
              <Stack.Screen
                name="PinLock"
                component={PinLockScreen}
                options={{ headerShown: true, header: () => <Header title="PIN Lock" showBack={true} /> }}
              />
              <Stack.Screen name="SyncLogs" component={SyncLogsScreen} options={{ headerShown: false }} />
              <Stack.Screen
                name="PrintQueue"
                component={PrintQueueScreen}
                options={{ headerShown: true, header: () => <Header title="Print Queue" showBack={true} /> }}
              />
              <Stack.Screen
                name="Analytics"
                component={AnalyticsScreen}
                options={{ headerShown: true, header: () => <Header title="Analytics" showBack={true} /> }}
              />
              <Stack.Screen
                name="Cumulatives"
                component={CumulativesScreen}
                options={{ headerShown: true, header: () => <Header title="Member Cumulatives" showBack={true} /> }}
              />
            </>
          ) : (
            <Stack.Screen name="Login" component={LoginScreen} />
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  )
}