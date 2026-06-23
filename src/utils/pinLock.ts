import * as SecureStore from 'expo-secure-store';

const PIN_KEY = 'kofitrack_app_pin';
const PIN_ENABLED_KEY = 'kofitrack_pin_enabled';

export const savePin = async (pin: string): Promise<void> => {
  await SecureStore.setItemAsync(PIN_KEY, pin);
  await SecureStore.setItemAsync(PIN_ENABLED_KEY, 'true');
};

export const getPin = async (): Promise<string | null> => {
  return await SecureStore.getItemAsync(PIN_KEY);
};

export const verifyPin = async (input: string): Promise<boolean> => {
  const stored = await SecureStore.getItemAsync(PIN_KEY);
  return stored !== null && stored === input;
};

export const isPinEnabled = async (): Promise<boolean> => {
  const val = await SecureStore.getItemAsync(PIN_ENABLED_KEY);
  return val === 'true';
};

export const disablePin = async (): Promise<void> => {
  await SecureStore.deleteItemAsync(PIN_KEY);
  await SecureStore.setItemAsync(PIN_ENABLED_KEY, 'false');
};