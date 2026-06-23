import React, { createContext, useState, useContext, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';
import api, { AUTH_EXPIRED_EVENT } from '../api/client';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  factoryId: string | null;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStoredUser();

    // If the API client ever sees a 401, it clears AsyncStorage but has
    // no way to clear this context's in-memory state. Without this, the
    // app keeps thinking it's logged in (stale `user`), keeps rendering
    // cached data, and keeps firing requests with no token -> infinite 401s.
    const subscription = DeviceEventEmitter.addListener(AUTH_EXPIRED_EVENT, () => {
      console.warn('🔐 [Auth] Session expired (401), signing out');
      setUser(null);
    });

    return () => subscription.remove();
  }, []);

  const loadStoredUser = async () => {
    try {
      const storedUser = await AsyncStorage.getItem('sessionUser');
      if (storedUser) setUser(JSON.parse(storedUser));
    } catch (error) {
      console.error('Failed to load user session', error);
    } finally {
      setLoading(false);
    }
  };

  const signIn = async (email: string, password: string) => {
    console.log('🔐 [Auth] signIn called with', email);
    try {
      // ✅ Use the dedicated mobile‑login endpoint
      const response = await api.post('/auth/mobile-login', { email, password });
      console.log('🔐 [Auth] Response status:', response.status);
      console.log('🔐 [Auth] Response data:', response.data);

      const { token, user: userData } = response.data;

      if (!token || !userData) {
        console.error('🔐 [Auth] Missing token or userData in response');
        throw new Error('Invalid response from server');
      }

      // Store the JWT token
      await AsyncStorage.setItem('authToken', token);
      // Store the user object for session persistence
      await AsyncStorage.setItem('sessionUser', JSON.stringify(userData));
      setUser(userData);
      console.log('🔐 [Auth] Login successful for', userData.name);
    } catch (error: any) {
      console.error('🔐 [Auth] Login error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        request: error.request ? 'Request made but no response' : 'No request',
      });
      let message = 'Login failed. Please try again.';
      if (error.response?.data?.error) {
        message = error.response.data.error;
      } else if (error.request) {
        message = 'Cannot connect to server. Check your internet and API URL.';
      }
      throw new Error(message);
    }
  };

  const signOut = async () => {
    await AsyncStorage.removeItem('authToken');
    await AsyncStorage.removeItem('sessionUser');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);