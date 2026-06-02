import React, { createContext, useState, useContext, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'   // for Supabase session
import * as SecureStore from 'expo-secure-store'                     // for our JWT token
import 'react-native-url-polyfill/auto'

const supabaseUrl = 'https://yoxcugdhrascovlbqqye.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlveGN1Z2RocmFzY292bGJxcXllIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MjMwNTAsImV4cCI6MjA5NDE5OTA1MH0.h3R2Wse7498uoMjiXgd-HBiJYgLF-SQXdFdmiZIM8_c'   // ⬅️ replace with your actual anon key

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})

interface AuthContextType {
  user: any
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signIn: async () => {},
  signOut: async () => {},
})

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null)
      if (session?.access_token) {
        await SecureStore.setItemAsync('supabase-token', session.access_token)
      } else {
        await SecureStore.deleteItemAsync('supabase-token')
      }
      setLoading(false)
    })

    // Retrieve existing token on mount
    ;(async () => {
      const token = await SecureStore.getItemAsync('supabase-token')
      if (!token) {
        setLoading(false)
      }
    })()

    return () => listener.subscription.unsubscribe()
  }, [])

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    await SecureStore.deleteItemAsync('supabase-token')
  }

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)