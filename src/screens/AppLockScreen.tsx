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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { verifyPin } from '../utils/pinLock';

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

// ─── Palette ────────────────────────────────────────────────────────────────
const C = {
  bg: '#2a1f17',           // deep warm brown for lock screen
  bgMid: '#3d2b1f',        // brand dark as surface
  surface: '#4a3628',      // elevated card surface
  brandDark: '#3d2b1f',
  brandMid: '#8c6239',
  brandLight: '#d9d0c7',
  border: 'rgba(217,208,199,0.18)',
  subtle: 'rgba(240,236,230,0.08)',
  error: '#e57373',        // lighter red for dark bg
  textPrimary: '#faf9f6',
  textSecondary: '#d9d0c7',
  textTertiary: '#9e8e7e',
  dotInactive: 'rgba(217,208,199,0.3)',
  dotActive: '#d9d0c7',
  keyBg: 'rgba(255,255,255,0.07)',
  keyBorder: 'rgba(255,255,255,0.10)',
};

export default function AppLockScreen({ onUnlock }: Props) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  // Animations
  const shakeX = useRef(new Animated.Value(0)).current;
  const headerY = useRef(new Animated.Value(-24)).current;
  const headerOpacity = useRef(new Animated.Value(0)).current;
  const keypadOpacity = useRef(new Animated.Value(0)).current;
  const keypadY = useRef(new Animated.Value(24)).current;
  const dotScales = useRef(
    Array.from({ length: PIN_LENGTH }, () => new Animated.Value(1))
  ).current;

  // Mount animation — stagger header then keypad
  useEffect(() => {
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
  }, []);

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

  // Unlock success: brief pulse then call onUnlock
  const animateSuccess = useCallback(() => {
    Animated.sequence(
      dotScales.map((s) =>
        Animated.spring(s, { toValue: 1.4, friction: 4, tension: 160, useNativeDriver: true })
      )
    ).start(() => {
      onUnlock();
    });
  }, [dotScales, onUnlock]);

  const handleDigit = useCallback(
    async (digit: string) => {
      if (digit === 'del') {
        setPin((prev) => {
          const next = prev.slice(0, -1);
          animateDot(next.length, false);
          return next;
        });
        setError('');
        return;
      }
      if (digit === '') return;

      const next = pin + digit;
      setPin(next);
      setError('');
      animateDot(next.length - 1, true);

      if (next.length === PIN_LENGTH) {
        const ok = await verifyPin(next);
        if (ok) {
          animateSuccess();
        } else {
          Vibration.vibrate([0, 80, 80, 80]);
          triggerShake();
          setError('Incorrect PIN. Try again.');
          setTimeout(() => setPin(''), 600);
        }
      }
    },
    [pin, onUnlock, animateDot, animateSuccess, triggerShake]
  );

  const dots = Array.from({ length: PIN_LENGTH }, (_, i) => i < pin.length);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      {/* ── Header ──────────────────────────────────────────────────────── */}
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

      {/* ── Dots ────────────────────────────────────────────────────────── */}
      <Animated.View
        style={[styles.dotsRow, { transform: [{ translateX: shakeX }] }]}
      >
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

      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <View style={styles.errorPlaceholder} />
      )}

      {/* ── Keypad ──────────────────────────────────────────────────────── */}
      <Animated.View
        style={[
          styles.keypad,
          { opacity: keypadOpacity, transform: [{ translateY: keypadY }] },
        ]}
      >
        {DIGITS.map((row, ri) => (
          <View key={ri} style={styles.row}>
            {row.map((d, di) => {
              if (d === '') {
                return <View key={di} style={styles.keyEmpty} />;
              }
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },

  // ── Header ────────────────────────────────────────────────────────────────
  header: {
    alignItems: 'center',
    marginBottom: 44,
  },
  logoRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 1.5,
    borderColor: 'rgba(217,208,199,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
    // subtle glow via shadow
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
  subtitle: {
    fontSize: 13,
    color: C.textTertiary,
    marginTop: 6,
    letterSpacing: 0.3,
  },

  // ── Dots ─────────────────────────────────────────────────────────────────
  dotsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: C.dotInactive,
    backgroundColor: 'transparent',
  },
  dotFilled: {
    backgroundColor: C.brandLight,
    borderColor: C.brandLight,
  },

  // ── Error ────────────────────────────────────────────────────────────────
  error: {
    color: C.error,
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 8,
    height: 20,
    letterSpacing: 0.2,
  },
  errorPlaceholder: {
    height: 28,
  },

  // ── Keypad ───────────────────────────────────────────────────────────────
  keypad: {
    width: '100%',
    maxWidth: 280,
    gap: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
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
  keyEmpty: {
    flex: 1,
    aspectRatio: 1.4,
  },
  keyText: {
    fontSize: 22,
    fontWeight: '500',
    color: C.textPrimary,
    letterSpacing: 0.5,
  },
});