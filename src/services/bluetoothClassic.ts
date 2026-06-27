/**
 * bluetoothClassic.ts
 *
 * Single safe-import wrapper around `react-native-bluetooth-classic`.
 *
 * The project uses Bluetooth *Classic* (paired thermal printers), not BLE —
 * `react-native-ble-plx` is not installed and must not be used. Several
 * screens previously each did their own `require('react-native-ble-plx')`
 * wrapped in a try/catch; since that package isn't in package.json the
 * require always threw, was silently swallowed, and Bluetooth state never
 * updated from its default. This module centralizes the *correct* import so
 * that mistake can't be repeated, and gives callers a small typed API.
 */

let BluetoothClassic: any = null;
try {
  const mod = require('react-native-bluetooth-classic');
  BluetoothClassic = mod.default || mod;
} catch (e) {
  console.warn('react-native-bluetooth-classic not available');
}

/** True if the native module loaded at all (independent of BT being on). */
export function isBluetoothClassicAvailable(): boolean {
  return !!BluetoothClassic;
}

/**
 * Reads the current Bluetooth adapter state.
 * Resolves false (rather than rejecting) if the module is missing or the
 * native call fails, so callers can treat "unknown" the same as "off".
 */
export async function isBluetoothEnabled(): Promise<boolean> {
  if (!BluetoothClassic) return false;
  try {
    return await BluetoothClassic.isBluetoothEnabled();
  } catch (_) {
    return false;
  }
}

export default BluetoothClassic;
