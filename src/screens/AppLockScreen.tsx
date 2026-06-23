import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Vibration,
  SafeAreaView,
  StatusBar,
  Animated,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { verifyPin, disablePin } from '../utils/pinLock';
import { API_BASE_URL } from '../api/client';

interface Props {
  onUnlock: () => void;
}

const DIGITS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['', '0', 'del'],
];

const PIN_LENGTH = 4;
// After this many consecutive wrong PINs the "Forgot PIN?" option appears.
const MAX_ATTEMPTS = 3;

// ─── Palette ────────────────────────────────────────────────────────────────
const C = {
  bg: '#2a1f17',
  bgMid: '#3d2b1f',
  surface: '#4a3628',
  surfaceLight: '#5a4535',
  brandDark: '#3d2b1f',
  brandMid: '#8c6239',
  brandLight: '#d9d0c7',
  border: 'rgba(217,208,199,0.18)',
  subtle: 'rgba(240,236,230,0.08)',
  error: '#e57373',
  success: '#81c784',
  textPrimary: '#faf9f6',
  textSecondary: '#d9d0c7',
  textTertiary: '#9e8e7e',
  dotInactive: 'rgba(217,208,199,0.3)',
  dotActive: '#d9d0c7',
  keyBg: 'rgba(255,255,255,0.07)',
  keyBorder: 'rgba(255,255,255,0.10)',
  inputBg: 'rgba(255,255,255,0.07)',
  inputBorder: 'rgba(217,208,199,0.25)',
};

type Screen = 'pin' | 'password';

export default function AppLockScreen({ onUnlock }: Props) {
  // ── PIN state ──────────────────────────────────────────────────────────
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [screen, setScreen] = useState<Screen>('pin');

  // ── Password recovery state ────────────────────────────────────────────
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [verifying, setVerifying] = useState(false);
  // The email is read from the persisted session — never entered by user,
  // so they cannot switch accounts from this screen.
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);

  // ── Animations ────────────────────────────────────────────────────────
  const shakeX = useRef(new Animated.Value(0)).current;
  const headerY = useRef(new Animated.Value(-24)).current;
  const headerOpacity = useRef(new Animated.Value(0)).current;
  const keypadOpacity = useRef(new Animated.Value(0)).current;
  const keypadY = useRef(new Animated.Value(24)).current;
  const passwordScreenOpacity = useRef(new Animated.Value(0)).current;
  const passwordScreenY = useRef(new Animated.Value(32)).current;
  const dotScales = useRef(
    Array.from({ length: PIN_LENGTH }, () => new Animated.Value(1))
  ).current;

  // Load session email on mount — used to verify password without switching account
  useEffect(() => {
    AsyncStorage.getItem('sessionUser').then((raw) => {
      if (raw) {
        try {
          const u = JSON.parse(raw);
          setSessionEmail(u.email ?? null);
        } catch {}
      }
    });
  }, []);

  // Mount animation for PIN screen
  useEffect(() => {
    if (screen === 'pin') {
      // Reset password screen anim values
      passwordScreenOpacity.setValue(0);
      passwordScreenY.setValue(32);
      // Animate PIN screen in
      Animated.sequence([
        Animated.parallel([
          Animated.timing(headerOpacity, { toValue: 1, duration: 380, useNativeDriver: true }),
          Animated.spring(headerY, { toValue: 0, friction: 8, tension: 55, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(keypadOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.spring(keypadY, { toValue: 0, friction: 8, tension: 60, useNativeDriver: true }),
        ]),
      ]).start();
    }
  }, [screen]);

  // Animate password screen in when switched
  useEffect(() => {
    if (screen === 'password') {
      Animated.parallel([
        Animated.timing(passwordScreenOpacity, { toValue: 1, duration: 320, useNativeDriver: true }),
        Animated.spring(passwordScreenY, { toValue: 0, friction: 8, tension: 55, useNativeDriver: true }),
      ]).start();
    }
  }, [screen]);

  const triggerShake = useCallback(() => {
    shakeX.setValue(0);
    Animated.sequence([
      Animated.timing(shakeX, { toValue: 10, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: -10, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 7, duration: 45, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: -7, duration: 45, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 0, duration: 40, useNativeDriver: true }),
    ]).start();
  }, [shakeX]);

  const animateDot = useCallback(
    (index: number, filled: boolean) => {
      Animated.spring(dotScales[index], {
        toValue: filled ? 1.3 : 1,
        friction: 5,
        tension: 140,
        useNativeDriver: true,
      }).start(() => {
        if (filled) {
          Animated.spring(dotScales[index], {
            toValue: 1,
            friction: 6,
            tension: 120,
            useNativeDriver: true,
          }).start();
        }
      });
    },
    [dotScales]
  );

  const animateSuccess = useCallback(() => {
    Animated.sequence(
      dotScales.map((s) =>
        Animated.spring(s, { toValue: 1.4, friction: 4, tension: 160, useNativeDriver: true })
      )
    ).start(() => onUnlock());
  }, [dotScales, onUnlock]);

  // ── PIN digit handler ──────────────────────────────────────────────────
  const handleDigit = useCallback(
    async (digit: string) => {
      if (digit === 'del') {
        setPin((prev) => {
          const next = prev.slice(0, -1);
          animateDot(next.length, false);
          return next;
        });
        setPinError('');
        return;
      }
      if (digit === '') return;

      const next = pin + digit;
      setPin(next);
      setPinError('');
      animateDot(next.length - 1, true);

      if (next.length === PIN_LENGTH) {
        const ok = await verifyPin(next);
        if (ok) {
          animateSuccess();
        } else {
          Vibration.vibrate([0, 80, 80, 80]);
          triggerShake();
          const newAttempts = attempts + 1;
          setAttempts(newAttempts);
          if (newAttempts >= MAX_ATTEMPTS) {
            setPinError(`Incorrect PIN — ${newAttempts} failed attempts.`);
          } else {
            setPinError(
              `Incorrect PIN. ${MAX_ATTEMPTS - newAttempts} attempt${MAX_ATTEMPTS - newAttempts !== 1 ? 's' : ''} left.`
            );
          }
          setTimeout(() => setPin(''), 600);
        }
      }
    },
    [pin, attempts, animateDot, animateSuccess, triggerShake]
  );

  // ── Password verification handler ──────────────────────────────────────
  // IMPORTANT: uses plain fetch(), NOT the shared axios `api` client.
  //
  // The axios client has a response interceptor that attaches the existing
  // authToken to every request, and on ANY 401 clears the session and fires
  // AUTH_EXPIRED_EVENT — which makes AuthContext set user=null and renders
  // the login screen. For PIN recovery that must never happen:
  //   - A wrong password returning 401 must NOT clear the session.
  //   - On success we must NOT store a new token; we just need a boolean signal.
  // Plain fetch() bypasses all interceptors completely.
  const handlePasswordVerify = useCallback(async () => {
    if (!password.trim()) {
      setPasswordError('Please enter your password.');
      return;
    }
    if (!sessionEmail) {
      setPasswordError('Session not found. Please restart the app.');
      return;
    }
    setVerifying(true);
    setPasswordError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/mobile-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: sessionEmail, password }),
      });

      if (response.ok) {
        // Password correct. Clear the forgotten PIN and unlock.
        // authToken + sessionUser are untouched — unsynced data stays safe.
        // The user can set a new PIN any time from Account -> PIN Lock.
        await disablePin();
        onUnlock();
      } else if (response.status === 401 || response.status === 403) {
        Vibration.vibrate([0, 80, 80, 80]);
        setPasswordError('Incorrect password. Try again.');
      } else {
        Vibration.vibrate([0, 80, 80, 80]);
        setPasswordError('Verification failed. Try again.');
      }
    } catch {
      // fetch() throws on network failure (no response object)
      Vibration.vibrate([0, 80, 80, 80]);
      setPasswordError('No connection. You need internet to recover access.');
    } finally {
      setVerifying(false);
    }
  }, [password, sessionEmail, onUnlock]);

  const switchToPasswordScreen = useCallback(() => {
    setPin('');
    setPinError('');
    setPassword('');
    setPasswordError('');
    setScreen('password');
  }, []);

  const backToPinScreen = useCallback(() => {
    setPassword('');
    setPasswordError('');
    setScreen('pin');
  }, []);

  const dots = Array.from({ length: PIN_LENGTH }, (_, i) => i < pin.length);
  const showForgotPin = attempts >= MAX_ATTEMPTS;

  // ── Render: Password recovery screen ──────────────────────────────────
  if (screen === 'password') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={C.bg} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.kvContainer}
        >
          <Animated.View
            style={[
              styles.passwordCard,
              {
                opacity: passwordScreenOpacity,
                transform: [{ translateY: passwordScreenY }],
              },
            ]}
          >
            {/* Icon */}
            <View style={styles.passwordIconRing}>
              <Ionicons name="key" size={26} color={C.brandLight} />
            </View>

            <Text style={styles.passwordTitle}>Verify your identity</Text>
            <Text style={styles.passwordSubtitle}>
              Enter the password for{'\n'}
              <Text style={styles.passwordEmail}>{sessionEmail ?? 'your account'}</Text>
            </Text>

            {/* Security note */}
            <View style={styles.securityNote}>
              <Ionicons name="shield-checkmark-outline" size={14} color={C.textTertiary} />
              <Text style={styles.securityNoteText}>
                Your account won't change. This only unlocks the app and clears the forgotten PIN.
              </Text>
            </View>

            {/* Password input */}
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={(t) => { setPassword(t); setPasswordError(''); }}
                placeholder="Account password"
                placeholderTextColor={C.textTertiary}
                secureTextEntry={!passwordVisible}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={handlePasswordVerify}
              />
              <TouchableOpacity
                style={styles.eyeBtn}
                onPress={() => setPasswordVisible((v) => !v)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons
                  name={passwordVisible ? 'eye-off-outline' : 'eye-outline'}
                  size={20}
                  color={C.textTertiary}
                />
              </TouchableOpacity>
            </View>

            {passwordError ? (
              <Text style={styles.passwordError}>{passwordError}</Text>
            ) : (
              <View style={{ height: 20 }} />
            )}

            {/* Verify button */}
            <TouchableOpacity
              style={[styles.verifyBtn, verifying && styles.verifyBtnDisabled]}
              onPress={handlePasswordVerify}
              activeOpacity={0.8}
              disabled={verifying}
            >
              {verifying ? (
                <ActivityIndicator color={C.textPrimary} size="small" />
              ) : (
                <Text style={styles.verifyBtnText}>Unlock App</Text>
              )}
            </TouchableOpacity>

            {/* Back link */}
            <TouchableOpacity onPress={backToPinScreen} style={styles.backLink}>
              <Ionicons name="arrow-back-outline" size={14} color={C.textTertiary} />
              <Text style={styles.backLinkText}>Back to PIN</Text>
            </TouchableOpacity>
          </Animated.View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── Render: PIN screen ─────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* Header */}
      <Animated.View
        style={[
          styles.header,
          { opacity: headerOpacity, transform: [{ translateY: headerY }] },
        ]}
      >
        <View style={styles.logoRing}>
          <View style={styles.logoInner}>
            <Ionicons name="leaf-outline" size={28} color={C.brandLight} />
          </View>
        </View>
        <Text style={styles.title}>KofiTrack</Text>
        <Text style={styles.subtitle}>Enter your PIN to continue</Text>
      </Animated.View>

      {/* Dots */}
      <Animated.View style={[styles.dotsRow, { transform: [{ translateX: shakeX }] }]}>
        {dots.map((filled, i) => (
          <Animated.View
            key={i}
            style={[
              styles.dot,
              filled && styles.dotFilled,
              { transform: [{ scale: dotScales[i] }] },
            ]}
          />
        ))}
      </Animated.View>

      {/* Error / attempt feedback */}
      {pinError ? (
        <Text style={styles.error}>{pinError}</Text>
      ) : (
        <View style={styles.errorPlaceholder} />
      )}

      {/* Keypad */}
      <Animated.View
        style={[
          styles.keypad,
          { opacity: keypadOpacity, transform: [{ translateY: keypadY }] },
        ]}
      >
        {DIGITS.map((row, ri) => (
          <View key={ri} style={styles.row}>
            {row.map((d, di) => {
              if (d === '') return <View key={di} style={styles.keyEmpty} />;
              if (d === 'del') {
                return (
                  <TouchableOpacity
                    key={di}
                    style={styles.key}
                    onPress={() => handleDigit('del')}
                    activeOpacity={0.6}
                  >
                    <Ionicons name="backspace-outline" size={24} color={C.textSecondary} />
                  </TouchableOpacity>
                );
              }
              return (
                <TouchableOpacity
                  key={di}
                  style={styles.key}
                  onPress={() => handleDigit(d)}
                  activeOpacity={0.6}
                >
                  <Text style={styles.keyText}>{d}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </Animated.View>

      {/* Forgot PIN — only surfaces after MAX_ATTEMPTS failures */}
      {showForgotPin && (
        <TouchableOpacity
          style={styles.forgotBtn}
          onPress={switchToPasswordScreen}
          activeOpacity={0.7}
        >
          <Ionicons name="help-circle-outline" size={15} color={C.brandLight} />
          <Text style={styles.forgotText}>Forgot PIN? Verify with password</Text>
        </TouchableOpacity>
      )}
    </SafeAreaView>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  kvContainer: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },

  // ── Header ────────────────────────────────────────────────────────────
  header: { alignItems: 'center', marginBottom: 44 },
  logoRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 1.5,
    borderColor: 'rgba(217,208,199,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
    shadowColor: C.brandLight,
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
  },
  logoInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: C.bgMid,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(140,98,57,0.4)',
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: C.textPrimary,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  subtitle: { fontSize: 13, color: C.textTertiary, marginTop: 6, letterSpacing: 0.3 },

  // ── Dots ──────────────────────────────────────────────────────────────
  dotsRow: { flexDirection: 'row', gap: 16, marginBottom: 12 },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: C.dotInactive,
    backgroundColor: 'transparent',
  },
  dotFilled: { backgroundColor: C.brandLight, borderColor: C.brandLight },

  // ── Error ─────────────────────────────────────────────────────────────
  error: { color: C.error, fontSize: 13, fontWeight: '500', marginBottom: 8, height: 20, letterSpacing: 0.2, textAlign: 'center' },
  errorPlaceholder: { height: 28 },

  // ── Keypad ────────────────────────────────────────────────────────────
  keypad: { width: '100%', maxWidth: 280, gap: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  key: {
    flex: 1,
    aspectRatio: 1.4,
    backgroundColor: C.keyBg,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.keyBorder,
  },
  keyEmpty: { flex: 1, aspectRatio: 1.4 },
  keyText: { fontSize: 22, fontWeight: '500', color: C.textPrimary, letterSpacing: 0.5 },

  // ── Forgot PIN link ───────────────────────────────────────────────────
  forgotBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 28,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: 'rgba(217,208,199,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(217,208,199,0.18)',
  },
  forgotText: { color: C.brandLight, fontSize: 13, fontWeight: '500' },

  // ── Password recovery card ────────────────────────────────────────────
  passwordCard: {
    width: '100%',
    backgroundColor: C.surface,
    borderRadius: 24,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  passwordIconRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(140,98,57,0.25)',
    borderWidth: 1.5,
    borderColor: 'rgba(140,98,57,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  passwordTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: C.textPrimary,
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  passwordSubtitle: {
    fontSize: 13,
    color: C.textTertiary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  passwordEmail: { color: C.brandLight, fontWeight: '600' },

  // Security note
  securityNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
    padding: 10,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(217,208,199,0.12)',
  },
  securityNoteText: { flex: 1, fontSize: 12, color: C.textTertiary, lineHeight: 18 },

  // Input
  inputWrapper: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.inputBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.inputBorder,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  input: {
    flex: 1,
    height: 50,
    color: C.textPrimary,
    fontSize: 15,
    letterSpacing: 0.2,
  },
  eyeBtn: { padding: 4 },
  passwordError: {
    color: C.error,
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
    height: 20,
    marginBottom: 4,
  },

  // Verify button
  verifyBtn: {
    width: '100%',
    height: 50,
    backgroundColor: C.brandMid,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  verifyBtnDisabled: { opacity: 0.6 },
  verifyBtnText: { color: C.textPrimary, fontSize: 15, fontWeight: '700', letterSpacing: 0.3 },

  // Back link
  backLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 16,
    paddingVertical: 6,
  },
  backLinkText: { color: C.textTertiary, fontSize: 13 },
});