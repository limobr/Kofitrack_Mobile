import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isBluetoothEnabled } from '../services/bluetoothClassic';

/**
 * usePrintBluetoothPrompt
 *
 * Shared print-preference + Bluetooth-prompt logic for record screens
 * (Record Delivery, Record Transaction, …).
 *
 * Owns:
 *  - printReceipt preference (loaded/saved per `preferenceKey`)
 *  - printerConfigured (is a printer selected in Printer Settings)
 *  - bluetoothOn (real adapter state via react-native-bluetooth-classic)
 *  - btPromptVisible — whether the "Bluetooth is Off" modal should show
 *
 * The prompt is shown:
 *  - once when the screen is opened/focused, if the saved print preference
 *    is ON but Bluetooth is currently off, and
 *  - immediately whenever the user manually flips the header Print toggle
 *    ON while Bluetooth is off.
 *
 * `preferenceKey` lets each screen keep its own saved preference (e.g.
 * 'printReceiptPreference' vs 'printReceiptPreference_transaction').
 */
export function usePrintBluetoothPrompt(preferenceKey: string) {
  const [printReceipt, setPrintReceipt] = useState(false);
  const [printerConfigured, setPrinterConfigured] = useState(false);
  const [bluetoothOn, setBluetoothOn] = useState(false);
  const [loadingPrintState, setLoadingPrintState] = useState(true);
  const [btPromptVisible, setBtPromptVisible] = useState(false);

  // Only auto-show the prompt once per screen visit (not on every poll).
  const btPromptShownRef = useRef(false);

  const canPrint = printerConfigured && bluetoothOn;

  const loadPrintPreference = useCallback(async () => {
    try {
      const saved = await AsyncStorage.getItem(preferenceKey);
      const isPrintOn = saved === 'true';
      setPrintReceipt(isPrintOn);
      console.log(`🖨️ Print preference loaded: ${isPrintOn ? 'ON' : 'OFF'}`);
      return isPrintOn;
    } catch (error) {
      console.error('Failed to load print preference:', error);
      return false;
    }
  }, [preferenceKey]);

  const savePrintPreference = useCallback(async (value: boolean) => {
    try {
      await AsyncStorage.setItem(preferenceKey, value.toString());
      console.log(`🖨️ Print preference saved: ${value ? 'ON' : 'OFF'}`);
    } catch (error) {
      console.error('Failed to save print preference:', error);
    }
  }, [preferenceKey]);

  const refreshPrinterConfigured = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem('selectedPrinter');
      if (raw) {
        const parsed = JSON.parse(raw);
        setPrinterConfigured(!!parsed?.address);
      } else {
        setPrinterConfigured(false);
      }
    } catch (_) {
      setPrinterConfigured(false);
    }
  }, []);

  const refreshBluetoothState = useCallback(async () => {
    const enabled = await isBluetoothEnabled();
    setBluetoothOn(enabled);
    return enabled;
  }, []);

  // Initial load: preference + printer config + real bluetooth state, all
  // resolved before we decide whether to show the prompt. Doing this as one
  // sequential block (rather than flipping a "loading" flag before the
  // preference finishes loading) avoids a render pass where loading=false
  // but printReceipt hasn't been restored yet.
  useEffect(() => {
    (async () => {
      setLoadingPrintState(true);
      const [isPrintOn] = await Promise.all([
        loadPrintPreference(),
        refreshPrinterConfigured(),
        refreshBluetoothState(),
      ]);
      setLoadingPrintState(false);

      if (isPrintOn && !btPromptShownRef.current) {
        // Re-check bluetooth fresh rather than trusting a stale closure.
        const enabled = await isBluetoothEnabled();
        if (!enabled) {
          btPromptShownRef.current = true;
          setBtPromptVisible(true);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-check Bluetooth + printer config whenever the screen regains focus —
  // e.g. user goes to Printer Settings, turns Bluetooth on, comes back.
  useFocusEffect(
    useCallback(() => {
      refreshPrinterConfigured();
      refreshBluetoothState();
    }, [refreshPrinterConfigured, refreshBluetoothState])
  );

  const handleTogglePrint = useCallback(
    async (value: boolean, onNoPrinter?: () => void) => {
      setPrintReceipt(value);
      savePrintPreference(value);
      if (!value) return;

      const enabled = await refreshBluetoothState();
      if (!enabled) {
        setBtPromptVisible(true);
      } else {
        await refreshPrinterConfigured();
        if (!printerConfigured) onNoPrinter?.();
      }
    },
    [refreshBluetoothState, refreshPrinterConfigured, printerConfigured]
  );

  const dismissPromptAndDisablePrint = useCallback(() => {
    setPrintReceipt(false);
    savePrintPreference(false);
    setBtPromptVisible(false);
  }, [savePrintPreference]);

  return {
    printReceipt,
    printerConfigured,
    bluetoothOn,
    canPrint,
    loadingPrintState,
    btPromptVisible,
    setBtPromptVisible,
    handleTogglePrint,
    dismissPromptAndDisablePrint,
  };
}
