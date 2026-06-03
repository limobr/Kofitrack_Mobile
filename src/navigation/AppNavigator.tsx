import React from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Ionicons } from '@expo/vector-icons'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { useAuth } from '../contexts/AuthContext'
import type { RootStackParamList } from './types'
import LoginScreen from '../screens/LoginScreen'
import DashboardScreen from '../screens/DashboardScreen'
import RecordDeliveryScreen from '../screens/RecordDeliveryScreen'
import RecordTransactionScreen from '../screens/RecordTransactionScreen'
import AddMemberScreen from '../screens/AddMemberScreen'
import EditMemberScreen from '../screens/EditMemberScreen'   // ✅ new
import MembersScreen from '../screens/MembersScreen'
import DeliveriesScreen from '../screens/DeliveriesScreen'
import TransactionsScreen from '../screens/TransactionsScreen'
import CumulativesScreen from '../screens/CumulativesScreen'
import CumulativeDetailScreen from '../screens/CumulativeDetailScreen'
import AccountScreen from '../screens/AccountScreen'
import Header from '../components/Header'

const Stack = createNativeStackNavigator<RootStackParamList>()
const Tab = createBottomTabNavigator()

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        header: () => (
          <Header
            title={getHeaderTitle(route.name)}
            showBack={false}
            showAccount={true}
          />
        ),
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: any = 'ellipse'
          if (route.name === 'Home') iconName = focused ? 'home' : 'home-outline'
          else if (route.name === 'Deliveries') iconName = focused ? 'leaf' : 'leaf-outline'
          else if (route.name === 'Transactions') iconName = focused ? 'swap-horizontal' : 'swap-horizontal-outline'
          else if (route.name === 'Members') iconName = focused ? 'people' : 'people-outline'
          else if (route.name === 'Cumulatives') iconName = focused ? 'bar-chart' : 'bar-chart-outline'
          return <Ionicons name={iconName} size={size} color={color} />
        },
        tabBarActiveTintColor: '#8c6239',
        tabBarInactiveTintColor: '#6b5e53',
        tabBarStyle: {
          backgroundColor: '#faf9f6',
          borderTopColor: '#d9d0c7',
        },
      })}
    >
      <Tab.Screen name="Home" component={DashboardScreen} />
      <Tab.Screen name="Deliveries" component={DeliveriesScreen} />
      <Tab.Screen name="Transactions" component={TransactionsScreen} />
      <Tab.Screen name="Members" component={MembersScreen} />
      <Tab.Screen name="Cumulatives" component={CumulativesScreen} />
    </Tab.Navigator>
  )
}

function getHeaderTitle(name: string) {
  switch (name) {
    case 'Home': return 'Dashboard'
    case 'Deliveries': return 'Deliveries'
    case 'Transactions': return 'Transactions'
    case 'Members': return 'Members'
    case 'Cumulatives': return 'Cumulatives'
    default: return 'KofiTrack'
  }
}

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
              <Stack.Screen
                name="RecordDelivery"
                component={RecordDeliveryScreen}
                options={{
                  headerShown: true,
                  header: () => <Header title="Record Delivery" showBack={true} />,
                }}
              />
              <Stack.Screen
                name="RecordTransaction"
                component={RecordTransactionScreen}
                options={{
                  headerShown: true,
                  header: () => <Header title="Record Transaction" showBack={true} />,
                }}
              />
              <Stack.Screen
                name="AddMember"
                component={AddMemberScreen}
                options={{
                  headerShown: true,
                  header: () => <Header title="Add Member" showBack={true} />,
                }}
              />
              <Stack.Screen
                name="EditMember"
                component={EditMemberScreen}
                options={{
                  headerShown: true,
                  header: () => <Header title="Edit Member" showBack={true} />,
                }}
              />
              <Stack.Screen
                name="CumulativeDetail"
                component={CumulativeDetailScreen}
                options={{
                  headerShown: true,
                  header: () => <Header title="Member Breakdown" showBack={true} />,
                }}
              />
              <Stack.Screen
                name="Account"
                component={AccountScreen}
                options={{
                  headerShown: true,
                  header: () => <Header title="Account" showBack={true} />,
                }}
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