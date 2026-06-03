import React, { useState, useRef, useEffect } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../contexts/AuthContext'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import api, { API_BASE_URL } from '../api/client'

export default function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { signIn, signOut, user } = useAuth()
  const insets = useSafeAreaInsets()
  const passwordRef = useRef<TextInput>(null)

  // Watch for user role after login
  useEffect(() => {
    if (user && user.role !== 'worker') {
      Alert.alert(
        'Clerk Portal Only',
        'This app is for clerks (workers) to record deliveries and transactions.\n\nIf you are a factory administrator, please use the web portal to manage your factory:',
        [
          { text: 'Open Web Portal', onPress: () => Linking.openURL(`${API_BASE_URL}/factory`) },
          { text: 'OK', onPress: async () => { await signOut() }, style: 'cancel' },
        ]
      )
    }
  }, [user])

  const handleLogin = async () => {
    setError('')
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.')
      return
    }
    setLoading(true)
    try {
      await signIn(email.trim(), password)
      // The useEffect above will handle role check
    } catch (e: any) {
      let message = e.message || 'Login failed. Please try again.'
      if (message.includes('email_verified')) {
        message = 'Please verify your email before logging in. Check your inbox.'
      } else if (message.includes('CredentialsSignin') || message.includes('Invalid')) {
        message = 'Invalid email or password.'
      }
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const handleForgotPassword = () => {
    Alert.alert(
      'Reset Password',
      `To reset your password, please visit the KofiTrack web portal:\n\n${API_BASE_URL}/forgot-password`,
      [
        { text: 'Open in Browser', onPress: () => Linking.openURL(`${API_BASE_URL}/forgot-password`) },
        { text: 'OK', style: 'cancel' },
      ]
    )
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
    >
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.inner}>
          <View style={styles.logoContainer}>
            <View style={styles.logoCircle}>
              <Ionicons name="cafe" size={48} color="#faf9f6" />
            </View>
            <Text style={styles.appName}>KofiTrack</Text>
            <Text style={styles.subtitle}>Clerk Portal</Text>
          </View>

          <View style={styles.formCard}>
            <Text style={styles.welcomeText}>Welcome back</Text>
            <Text style={styles.instructionText}>Sign in to start recording</Text>

            <View style={styles.inputWrapper}>
              <Ionicons name="mail-outline" size={20} color="#8c6239" style={styles.inputIcon} />
              <TextInput
                placeholder="Email address"
                placeholderTextColor="#9e8e7e"
                value={email}
                onChangeText={setEmail}
                style={styles.input}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
              />
            </View>

            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={20} color="#8c6239" style={styles.inputIcon} />
              <TextInput
                ref={passwordRef}
                placeholder="Password"
                placeholderTextColor="#9e8e7e"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                style={styles.input}
                returnKeyType="done"
                onSubmitEditing={handleLogin}
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={styles.eyeButton}
              >
                <Ionicons
                  name={showPassword ? 'eye-off' : 'eye'}
                  size={22}
                  color="#8c6239"
                />
              </TouchableOpacity>
            </View>

            {error ? (
              <View style={styles.errorBox}>
                <Ionicons name="alert-circle" size={18} color="#c62828" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              onPress={handleLogin}
              disabled={loading}
              activeOpacity={0.8}
              style={[styles.button, loading && styles.buttonDisabled]}
            >
              {loading ? (
                <ActivityIndicator color="#faf9f6" size="small" />
              ) : (
                <Text style={styles.buttonText}>Log in</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.forgotBtn} onPress={handleForgotPassword}>
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#faf9f6' },
  scrollContent: { flexGrow: 1, justifyContent: 'center' },
  inner: { paddingHorizontal: 24 },
  logoContainer: { alignItems: 'center', marginBottom: 32 },
  logoCircle: {
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: '#3d2b1f',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 8, elevation: 6,
  },
  appName: { fontSize: 30, fontWeight: '800', color: '#3d2b1f', letterSpacing: 0.5 },
  subtitle: { fontSize: 14, color: '#8c6239', fontWeight: '600', marginTop: 4, letterSpacing: 1, textTransform: 'uppercase' },
  formCard: {
    backgroundColor: '#fff', borderRadius: 20, padding: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 12, elevation: 3,
  },
  welcomeText: { fontSize: 22, fontWeight: '700', color: '#1a1512', marginBottom: 4 },
  instructionText: { fontSize: 14, color: '#6b5e53', marginBottom: 24 },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#faf9f6', borderRadius: 12,
    borderWidth: 1, borderColor: '#d9d0c7',
    marginBottom: 16,
  },
  inputIcon: { paddingLeft: 14 },
  input: {
    flex: 1, paddingVertical: 14, paddingRight: 14,
    fontSize: 16, color: '#1a1512',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
  },
  eyeButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  errorBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#ffebee', borderRadius: 8,
    padding: 12, marginBottom: 16,
  },
  errorText: { color: '#c62828', fontSize: 14, marginLeft: 8, flex: 1 },
  button: {
    backgroundColor: '#3d2b1f', borderRadius: 12,
    paddingVertical: 16, alignItems: 'center', justifyContent: 'center', marginTop: 8,
  },
  buttonDisabled: { opacity: 0.7 },
  buttonText: { color: '#faf9f6', fontSize: 17, fontWeight: '700' },
  forgotBtn: { alignItems: 'center', marginTop: 20 },
  forgotText: { color: '#8c6239', fontSize: 14, fontWeight: '600' },
})