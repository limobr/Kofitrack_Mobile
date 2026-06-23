/**
 * factorySettingsCache.ts
 *
 * Centralised cache for factory settings (name, factoryInfo, receipt settings).
 *
 * Strategy:
 *  - On every fetch: write to AsyncStorage under CACHE_KEY so the data
 *    survives app restarts and offline sessions.
 *  - On read: return the in-memory copy first (fastest), fall back to
 *    AsyncStorage, then fall back to a safe default object.
 *  - Callers (Dashboard, DeliveriesScreen, RecordDeliveryScreen,
 *    RecordTransactionScreen) call `refreshFactorySettings()` when they
 *    mount / focus, so the cache stays warm while the user is online.
 *  - printService reads the cache synchronously through
 *    `getCachedFactorySettings()`, which is always safe to call even
 *    when offline.
 */

import AsyncStorage from '@react-native-async-storage/async-storage'
import api from '../api/client'

const CACHE_KEY = '@factory_settings_cache'

// In-memory singleton – shared across the whole JS runtime
let _cached: FactorySettings | null = null

export interface FactorySettings {
  name: string
  slug?: string
  settings: {
    factoryInfo?: {
      address?: string
      email?: string
      phone?: string
    }
    receipt?: {
      footer?: string
      showHeader?: boolean
      showFactoryAddress?: boolean
      showFactoryEmail?: boolean
      showFactoryPhone?: boolean
      showMemberName?: boolean
      showRegNo?: boolean
      showPhone?: boolean
      showSeason?: boolean
      showDate?: boolean
      showTime?: boolean
      showReceiptNumber?: boolean
      showClerk?: boolean
      showNetTotal?: boolean
      paperWidth?: 58 | 80
      delivery?: Record<string, any>
      transaction?: Record<string, any>
      statement?: Record<string, any>
    }
  }
}

const DEFAULT_SETTINGS: FactorySettings = {
  name: '',
  settings: {},
}

/**
 * Returns the in-memory cache immediately.
 * If nothing has been loaded yet it tries AsyncStorage synchronously
 * (actually async but always resolves quickly from disk).
 * Safe to call even offline – will never throw.
 */
export function getCachedFactorySettings(): FactorySettings | null {
  return _cached
}

/**
 * Warm the in-memory cache from AsyncStorage (disk).
 * Call once at app start (e.g. in App.tsx) so data is available before
 * any screen tries to print.
 */
export async function loadFactorySettingsFromDisk(): Promise<FactorySettings | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY)
    if (raw) {
      const parsed: FactorySettings = JSON.parse(raw)
      _cached = parsed
      return parsed
    }
  } catch (e) {
    console.warn('[factorySettingsCache] Failed to load from disk:', e)
  }
  return null
}

/**
 * Fetch fresh settings from the API, update in-memory cache and
 * persist to AsyncStorage.  Returns the fetched data on success or
 * the existing cached value on failure (graceful degradation).
 */
export async function refreshFactorySettings(): Promise<FactorySettings | null> {
  try {
    const { data } = await api.get<FactorySettings>('/factory/settings')
    _cached = data
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(data))
    console.log('[factorySettingsCache] Refreshed and persisted factory settings')
    return data
  } catch (e: any) {
    console.warn('[factorySettingsCache] Network refresh failed, using cached:', e?.message)
    // Return whatever we have – may be disk-loaded or null
    return _cached ?? (await loadFactorySettingsFromDisk())
  }
}

/**
 * Convenience: get the effective settings, falling back through cache
 * layers.  Returns DEFAULT_SETTINGS (never null) so callers don't need
 * null-checks for the receipt/factoryInfo sub-objects.
 */
export async function getFactorySettings(): Promise<FactorySettings> {
  if (_cached) return _cached
  const fromDisk = await loadFactorySettingsFromDisk()
  return fromDisk ?? DEFAULT_SETTINGS
}
