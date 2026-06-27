import { StatusBar } from 'expo-status-bar'
import React, { useState, useEffect } from 'react'
import { AuthProvider, useAuth } from './src/contexts/AuthContext'
import { NotificationProvider } from './src/contexts/NotificationContext'
import AppNavigator from './src/navigation/AppNavigator'
import { initDatabase } from './src/db'
import { startSyncListener, syncPendingDeliveries } from './src/services/syncService'
import { syncMembers } from './src/services/memberSyncService'
import AppLockScreen from './src/screens/AppLockScreen'
import { isPinEnabled } from './src/utils/pinLock'
import {
  loadFactorySettingsFromDisk,
  refreshFactorySettings,
} from './src/services/factorySettingsCache'

// AppContent sits inside AuthProvider so it can read the current user.
// NotificationProvider also lives here — it needs the user to know whether
// to enable network calls, and it must wrap AppNavigator so Header can
// consume the context without owning its own polling interval.
function AppContent() {
  const { user } = useAuth()

  useEffect(() => {
    initDatabase()
    startSyncListener()
    loadFactorySettingsFromDisk()
  }, [])

  useEffect(() => {
    if (user && user.factoryId) {
      syncPendingDeliveries()
      syncMembers(user.factoryId)
      refreshFactorySettings()
    }
  }, [user])

  return (
    // enabled=!!user gates all notification network calls: no requests
    // fire until the user is signed in, and state resets on sign-out.
    <NotificationProvider enabled={!!user}>
      <AppNavigator />
    </NotificationProvider>
  )
}

export default function App() {
  const [locked, setLocked]       = useState(false)
  const [pinChecked, setPinChecked] = useState(false)

  useEffect(() => {
    isPinEnabled().then((enabled) => {
      setLocked(enabled)
      setPinChecked(true)
    })
  }, [])

  if (!pinChecked) return null

  if (locked) {
    return <AppLockScreen onUnlock={() => setLocked(false)} />
  }

  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <AppContent />
    </AuthProvider>
  )
}