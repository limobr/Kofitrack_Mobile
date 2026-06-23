import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';

export const API_BASE_URL = 'http://192.168.100.6:3000'; // change to your IP

export const AUTH_EXPIRED_EVENT = 'auth:expired';

const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  timeout: 10000,
});

// Request interceptor – attach Bearer token if available
api.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
      console.log(`🚀 [API] ${config.method?.toUpperCase()} ${config.url} - Token attached`);
    } else {
      console.warn(`⚠️ [API] ${config.method?.toUpperCase()} ${config.url} - No token found!`);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor – handle 401 and log only serious errors
api.interceptors.response.use(
  (response) => {
    console.log(`✅ [API] ${response.config.method?.toUpperCase()} ${response.config.url} - ${response.status}`);
    return response;
  },
  async (error) => {
    if (error.response) {
      const status = error.response.status;
      const method = error.config?.method?.toUpperCase();
      const url = error.config?.url;

      if (status === 401) {
        // Unauthorized – clear local session and tell the rest of the app
        const hadToken = await AsyncStorage.getItem('authToken');
        await AsyncStorage.removeItem('authToken');
        await AsyncStorage.removeItem('sessionUser');
        console.warn(`⚠️ [API] ${method} ${url} - 401 Unauthorized, session cleared`);
        if (hadToken) {
          // Notify AuthContext so in-memory `user` state is cleared too,
          // otherwise the app keeps rendering as "logged in" with no token
          // and every subsequent request 401s forever.
          DeviceEventEmitter.emit(AUTH_EXPIRED_EVENT);
        }
      } else if (status === 404) {
        // 404 is expected for member search – log as info, not error
        console.log(`ℹ️ [API] ${method} ${url} - 404 Not Found`);
      } else if (status >= 500) {
        console.error(`❌ [API] ${method} ${url} - ${status}`, error.response.data);
      } else {
        // Other 4xx errors
        console.warn(`⚠️ [API] ${method} ${url} - ${status}`, error.response.data);
      }
    } else {
      console.error('❌ [API] Network error:', error.message);
    }
    return Promise.reject(error);
  }
);

export default api;