import React, { useState, useEffect, useCallback } from 'react'
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Dimensions, Modal, Pressable,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import api from '../api/client'

const { width } = Dimensions.get('window')

// ── Colour tokens (matches app palette) ──────────────────────────────────────
const BG         = '#FAF7F1'
const BRAND_DARK = '#2E2018'
const CHERRY     = '#c0392b'
const MBUNI      = '#8c6239'
const MUTED      = '#8A7C6B'
const LINE       = '#E4DBCB'
const CARD_BG    = '#FFFFFF'
const CHERRY_BG  = '#FFF0EE'
const MBUNI_BG   = '#FFF8F2'
const COMBINED_BG = '#F0EDE8'
const DELIVERIES_BG = '#EFF3FF'

// ── Types ─────────────────────────────────────────────────────────────────────
type Period = 'today' | 'week' | 'month' | 'quarter' | 'season'
type Granularity = 'daily' | 'weekly' | 'monthly'

interface Summary {
  cherryKg: number
  mbuniKg: number
  combinedKg: number
  deliveryCount: number
  cherryPct: number
  mbuniPct: number
}

interface MonthRow {
  key: string
  label: string
  cherryKg: number
  mbuniKg: number
  totalKg: number
}

interface WeekRow {
  key: string
  weekStart: string
  weekLabel: string
  weekNumber: number
  cherryKg: number
  mbuniKg: number
  totalKg: number
}

interface DayRow {
  key: string
  label: string
  cherryKg: number
  mbuniKg: number
  totalKg: number
}

interface Records {
  bestDay: { label: string; totalKg: number } | null
  bestWeek: { label: string; totalKg: number } | null
  bestMonth: { label: string; totalKg: number } | null
}

interface Season {
  id: string
  name: string
  is_active: boolean | null
  start_date: string
}

interface TotalsData {
  summary: Summary
  monthly: MonthRow[]
  weekly: WeekRow[]
  daily: DayRow[]
  records: Records
  seasons: Season[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n: number): string {
  return n.toLocaleString('en-KE', { maximumFractionDigits: 0 })
}

function fmtKg(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M KG'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K KG'
  return fmt(n) + ' KG'
}

// ── Mini Bar Chart (pure RN, no recharts) ─────────────────────────────────────
function MiniBarChart({
  data,
  height = 120,
}: {
  data: Array<{ label: string; cherry: number; mbuni: number }>
  height?: number
}) {
  const maxVal = Math.max(...data.map(d => d.cherry + d.mbuni), 1)
  const barWidth = Math.max(8, (width - 64) / data.length - 4)

  return (
    <View style={{ height, flexDirection: 'row', alignItems: 'flex-end', gap: 3, paddingHorizontal: 4 }}>
      {data.map((d, i) => {
        const totalH = Math.max(2, ((d.cherry + d.mbuni) / maxVal) * (height - 20))
        const cherryH = totalH * (d.cherry / Math.max(d.cherry + d.mbuni, 1))
        const mbuniH = totalH - cherryH
        return (
          <View key={i} style={{ alignItems: 'center', flex: 1 }}>
            <View style={{ justifyContent: 'flex-end', height: height - 20 }}>
              <View style={{ width: barWidth, overflow: 'hidden', borderRadius: 3 }}>
                <View style={{ height: mbuniH, backgroundColor: MBUNI }} />
                <View style={{ height: cherryH, backgroundColor: CHERRY }} />
              </View>
            </View>
            {data.length <= 12 && (
              <Text
                style={{ fontSize: 8, color: MUTED, marginTop: 2, textAlign: 'center' }}
                numberOfLines={1}
              >
                {d.label.split(' ')[0]}
              </Text>
            )}
          </View>
        )
      })}
    </View>
  )
}

// ── Trend Line (sparkline) ────────────────────────────────────────────────────
function SparkLine({
  data,
  color,
  height = 60,
}: {
  data: number[]
  color: string
  height?: number
}) {
  if (data.length < 2) return null
  const max = Math.max(...data, 1)
  const w = width - 80
  const step = w / (data.length - 1)
  const pts = data.map((v, i) => ({
    x: i * step,
    y: height - (v / max) * (height - 4) - 2,
  }))

  // Build SVG path
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')

  return (
    <View style={{ height, width: w, overflow: 'hidden' }}>
      {/* Simple polyline approximation using absolutely positioned views */}
      {pts.slice(0, -1).map((p, i) => {
        const next = pts[i + 1]
        const dx = next.x - p.x
        const dy = next.y - p.y
        const len = Math.sqrt(dx * dx + dy * dy)
        const angle = Math.atan2(dy, dx) * (180 / Math.PI)
        return (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: p.x,
              top: p.y - 1,
              width: len,
              height: 2.5,
              backgroundColor: color,
              transformOrigin: 'left center',
              transform: [{ rotate: `${angle}deg` }],
            }}
          />
        )
      })}
    </View>
  )
}

// ── Ratio Bar ─────────────────────────────────────────────────────────────────
function RatioBar({ pct, color }: { pct: number; color: string }) {
  return (
    <View style={styles.ratioTrack}>
      <View style={[styles.ratioFill, { width: `${pct}%` as any, backgroundColor: color }]} />
    </View>
  )
}

// ── Summary Card ──────────────────────────────────────────────────────────────
function SummaryCard({
  label, value, unit, pct, iconName, cardBg, iconColor,
}: {
  label: string
  value: string
  unit: string
  pct?: number
  iconName: string
  cardBg: string
  iconColor: string
}) {
  return (
    <View style={[styles.summaryCard, { backgroundColor: cardBg }]}>
      <View style={[styles.summaryIconWrap, { backgroundColor: iconColor + '22' }]}>
        <Ionicons name={iconName as any} size={20} color={iconColor} />
      </View>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryUnit}>{unit}</Text>
      {pct !== undefined && (
        <View style={[styles.summaryPct, { backgroundColor: iconColor }]}>
          <Text style={styles.summaryPctText}>{pct}%</Text>
        </View>
      )}
    </View>
  )
}

// ── Record Highlight Card ─────────────────────────────────────────────────────
function RecordCard({ icon, period, label, value }: { icon: string; period: string; label: string; value: string }) {
  return (
    <View style={styles.recordCard}>
      <View style={styles.recordIconWrap}>
        <Ionicons name={icon as any} size={18} color={BRAND_DARK} />
      </View>
      <Text style={styles.recordPeriod}>{period}</Text>
      <Text style={styles.recordLabel}>{label}</Text>
      <Text style={styles.recordValue}>{value}</Text>
    </View>
  )
}

// ── Period Picker Modal ───────────────────────────────────────────────────────
function PeriodPickerModal({
  visible,
  seasons,
  selectedSeasonId,
  selectedPeriod,
  onConfirm,
  onClose,
}: {
  visible: boolean
  seasons: Season[]
  selectedSeasonId: string
  selectedPeriod: Period
  onConfirm: (seasonId: string, period: Period) => void
  onClose: () => void
}) {
  const [localSeason, setLocalSeason] = useState(selectedSeasonId)
  const [localPeriod, setLocalPeriod] = useState<Period>(selectedPeriod)

  useEffect(() => {
    setLocalSeason(selectedSeasonId)
    setLocalPeriod(selectedPeriod)
  }, [visible])

  const periods: { value: Period; label: string }[] = [
    { value: 'season', label: 'Current Season' },
    { value: 'today', label: 'Today' },
    { value: 'week', label: 'This Week' },
    { value: 'month', label: 'This Month' },
    { value: 'quarter', label: 'This Quarter' },
  ]

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <View style={styles.modalPanel}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Filter Analytics</Text>

          <Text style={styles.filterSectionLabel}>SEASON</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillRow}>
            <TouchableOpacity
              style={[styles.pill, localSeason === '' && styles.pillActive]}
              onPress={() => setLocalSeason('')}
            >
              <Text style={[styles.pillText, localSeason === '' && styles.pillTextActive]}>All</Text>
            </TouchableOpacity>
            {seasons.map(s => (
              <TouchableOpacity
                key={s.id}
                style={[styles.pill, localSeason === s.id && styles.pillActive]}
                onPress={() => setLocalSeason(s.id)}
              >
                <Text style={[styles.pillText, localSeason === s.id && styles.pillTextActive]}>
                  {s.name}{s.is_active ? ' ●' : ''}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={[styles.filterSectionLabel, { marginTop: 20 }]}>PERIOD</Text>
          {periods.map(p => (
            <TouchableOpacity
              key={p.value}
              style={[styles.periodRow, localPeriod === p.value && styles.periodRowActive]}
              onPress={() => setLocalPeriod(p.value)}
            >
              <Text style={[styles.periodRowText, localPeriod === p.value && styles.periodRowTextActive]}>
                {p.label}
              </Text>
              {localPeriod === p.value && (
                <Ionicons name="checkmark" size={18} color={BRAND_DARK} />
              )}
            </TouchableOpacity>
          ))}

          <TouchableOpacity
            style={styles.applyBtn}
            onPress={() => { onConfirm(localSeason, localPeriod); onClose() }}
          >
            <Text style={styles.applyBtnText}>Apply Filters</Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  )
}

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function AnalyticsScreen() {
  const [data, setData] = useState<TotalsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [seasonId, setSeasonId] = useState('')
  const [period, setPeriod] = useState<Period>('season')
  const [granularity, setGranularity] = useState<Granularity>('monthly')
  const [drillMonth, setDrillMonth] = useState<string | null>(null)
  const [drillWeek, setDrillWeek] = useState<string | null>(null)
  const [filterVisible, setFilterVisible] = useState(false)

  const fetchData = useCallback(async (sId: string, p: Period) => {
    setLoading(true)
    setError('')
    try {
      const params: Record<string, string> = { period: p }
      if (sId) params.seasonId = sId
      const qs = new URLSearchParams(params).toString()
      const res = await api.get(`/totals?${qs}`)
      const json = res.data as TotalsData
      setData(json)
      // Auto-select active season on first load
      if (!sId && json.seasons?.length) {
        const active = json.seasons.find(s => s.is_active) || json.seasons[0]
        if (active) setSeasonId(active.id)
      }
    } catch {
      setError('Failed to load analytics data.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData('', 'season')
  }, [])

  const handleApply = (sId: string, p: Period) => {
    setSeasonId(sId)
    setPeriod(p)
    setDrillMonth(null)
    setDrillWeek(null)
    fetchData(sId, p)
  }

  // ── Drill-down data ──
  const filteredWeekly = drillMonth
    ? (data?.weekly.filter(w => w.weekStart.startsWith(drillMonth)) ?? [])
    : (data?.weekly ?? [])

  const filteredDaily = drillWeek
    ? (data?.daily.filter(d => {
        const ws = new Date(drillWeek)
        const we = new Date(drillWeek)
        we.setDate(we.getDate() + 7)
        const dd = new Date(d.key)
        return dd >= ws && dd < we
      }) ?? [])
    : drillMonth
    ? (data?.daily.filter(d => d.key.startsWith(drillMonth)) ?? [])
    : (data?.daily ?? [])

  // ── Chart data ──
  const chartData: Array<{ label: string; cherry: number; mbuni: number }> =
    granularity === 'daily'
      ? filteredDaily.slice(-30).map(d => ({ label: d.label, cherry: d.cherryKg, mbuni: d.mbuniKg }))
      : granularity === 'weekly'
      ? filteredWeekly.map(w => ({ label: `Wk${w.weekNumber}`, cherry: w.cherryKg, mbuni: w.mbuniKg }))
      : (data?.monthly.map(m => ({ label: m.label, cherry: m.cherryKg, mbuni: m.mbuniKg })) ?? [])

  // ── Loading ──
  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={BRAND_DARK} />
        <Text style={styles.loadingText}>Loading coffee analytics…</Text>
      </View>
    )
  }

  // ── Error ──
  if (error) {
    return (
      <View style={styles.centered}>
        <Ionicons name="cafe-outline" size={48} color={MUTED} />
        <Text style={[styles.loadingText, { marginTop: 12 }]}>{error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={() => fetchData(seasonId, period)}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    )
  }

  if (!data) return null

  const { summary, monthly, records } = data

  const activeSeason = data.seasons.find(s => s.id === seasonId)
  const periodLabels: Record<Period, string> = {
    season: activeSeason ? activeSeason.name : 'All Seasons',
    today: 'Today',
    week: 'This Week',
    month: 'This Month',
    quarter: 'This Quarter',
  }

  return (
    <>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Page header ── */}
        <View style={styles.pageHeader}>
          <View>
            <Text style={styles.pageTitle}>Coffee Totals</Text>
            <Text style={styles.pageSubtitle}>Cherry and Mbuni intake across periods</Text>
          </View>
          <TouchableOpacity style={styles.filterBtn} onPress={() => setFilterVisible(true)}>
            <Ionicons name="options-outline" size={18} color={BRAND_DARK} />
            <Text style={styles.filterBtnText}>Filter</Text>
          </TouchableOpacity>
        </View>

        {/* Active filter pill */}
        <View style={styles.activePill}>
          <Ionicons name="calendar-outline" size={13} color={MUTED} />
          <Text style={styles.activePillText}>{periodLabels[period]}</Text>
        </View>

        {/* ── Summary cards 2×2 grid ── */}
        <View style={styles.summaryGrid}>
          <SummaryCard
            label="Cherry Total"
            value={fmt(summary.cherryKg)}
            unit="KG · fresh berries"
            pct={summary.cherryPct}
            iconName="leaf"
            cardBg={CHERRY_BG}
            iconColor={CHERRY}
          />
          <SummaryCard
            label="Mbuni Total"
            value={fmt(summary.mbuniKg)}
            unit="KG · dry berries"
            pct={summary.mbuniPct}
            iconName="cafe"
            cardBg={MBUNI_BG}
            iconColor={MBUNI}
          />
          <SummaryCard
            label="Combined Total"
            value={fmt(summary.combinedKg)}
            unit="KG · all intake"
            iconName="cube-outline"
            cardBg={COMBINED_BG}
            iconColor={BRAND_DARK}
          />
          <SummaryCard
            label="Total Deliveries"
            value={fmt(summary.deliveryCount)}
            unit="trips recorded"
            iconName="car-outline"
            cardBg={DELIVERIES_BG}
            iconColor="#3D5A8A"
          />
        </View>

        {/* ── Intake Composition ── */}
        {summary.combinedKg > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Intake Composition</Text>
            <View style={styles.compositionRow}>
              <View style={styles.dotLabel}>
                <View style={[styles.dot, { backgroundColor: CHERRY }]} />
                <Text style={styles.dotText}>Cherry</Text>
              </View>
              <RatioBar pct={summary.cherryPct} color={CHERRY} />
              <Text style={styles.pctText}>{summary.cherryPct}%</Text>
            </View>
            <View style={[styles.compositionRow, { marginTop: 12 }]}>
              <View style={styles.dotLabel}>
                <View style={[styles.dot, { backgroundColor: MBUNI }]} />
                <Text style={styles.dotText}>Mbuni</Text>
              </View>
              <RatioBar pct={summary.mbuniPct} color={MBUNI} />
              <Text style={styles.pctText}>{summary.mbuniPct}%</Text>
            </View>
            <Text style={styles.compositionNote}>
              A kilo of Mbuni (dry) is more valuable than Cherry (fresh) — tracked separately.
            </Text>
          </View>
        )}

        {/* ── Trend Chart ── */}
        {chartData.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <View>
                <Text style={styles.sectionTitle}>Intake Trend</Text>
                <Text style={styles.sectionHint}>Cherry (red) · Mbuni (brown)</Text>
              </View>
              <View style={styles.granToggle}>
                {(['daily', 'weekly', 'monthly'] as Granularity[]).map(g => (
                  <TouchableOpacity
                    key={g}
                    style={[styles.granBtn, granularity === g && styles.granBtnActive]}
                    onPress={() => setGranularity(g)}
                  >
                    <Text style={[styles.granBtnText, granularity === g && styles.granBtnTextActive]}>
                      {g.charAt(0).toUpperCase() + g.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <MiniBarChart data={chartData} height={130} />
          </View>
        )}

        {/* ── Breadcrumb ── */}
        {(drillMonth || drillWeek) && (
          <View style={styles.breadcrumb}>
            <TouchableOpacity onPress={() => { setDrillMonth(null); setDrillWeek(null) }}>
              <Text style={styles.breadcrumbBtn}>Season</Text>
            </TouchableOpacity>
            {drillMonth && (
              <>
                <Text style={styles.breadcrumbSep}>›</Text>
                <TouchableOpacity onPress={() => setDrillWeek(null)}>
                  <Text style={styles.breadcrumbBtn}>{drillMonth}</Text>
                </TouchableOpacity>
              </>
            )}
            {drillWeek && (
              <>
                <Text style={styles.breadcrumbSep}>›</Text>
                <Text style={styles.breadcrumbCurrent}>Week of {drillWeek}</Text>
              </>
            )}
          </View>
        )}

        {/* ── Monthly Breakdown ── */}
        {!drillMonth && monthly.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Monthly Breakdown</Text>
            <Text style={styles.sectionHint}>Tap a month to drill into weekly data</Text>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Month</Text>
              <Text style={[styles.tableHeaderCell, { color: CHERRY }]}>Cherry</Text>
              <Text style={[styles.tableHeaderCell, { color: MBUNI }]}>Mbuni</Text>
              <Text style={styles.tableHeaderCell}>Total</Text>
              <Text style={{ width: 14 }} />
            </View>
            {monthly.map(m => (
              <TouchableOpacity
                key={m.key}
                style={styles.tableRow}
                onPress={() => { setDrillMonth(m.key); setDrillWeek(null); setGranularity('weekly') }}
                activeOpacity={0.7}
              >
                <Text style={[styles.tableCell, styles.periodCell, { flex: 2 }]}>{m.label}</Text>
                <Text style={[styles.tableCell, { color: CHERRY }]}>{fmt(m.cherryKg)}</Text>
                <Text style={[styles.tableCell, { color: MBUNI }]}>{fmt(m.mbuniKg)}</Text>
                <Text style={[styles.tableCell, styles.boldCell]}>{fmt(m.totalKg)}</Text>
                <Text style={styles.arrowCell}>›</Text>
              </TouchableOpacity>
            ))}
            <View style={[styles.tableRow, styles.totalsRow]}>
              <Text style={[styles.tableCell, { flex: 2, fontWeight: '700', color: BRAND_DARK }]}>Season Total</Text>
              <Text style={[styles.tableCell, { color: CHERRY, fontWeight: '700' }]}>{fmt(summary.cherryKg)}</Text>
              <Text style={[styles.tableCell, { color: MBUNI, fontWeight: '700' }]}>{fmt(summary.mbuniKg)}</Text>
              <Text style={[styles.tableCell, styles.boldCell]}>{fmt(summary.combinedKg)}</Text>
              <Text style={{ width: 14 }} />
            </View>
          </View>
        )}

        {/* ── Weekly Breakdown ── */}
        {drillMonth && !drillWeek && filteredWeekly.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Weekly Breakdown</Text>
            <Text style={styles.sectionHint}>Tap a week to see daily data</Text>
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Week</Text>
              <Text style={[styles.tableHeaderCell, { color: CHERRY }]}>Cherry</Text>
              <Text style={[styles.tableHeaderCell, { color: MBUNI }]}>Mbuni</Text>
              <Text style={styles.tableHeaderCell}>Total</Text>
              <Text style={{ width: 14 }} />
            </View>
            {filteredWeekly.map(w => (
              <TouchableOpacity
                key={w.key}
                style={styles.tableRow}
                onPress={() => { setDrillWeek(w.weekStart); setGranularity('daily') }}
                activeOpacity={0.7}
              >
                <Text style={[styles.tableCell, styles.periodCell, { flex: 2 }]}>{w.weekLabel}</Text>
                <Text style={[styles.tableCell, { color: CHERRY }]}>{fmt(w.cherryKg)}</Text>
                <Text style={[styles.tableCell, { color: MBUNI }]}>{fmt(w.mbuniKg)}</Text>
                <Text style={[styles.tableCell, styles.boldCell]}>{fmt(w.totalKg)}</Text>
                <Text style={styles.arrowCell}>›</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* ── Daily Breakdown ── */}
        {drillWeek && filteredDaily.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Daily Breakdown</Text>
            <MiniBarChart
              data={filteredDaily.map(d => ({ label: d.label, cherry: d.cherryKg, mbuni: d.mbuniKg }))}
              height={120}
            />
            <View style={[styles.tableHeader, { marginTop: 16 }]}>
              <Text style={[styles.tableHeaderCell, { flex: 2 }]}>Day</Text>
              <Text style={[styles.tableHeaderCell, { color: CHERRY }]}>Cherry</Text>
              <Text style={[styles.tableHeaderCell, { color: MBUNI }]}>Mbuni</Text>
              <Text style={styles.tableHeaderCell}>Total</Text>
            </View>
            {filteredDaily.map(d => (
              <View key={d.key} style={styles.tableRow}>
                <Text style={[styles.tableCell, styles.periodCell, { flex: 2 }]}>{d.label}</Text>
                <Text style={[styles.tableCell, { color: CHERRY }]}>{fmt(d.cherryKg)}</Text>
                <Text style={[styles.tableCell, { color: MBUNI }]}>{fmt(d.mbuniKg)}</Text>
                <Text style={[styles.tableCell, styles.boldCell]}>{fmt(d.totalKg)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Records & Highlights ── */}
        {(records.bestDay || records.bestWeek || records.bestMonth) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Records &amp; Highlights</Text>
            <View style={styles.recordsGrid}>
              {records.bestDay && (
                <RecordCard
                  icon="trophy-outline"
                  period="Best Day"
                  label={records.bestDay.label}
                  value={fmtKg(records.bestDay.totalKg)}
                />
              )}
              {records.bestWeek && (
                <RecordCard
                  icon="calendar-outline"
                  period="Best Week"
                  label={records.bestWeek.label}
                  value={fmtKg(records.bestWeek.totalKg)}
                />
              )}
              {records.bestMonth && (
                <RecordCard
                  icon="trending-up-outline"
                  period="Best Month"
                  label={records.bestMonth.label}
                  value={fmtKg(records.bestMonth.totalKg)}
                />
              )}
            </View>
          </View>
        )}

        {/* ── Empty state ── */}
        {summary.combinedKg === 0 && (
          <View style={styles.emptyState}>
            <Ionicons name="cafe-outline" size={48} color={MUTED} />
            <Text style={styles.emptyText}>No delivery data for selected filters.</Text>
            <Text style={styles.emptyHint}>Try a different season or period.</Text>
          </View>
        )}
      </ScrollView>

      {/* ── Filter Modal ── */}
      <PeriodPickerModal
        visible={filterVisible}
        seasons={data.seasons}
        selectedSeasonId={seasonId}
        selectedPeriod={period}
        onConfirm={handleApply}
        onClose={() => setFilterVisible(false)}
      />
    </>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: BG, padding: 24 },
  loadingText: { marginTop: 12, color: MUTED, fontSize: 15 },

  retryBtn: {
    marginTop: 20, paddingHorizontal: 24, paddingVertical: 12,
    backgroundColor: BRAND_DARK, borderRadius: 12,
  },
  retryText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  // Page header
  pageHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: 12,
  },
  pageTitle: { fontSize: 22, fontWeight: '800', color: BRAND_DARK },
  pageSubtitle: { fontSize: 13, color: MUTED, marginTop: 3 },
  filterBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 10, borderWidth: 1, borderColor: LINE,
    backgroundColor: CARD_BG,
  },
  filterBtnText: { fontSize: 13, fontWeight: '600', color: BRAND_DARK },

  // Active pill
  activePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    alignSelf: 'flex-start', backgroundColor: CARD_BG,
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20,
    borderWidth: 1, borderColor: LINE, marginBottom: 20,
  },
  activePillText: { fontSize: 12, color: MUTED, fontWeight: '600' },

  // Summary grid
  summaryGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20,
  },
  summaryCard: {
    width: (width - 42) / 2,
    borderRadius: 14, padding: 14,
    position: 'relative', overflow: 'hidden',
  },
  summaryIconWrap: {
    width: 36, height: 36, borderRadius: 10,
    justifyContent: 'center', alignItems: 'center', marginBottom: 10,
  },
  summaryLabel: { fontSize: 11, color: MUTED, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  summaryValue: { fontSize: 22, fontWeight: '800', color: BRAND_DARK, marginTop: 4 },
  summaryUnit: { fontSize: 11, color: MUTED, marginTop: 2 },
  summaryPct: {
    position: 'absolute', top: 10, right: 10,
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8,
  },
  summaryPctText: { fontSize: 11, fontWeight: '700', color: '#fff' },

  // Section
  section: {
    backgroundColor: CARD_BG, borderRadius: 16, padding: 16,
    marginBottom: 16, borderWidth: 1, borderColor: LINE,
  },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: BRAND_DARK, marginBottom: 4 },
  sectionHint: { fontSize: 12, color: MUTED },

  // Composition
  compositionRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dotLabel: { flexDirection: 'row', alignItems: 'center', gap: 6, width: 60 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotText: { fontSize: 12, color: MUTED, fontWeight: '600' },
  ratioTrack: { flex: 1, height: 8, backgroundColor: LINE, borderRadius: 4, overflow: 'hidden' },
  ratioFill: { height: '100%', borderRadius: 4 },
  pctText: { width: 36, fontSize: 12, fontWeight: '700', color: BRAND_DARK, textAlign: 'right' },
  compositionNote: { fontSize: 11, color: MUTED, marginTop: 14, lineHeight: 16 },

  // Granularity toggle
  granToggle: { flexDirection: 'row', gap: 4, marginTop: 4 },
  granBtn: {
    paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8,
    borderWidth: 1, borderColor: LINE, backgroundColor: BG,
  },
  granBtnActive: { backgroundColor: BRAND_DARK, borderColor: BRAND_DARK },
  granBtnText: { fontSize: 11, fontWeight: '600', color: MUTED },
  granBtnTextActive: { color: '#fff' },

  // Breadcrumb
  breadcrumb: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginBottom: 12, paddingHorizontal: 4,
  },
  breadcrumbBtn: { fontSize: 13, color: BRAND_DARK, fontWeight: '600', textDecorationLine: 'underline' },
  breadcrumbSep: { fontSize: 16, color: MUTED },
  breadcrumbCurrent: { fontSize: 13, color: MUTED, fontWeight: '500' },

  // Table
  tableHeader: {
    flexDirection: 'row', paddingVertical: 8, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: LINE, marginBottom: 4,
  },
  tableHeaderCell: {
    flex: 1, fontSize: 11, fontWeight: '700',
    color: MUTED, textTransform: 'uppercase', letterSpacing: 0.3,
  },
  tableRow: {
    flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: LINE + '80',
    alignItems: 'center',
  },
  totalsRow: { backgroundColor: BG, borderRadius: 8 },
  tableCell: { flex: 1, fontSize: 13, color: BRAND_DARK },
  periodCell: { fontWeight: '500' },
  boldCell: { fontWeight: '700', color: BRAND_DARK },
  arrowCell: { width: 14, fontSize: 16, color: MUTED, textAlign: 'center' },

  // Records
  recordsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  recordCard: {
    width: (width - 52) / 3,
    backgroundColor: BG, borderRadius: 12,
    padding: 12, borderWidth: 1, borderColor: LINE,
    alignItems: 'center',
  },
  recordIconWrap: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: COMBINED_BG,
    justifyContent: 'center', alignItems: 'center', marginBottom: 8,
  },
  recordPeriod: { fontSize: 10, color: MUTED, fontWeight: '600', textTransform: 'uppercase', textAlign: 'center' },
  recordLabel: { fontSize: 10, color: BRAND_DARK, fontWeight: '500', marginTop: 4, textAlign: 'center' },
  recordValue: { fontSize: 13, fontWeight: '800', color: BRAND_DARK, marginTop: 4, textAlign: 'center' },

  // Empty
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  emptyText: { fontSize: 15, color: MUTED, marginTop: 12, fontWeight: '600' },
  emptyHint: { fontSize: 13, color: MUTED, marginTop: 6 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(46,32,24,0.45)', justifyContent: 'flex-end' },
  modalPanel: {
    backgroundColor: BG, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40,
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: LINE,
    alignSelf: 'center', marginBottom: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: BRAND_DARK, marginBottom: 20 },
  filterSectionLabel: { fontSize: 11, fontWeight: '700', color: MUTED, letterSpacing: 0.5, marginBottom: 10 },
  pillRow: { flexDirection: 'row', marginBottom: 4 },
  pill: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1, borderColor: LINE, marginRight: 8, backgroundColor: CARD_BG,
  },
  pillActive: { backgroundColor: BRAND_DARK, borderColor: BRAND_DARK },
  pillText: { fontSize: 13, color: MUTED, fontWeight: '600' },
  pillTextActive: { color: '#fff' },
  periodRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: LINE,
  },
  periodRowActive: {},
  periodRowText: { fontSize: 15, color: BRAND_DARK },
  periodRowTextActive: { fontWeight: '700' },
  applyBtn: {
    marginTop: 24, backgroundColor: BRAND_DARK,
    borderRadius: 14, paddingVertical: 16, alignItems: 'center',
  },
  applyBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
})
