import { StatusBar } from 'expo-status-bar'
import React, { useState, useEffect } from 'react'
import { AuthProvider, useAuth } from './src/contexts/AuthContext'
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

// The main content of your app (wrapped by AuthProvider)
function AppContent() {
  const { user } = useAuth()

  useEffect(() => {
    initDatabase()
    startSyncListener()
    // Warm the factory-settings cache from disk on every app start so
    // receipt printing works immediately, even before any screen fetches.
    loadFactorySettingsFromDisk()
  }, [])

  useEffect(() => {
    if (user && user.factoryId) {
      // Sync pending deliveries and member cache when user logs in
      syncPendingDeliveries()
      syncMembers(user.factoryId)
      // Also refresh factory settings now that we have a valid token
      refreshFactorySettings()
    }
  }, [user])

  return <AppNavigator />
}

export default function App() {
  const [locked, setLocked] = useState(false)
  const [pinChecked, setPinChecked] = useState(false)

  useEffect(() => {
    // Check if a PIN is enabled in secure storage
    isPinEnabled().then((enabled) => {
      setLocked(enabled)
      setPinChecked(true)
    })
  }, [])

  // Show nothing (or a splash screen) while checking PIN status
  if (!pinChecked) {
    return null // optionally return a custom splash/loading component
  }

  // If PIN is enabled, show the lock screen before the main app
  if (locked) {
    return <AppLockScreen onUnlock={() => setLocked(false)} />
  }

  // Normal app flow
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <AppContent />
    </AuthProvider>
  )
}