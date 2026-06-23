import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Alert,
  Vibration,
  SafeAreaView,
  ScrollView,
  StatusBar,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { savePin, disablePin, isPinEnabled, verifyPin } from '../utils/pinLock';

type Mode = 'idle' | 'enter-current' | 'enter-new' | 'confirm-new';

const DIGITS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['', '0', 'del'],
];

const PIN_LENGTH = 4;

const modeLabel: Record<Mode, string> = {
  idle: '',
  'enter-current': 'Enter current PIN',
  'enter-new': 'Enter new PIN',
  'confirm-new': 'Confirm new PIN',
};

// ─── Palette ────────────────────────────────────────────────────────────────
const C = {
  bg: '#faf9f6',
  surface: '#fff',
  brandDark: '#3d2b1f',
  brandMid: '#8c6239',
  brandLight: '#d9d0c7',
  border: '#e0d9d0',
  subtle: '#f0ece6',
  success: '#2e7d32',
  error: '#c62828',
  textPrimary: '#1a1512',
  textSecondary: '#6b5e53',
  textTertiary: '#9e8e7e',
};

export default function PinLockScreen() {
  const [pinEnabled, setPinEnabled] = useState(false);
  const [mode, setMode] = useState<Mode>('idle');
  const [intent, setIntent] = useState<'disable' | 'change' | null>(null);
  const [pin, setPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  // Animated values
  const padOpacity = useRef(new Animated.Value(0)).current;
  const padTranslate = useRef(new Animated.Value(16)).current;
  const shakeX = useRef(new Animated.Value(0)).current;
  const dotScales = useRef(
    Array.from({ length: PIN_LENGTH }, () => new Animated.Value(1))
  ).current;

  useEffect(() => {
    isPinEnabled().then((enabled) => {
      setPinEnabled(enabled);
      setLoading(false);
    });
  }, []);

  // Animate pad in when mode changes away from idle
  useEffect(() => {
    if (mode !== 'idle') {
      Animated.parallel([
        Animated.timing(padOpacity, {
          toValue: 1,
          duration: 260,
          useNativeDriver: true,
        }),
        Animated.spring(padTranslate, {
          toValue: 0,
          friction: 8,
          tension: 60,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      padOpacity.setValue(0);
      padTranslate.setValue(16);
    }
  }, [mode]);

  // Animate dot fill on digit press
  const animateDot = useCallback(
    (index: number, filled: boolean) => {
      Animated.spring(dotScales[index], {
        toValue: filled ? 1.25 : 1,
        friction: 5,
        tension: 120,
        useNativeDriver: true,
      }).start(() => {
        if (filled) {
          Animated.spring(dotScales[index], {
            toValue: 1,
            friction: 5,
            tension: 120,
            useNativeDriver: true,
          }).start();
        }
      });
    },
    [dotScales]
  );

  const triggerShake = useCallback(() => {
    shakeX.setValue(0);
    Animated.sequence([
      Animated.timing(shakeX, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 6, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: -6, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 0, duration: 40, useNativeDriver: true }),
    ]).start();
  }, [shakeX]);

  const resetPad = useCallback(() => {
    setPin('');
    setNewPin('');
    setError('');
    setMode('idle');
    setIntent(null);
  }, []);

  const handleToggle = useCallback(
    (value: boolean) => {
      if (value) {
        setIntent(null);
        setMode('enter-new');
        setPin('');
      } else {
        if (pinEnabled) {
          setIntent('disable');
          setMode('enter-current');
          setPin('');
        }
      }
    },
    [pinEnabled]
  );

  const handleChangePin = useCallback(() => {
    setIntent('change');
    setMode('enter-current');
    setPin('');
    setError('');
  }, []);

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

      if (next.length < PIN_LENGTH) return;

      if (mode === 'enter-current') {
        const ok = await verifyPin(next);
        if (!ok) {
          Vibration.vibrate([0, 80, 80, 80]);
          triggerShake();
          setError('Incorrect PIN.');
          setTimeout(() => setPin(''), 500);
          return;
        }
        if (intent === 'disable') {
          await disablePin();
          setPinEnabled(false);
          Alert.alert('PIN removed', 'App lock has been disabled.');
          resetPad();
        } else {
          // intent === 'change'
          setNewPin('');
          setPin('');
          setError('');
          setMode('enter-new');
        }
        return;
      }

      if (mode === 'enter-new') {
        setNewPin(next);
        setPin('');
        setError('');
        setMode('confirm-new');
        return;
      }

      if (mode === 'confirm-new') {
        if (next !== newPin) {
          Vibration.vibrate([0, 80, 80, 80]);
          triggerShake();
          setError("PINs don't match. Try again.");
          setTimeout(() => {
            setPin('');
            setNewPin('');
            setMode('enter-new');
          }, 600);
          return;
        }
        await savePin(next);
        setPinEnabled(true);
        Alert.alert('PIN set', 'Your app PIN has been saved.');
        resetPad();
      }
    },
    [pin, mode, newPin, intent, resetPad, animateDot, triggerShake]
  );

  const dots = Array.from({ length: PIN_LENGTH }, (_, i) => i < pin.length);

  if (loading) {
    return <View style={styles.safe} />;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header card ─────────────────────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <View style={styles.cardLeft}>
              <View style={styles.iconCircle}>
                <Ionicons name="lock-closed" size={20} color={C.brandDark} />
              </View>
              <View>
                <Text style={styles.cardTitle}>App PIN Lock</Text>
                <Text style={styles.cardSub}>
                  {pinEnabled ? 'Enabled — required on open' : 'Disabled'}
                </Text>
              </View>
            </View>
            <Switch
              value={pinEnabled}
              onValueChange={handleToggle}
              trackColor={{ false: C.brandLight, true: C.brandDark }}
              thumbColor={C.surface}
            />
          </View>
        </View>

        {/* ── Change PIN row ───────────────────────────────────────────── */}
        {pinEnabled && mode === 'idle' && (
          <TouchableOpacity
            style={styles.changeBtn}
            onPress={handleChangePin}
            activeOpacity={0.75}
          >
            <Ionicons name="key-outline" size={18} color={C.brandMid} />
            <Text style={styles.changeBtnText}>Change PIN</Text>
            <Ionicons
              name="chevron-forward"
              size={16}
              color={C.textTertiary}
              style={{ marginLeft: 'auto' }}
            />
          </TouchableOpacity>
        )}

        {/* ── PIN entry pad ────────────────────────────────────────────── */}
        {mode !== 'idle' && (
          <Animated.View
            style={[
              styles.padWrapper,
              {
                opacity: padOpacity,
                transform: [{ translateY: padTranslate }],
              },
            ]}
          >
            <Text style={styles.padLabel}>{modeLabel[mode]}</Text>

            {/* Dots */}
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

            {/* Keypad */}
            <View style={styles.keypad}>
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
                          activeOpacity={0.65}
                        >
                          <Ionicons name="backspace-outline" size={22} color={C.textSecondary} />
                        </TouchableOpacity>
                      );
                    }
                    return (
                      <TouchableOpacity
                        key={di}
                        style={styles.key}
                        onPress={() => handleDigit(d)}
                        activeOpacity={0.65}
                      >
                        <Text style={styles.keyText}>{d}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </View>

            <TouchableOpacity onPress={resetPad} style={styles.cancelBtn} activeOpacity={0.7}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* ── Info note ────────────────────────────────────────────────── */}
        {mode === 'idle' && (
          <View style={styles.note}>
            <Ionicons name="information-circle-outline" size={15} color={C.textTertiary} />
            <Text style={styles.noteText}>
              When enabled, you'll need to enter your PIN each time you open KofiTrack.
            </Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: C.bg,
  },
  container: {
    padding: 20,
    paddingBottom: 48,
  },

  // ── Card ──────────────────────────────────────────────────────────────────
  card: {
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: C.brandDark,
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: C.subtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: C.textPrimary,
    letterSpacing: 0.1,
  },
  cardSub: {
    fontSize: 12,
    color: C.textTertiary,
    marginTop: 2,
  },

  // ── Change PIN row ────────────────────────────────────────────────────────
  changeBtn: {
    backgroundColor: C.surface,
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: C.brandDark,
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  changeBtnText: {
    fontSize: 15,
    color: C.textPrimary,
    fontWeight: '500',
  },

  // ── PIN pad wrapper ───────────────────────────────────────────────────────
  padWrapper: {
    backgroundColor: C.surface,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: C.border,
    shadowColor: C.brandDark,
    shadowOpacity: 0.07,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  padLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: C.brandMid,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 24,
  },

  // ── Dots ─────────────────────────────────────────────────────────────────
  dotsRow: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 10,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: C.brandLight,
    backgroundColor: 'transparent',
  },
  dotFilled: {
    backgroundColor: C.brandDark,
    borderColor: C.brandDark,
  },

  // ── Error ────────────────────────────────────────────────────────────────
  error: {
    color: C.error,
    fontSize: 13,
    marginBottom: 4,
    height: 20,
    fontWeight: '500',
  },
  errorPlaceholder: {
    height: 24,
  },

  // ── Keypad ───────────────────────────────────────────────────────────────
  keypad: {
    width: '100%',
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  key: {
    flex: 1,
    paddingVertical: 16,
    backgroundColor: C.subtle,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },
  keyEmpty: {
    flex: 1,
  },
  keyText: {
    fontSize: 20,
    fontWeight: '500',
    color: C.textPrimary,
  },

  // ── Cancel ───────────────────────────────────────────────────────────────
  cancelBtn: {
    marginTop: 16,
    paddingVertical: 8,
    paddingHorizontal: 24,
  },
  cancelText: {
    color: C.textTertiary,
    fontSize: 14,
    fontWeight: '500',
  },

  // ── Note ─────────────────────────────────────────────────────────────────
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingHorizontal: 4,
    marginTop: 4,
  },
  noteText: {
    fontSize: 12,
    color: C.textTertiary,
    flex: 1,
    lineHeight: 18,
  },
});