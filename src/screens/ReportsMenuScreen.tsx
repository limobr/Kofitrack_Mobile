import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import type { RootStackParamList } from '../navigation/types'

const BRAND_DARK = '#3d2b1f'
const MUTED = '#6b5e53'
const LINE = '#e0d9d0'
const BG = '#faf9f6'

type NavigationProp = NativeStackNavigationProp<RootStackParamList>

function MenuCard({
  icon, iconBg, iconColor, title, subtitle, onPress,
}: {
  icon: any
  iconBg: string
  iconColor: string
  title: string
  subtitle: string
  onPress: () => void
}) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.75}>
      <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={26} color={iconColor} />
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardSubtitle}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={MUTED} />
    </TouchableOpacity>
  )
}

export default function ReportsMenuScreen() {
  const navigation = useNavigation<NavigationProp>()

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionLabel}>Reports</Text>

      <MenuCard
        icon="people"
        iconBg="#f0ece6"
        iconColor="#8c6239"
        title="Member Cumulatives"
        subtitle="Per-member delivered, bought, sold & net totals"
        onPress={() => navigation.navigate('Cumulatives')}
      />

      <MenuCard
        icon="stats-chart"
        iconBg="#e8f0e6"
        iconColor="#5b6b4d"
        title="Analytics"
        subtitle="Factory-wide intake trends, composition & records"
        onPress={() => navigation.navigate('Analytics')}
      />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  content: { padding: 16, paddingTop: 8 },
  sectionLabel: {
    fontSize: 13, fontWeight: '700', color: MUTED,
    textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 12,
  },
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 16, padding: 16,
    marginBottom: 12, borderWidth: 1, borderColor: LINE,
  },
  iconWrap: {
    width: 48, height: 48, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center', marginRight: 14,
  },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: BRAND_DARK },
  cardSubtitle: { fontSize: 12, color: MUTED, marginTop: 3, lineHeight: 16 },
})
