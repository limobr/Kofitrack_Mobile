import React, { createContext, useState, useContext, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../api/client';

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
    try {
      const response = await api.post('/auth/callback/credentials', { email, password });
      const { data } = response;
      if (data.token) await AsyncStorage.setItem('authToken', data.token);
      await AsyncStorage.setItem('sessionUser', JSON.stringify(data.user));
      setUser(data.user);
    } catch (error: any) {
      console.error('Login error:', error.response?.data || error.message);
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