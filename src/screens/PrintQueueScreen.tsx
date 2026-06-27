import React, { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
  ActivityIndicator,
} from 'react-native'
import {
  getPrintJobs,
  removePrintJob,
  retryPrintJob,
  subscribeToPrintQueue,
  type PrintJob,
  type PrintJobStatus,
} from '../services/printQueue'

// ─── Tokens ───────────────────────────────────────────────────────────────────
const BRAND_DARK = '#2E2018'
const LINE       = '#E4DBCB'
const MUTED      = '#8A7C6B'
const BG         = '#FAF7F1'
const TERRACOTTA = '#C8623D'
const MOSS       = '#5B6B4D'

// ─── Helpers ──────────────────────────────────────────────────────────────────
function statusLabel(status: PrintJobStatus): string {
  switch (status) {
    case 'pending':  return 'Pending'
    case 'printing': return 'Printing'
    case 'failed':   return 'Failed'
  }
}

function statusColor(status: PrintJobStatus): string {
  switch (status) {
    case 'pending':  return '#B45309'
    case 'printing': return MOSS
    case 'failed':   return TERRACOTTA
  }
}

function statusBg(status: PrintJobStatus): string {
  switch (status) {
    case 'pending':  return '#FEF3C7'
    case 'printing': return '#EEF3EA'
    case 'failed':   return '#FBE9E2'
  }
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

// ─── Job row ──────────────────────────────────────────────────────────────────
function JobRow({ job, onRetry, onRemove }: {
  job: PrintJob
  onRetry: (id: string) => void
  onRemove: (id: string) => void
}) {
  return (
    <View style={row.container}>
      <View style={row.top}>
        <Text style={row.label} numberOfLines={1}>{job.label}</Text>
        <View style={[row.pill, { backgroundColor: statusBg(job.status) }]}>
          <Text style={[row.pillText, { color: statusColor(job.status) }]}>
            {statusLabel(job.status)}
          </Text>
        </View>
      </View>

      <Text style={row.time}>{formatTime(job.createdAt)}</Text>

      {job.lastError ? (
        <Text style={row.error} numberOfLines={2}>{job.lastError}</Text>
      ) : null}

      <View style={row.actions}>
        {job.status === 'failed' && (
          <TouchableOpacity
            style={[row.btn, row.btnRetry]}
            onPress={() => onRetry(job.id)}
            activeOpacity={0.75}
          >
            <Text style={[row.btnText, { color: MOSS }]}>Retry</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[row.btn, row.btnRemove]}
          onPress={() => onRemove(job.id)}
          activeOpacity={0.75}
        >
          <Text style={[row.btnText, { color: TERRACOTTA }]}>Remove</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const row = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: LINE,
    padding: 14,
    marginBottom: 10,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  label: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: BRAND_DARK,
    marginRight: 10,
  },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 20,
  },
  pillText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  time: {
    fontSize: 12,
    color: MUTED,
    marginBottom: 6,
  },
  error: {
    fontSize: 12,
    color: TERRACOTTA,
    marginBottom: 8,
    lineHeight: 17,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  btn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  btnRetry: {
    borderColor: MOSS,
    backgroundColor: '#EEF3EA',
  },
  btnRemove: {
    borderColor: TERRACOTTA,
    backgroundColor: '#FBE9E2',
  },
  btnText: {
    fontSize: 13,
    fontWeight: '600',
  },
})

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function PrintQueueScreen() {
  const [jobs, setJobs] = useState<PrintJob[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const all = await getPrintJobs()
    setJobs(all)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    const unsub = subscribeToPrintQueue(load)
    return unsub
  }, [load])

  const handleRetry = useCallback((id: string) => {
    retryPrintJob(id).then(load)
  }, [load])

  const handleRemove = useCallback((id: string) => {
    Alert.alert('Remove job', 'Remove this print job from the queue?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => removePrintJob(id).then(load),
      },
    ])
  }, [load])

  if (loading) {
    return (
      <View style={screen.centered}>
        <ActivityIndicator color={BRAND_DARK} />
      </View>
    )
  }

  return (
    <FlatList
      style={screen.container}
      contentContainerStyle={screen.content}
      data={jobs}
      keyExtractor={(j) => j.id}
      renderItem={({ item }) => (
        <JobRow job={item} onRetry={handleRetry} onRemove={handleRemove} />
      )}
      ListEmptyComponent={
        <View style={screen.empty}>
          {/* Printer icon drawn as a rectangle + tray */}
          <View style={screen.printerIcon}>
            <View style={screen.printerBody} />
            <View style={screen.printerTray} />
          </View>
          <Text style={screen.emptyTitle}>Queue is empty</Text>
          <Text style={screen.emptyBody}>
            Print jobs appear here while they are being sent to the printer.
          </Text>
        </View>
      }
    />
  )
}

const screen = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  content: { padding: 18, paddingBottom: 48 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: BG },

  empty: {
    alignItems: 'center',
    paddingVertical: 64,
    paddingHorizontal: 32,
  },
  printerIcon: {
    alignItems: 'center',
    marginBottom: 20,
  },
  printerBody: {
    width: 52,
    height: 34,
    borderRadius: 8,
    backgroundColor: LINE,
  },
  printerTray: {
    width: 36,
    height: 14,
    borderRadius: 3,
    backgroundColor: '#E4DBCB',
    marginTop: -4,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: BRAND_DARK,
    marginBottom: 8,
  },
  emptyBody: {
    fontSize: 14,
    color: MUTED,
    textAlign: 'center',
    lineHeight: 20,
  },
})
