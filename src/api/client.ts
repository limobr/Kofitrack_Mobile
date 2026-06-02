import axios from 'axios'
import * as SecureStore from 'expo-secure-store'

const API_URL = 'https://kofi-track-web.vercel.app/api'   // ⬅️ replace with your actual IP

const api = axios.create({ baseURL: API_URL })

api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('supabase-token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export default api