import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const API_BASE_URL = 'http://192.168.100.6:3000'; // change to your IP

const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  timeout: 10000,
});

// Request interceptor – log token presence
api.interceptors.request.use(
  async (config) => {
    const token = await AsyncStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
      console.log(`🚀 [API] ${config.method?.toUpperCase()} ${config.url} - Token attached (${token.substring(0, 15)}...)`);
    } else {
      console.warn(`⚠️ [API] ${config.method?.toUpperCase()} ${config.url} - No token found!`);
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor – log errors
api.interceptors.response.use(
  (response) => {
    console.log(`✅ [API] ${response.config.method?.toUpperCase()} ${response.config.url} - ${response.status}`);
    return response;
  },
  (error) => {
    if (error.response) {
      console.error(`❌ [API] ${error.config?.method?.toUpperCase()} ${error.config?.url} - ${error.response.status}`, error.response.data);
      if (error.response.status === 401) {
        AsyncStorage.removeItem('authToken');
        AsyncStorage.removeItem('sessionUser');
      }
    } else {
      console.error('❌ [API] Network error:', error.message);
    }
    return Promise.reject(error);
  }
);

export default api;