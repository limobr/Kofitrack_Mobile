import React, { useEffect, useState, useCallback } from 'react'
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import api from '../api/client'

export default function DashboardScreen() {
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const navigation = useNavigation<any>()

  const fetchStats = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true)
    setError('')
    try {
      const { data } = await api.get('/dashboard')
      setStats(data)
    } catch (e: any) {
      const message = e.response?.data?.error || e.message || 'Failed to load dashboard'
      setError(message)
      console.error('Dashboard fetch error:', e)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  const onRefresh = () => {
    setRefreshing(true)
    fetchStats(true)
  }

  // Initial load
  if (loading && !stats) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#8c6239" />
        <Text style={styles.loadingText}>Loading dashboard...</Text>
      </View>
    )
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={['#8c6239']}
          tintColor="#8c6239"
        />
      }
    >
      {/* Error banner */}
      {error ? (
        <View style={styles.errorBanner}>
          <Ionicons name="alert-circle" size={20} color="#c62828" />
          <Text style={styles.errorBannerText}>{error}</Text>
          <TouchableOpacity onPress={() => fetchStats()}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Factory name & season */}
      <Text style={styles.factoryName}>{stats?.factoryName || 'Factory'}</Text>
      <Text style={styles.season}>
        {stats?.activeSeason ? `Active season: ${stats.activeSeason}` : 'No active season'}
      </Text>

      {/* Stat cards */}
      <View style={styles.statsRow}>
        <StatCard label="Members" value={stats?.memberCount ?? 0} />
        <StatCard label="Deliveries" value={stats?.totalDeliveries ?? 0} />
        <StatCard label="Transactions" value={stats?.totalTransactions ?? 0} />
      </View>

      {/* Quick actions */}
      <Text style={styles.sectionTitle}>Quick Actions</Text>
      <View style={styles.actionsRow}>
        <ActionCard
          icon="leaf"
          title="Record Delivery"
          onPress={() => navigation.navigate('RecordDelivery')}
        />
        <ActionCard
          icon="swap-horizontal"
          title="Record Transaction"
          onPress={() => navigation.navigate('RecordTransaction')}
        />
        <ActionCard
          icon="person-add"
          title="Add Member"
          onPress={() => navigation.navigate('AddMember')}
        />
      </View>
    </ScrollView>
  )
}

// ---------- Helper Components (unchanged) ----------

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statNumber}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  )
}

function ActionCard({
  icon,
  title,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap
  title: string
  onPress: () => void
}) {
  return (
    <TouchableOpacity style={styles.actionCard} onPress={onPress} activeOpacity={0.7}>
      <Ionicons name={icon} size={32} color="#8c6239" />
      <Text style={styles.actionText}>{title}</Text>
    </TouchableOpacity>
  )
}

// ---------- Styles ----------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#faf9f6',
  },
  contentContainer: {
    padding: 16,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#faf9f6',
  },
  loadingText: {
    marginTop: 12,
    color: '#6b5e53',
    fontSize: 16,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffebee',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  errorBannerText: {
    flex: 1,
    color: '#c62828',
    fontSize: 14,
    marginLeft: 8,
  },
  retryText: {
    color: '#8c6239',
    fontWeight: '700',
    fontSize: 14,
    marginLeft: 8,
  },
  factoryName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#3d2b1f',
    marginBottom: 4,
  },
  season: {
    fontSize: 14,
    color: '#6b5e53',
    marginBottom: 24,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 4,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d9d0c7',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: '#3d2b1f',
  },
  statLabel: {
    fontSize: 12,
    color: '#6b5e53',
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#3d2b1f',
    marginBottom: 12,
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  actionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    margin: 4,
    width: '30%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d9d0c7',
  },
  actionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3d2b1f',
    marginTop: 8,
    textAlign: 'center',
  },
})