/**
 * PrintQueueModal.tsx
 *
 * Modal that shows the current print queue (pending, printing, failed jobs).
 * Opened from the Header print button.
 */

import React, { useEffect, useState, useCallback } from 'react'
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Pressable,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import {
  PrintJob,
  getPrintJobs,
  removePrintJob,
  retryPrintJob,
  subscribeToPrintQueue,
} from '../services/printQueue'

interface Props {
  visible: boolean
  onClose: () => void
}

export default function PrintQueueModal({ visible, onClose }: Props) {
  const [jobs, setJobs] = useState<PrintJob[]>([])
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    const all = await getPrintJobs()
    setJobs(all)
  }, [])

  useEffect(() => {
    if (visible) {
      refresh()
    }
  }, [visible, refresh])

  useEffect(() => {
    // Subscribe to queue changes so the list stays live
    const unsub = subscribeToPrintQueue(() => {
      refresh()
    })
    return unsub
  }, [refresh])

  const handleRemove = async (id: string) => {
    await removePrintJob(id)
  }

  const handleRetry = async (id: string) => {
    setLoading(true)
    try {
      await retryPrintJob(id)
    } finally {
      setLoading(false)
    }
  }

  const pendingCount = jobs.filter((j) => j.status === 'pending' || j.status === 'printing').length
  const failedCount  = jobs.filter((j) => j.status === 'failed').length

  const renderJob = ({ item }: { item: PrintJob }) => {
    const isPrinting = item.status === 'printing'
    const isFailed   = item.status === 'failed'

    return (
      <View style={[styles.jobRow, isFailed && styles.jobRowFailed]}>
        {/* Status indicator */}
        <View style={styles.jobIcon}>
          {isPrinting ? (
            <ActivityIndicator size="small" color="#8c6239" />
          ) : isFailed ? (
            <Ionicons name="alert-circle-outline" size={18} color="#dc2626" />
          ) : (
            <Ionicons name="time-outline" size={18} color="#8c6239" />
          )}
        </View>

        {/* Info */}
        <View style={styles.jobInfo}>
          <Text style={styles.jobLabel} numberOfLines={1}>{item.label}</Text>
          <Text style={styles.jobMeta}>
            {isPrinting
              ? 'Printing…'
              : isFailed
              ? `Failed · ${item.retryCount} attempt${item.retryCount !== 1 ? 's' : ''}`
              : `Queued · attempt ${item.retryCount + 1}`}
          </Text>
          {isFailed && item.lastError ? (
            <Text style={styles.jobError} numberOfLines={2}>{item.lastError}</Text>
          ) : null}
        </View>

        {/* Actions */}
        <View style={styles.jobActions}>
          {isFailed && (
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => handleRetry(item.id)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="refresh-outline" size={18} color="#8c6239" />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => handleRemove(item.id)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="trash-outline" size={18} color="#dc2626" />
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Prevent tap-through on the sheet */}
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          {/* Header row */}
          <View style={styles.sheetHeader}>
            <View style={styles.sheetTitleRow}>
              <Ionicons name="print-outline" size={20} color="#3d2b1f" />
              <Text style={styles.sheetTitle}>Print Queue</Text>
              {jobs.length > 0 && (
                <View style={[styles.countBadge, failedCount > 0 && styles.countBadgeFailed]}>
                  <Text style={styles.countBadgeText}>{jobs.length}</Text>
                </View>
              )}
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close-outline" size={22} color="#3d2b1f" />
            </TouchableOpacity>
          </View>

          {/* Summary pills */}
          {jobs.length > 0 && (
            <View style={styles.summaryRow}>
              {pendingCount > 0 && (
                <View style={styles.pill}>
                  <Ionicons name="time-outline" size={12} color="#8c6239" />
                  <Text style={styles.pillText}>{pendingCount} queued</Text>
                </View>
              )}
              {failedCount > 0 && (
                <View style={[styles.pill, styles.pillFailed]}>
                  <Ionicons name="alert-circle-outline" size={12} color="#dc2626" />
                  <Text style={[styles.pillText, styles.pillTextFailed]}>{failedCount} failed</Text>
                </View>
              )}
            </View>
          )}

          {/* Divider */}
          <View style={styles.divider} />

          {/* Job list or empty state */}
          {jobs.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="checkmark-circle-outline" size={40} color="#b5a89a" />
              <Text style={styles.emptyTitle}>Queue is empty</Text>
              <Text style={styles.emptyBody}>
                Print jobs added during deliveries, transactions, or statements will appear here.
              </Text>
            </View>
          ) : (
            <FlatList
              data={jobs}
              keyExtractor={(item) => item.id}
              renderItem={renderJob}
              style={styles.list}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            />
          )}

          {/* Footer note */}
          <View style={styles.footer}>
            <Ionicons name="information-circle-outline" size={13} color="#b5a89a" />
            <Text style={styles.footerText}>
              Jobs retry automatically. Remove a job to cancel it permanently.
            </Text>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    paddingTop: 70,        // sit just below the header
    paddingHorizontal: 12,
  },
  sheet: {
    backgroundColor: '#faf9f6',
    borderRadius: 14,
    width: 320,
    maxHeight: 480,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 10,
    overflow: 'hidden',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  sheetTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#3d2b1f',
  },
  countBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#8c6239',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
  },
  countBadgeFailed: {
    backgroundColor: '#dc2626',
  },
  countBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#f0ece6',
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  pillFailed: {
    backgroundColor: '#fef2f2',
  },
  pillText: {
    fontSize: 11,
    color: '#8c6239',
    fontWeight: '600',
  },
  pillTextFailed: {
    color: '#dc2626',
  },
  divider: {
    height: 1,
    backgroundColor: '#e8e0d6',
    marginHorizontal: 16,
  },
  list: {
    flexShrink: 1,
  },
  listContent: {
    paddingVertical: 6,
  },
  jobRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0ece6',
  },
  jobRowFailed: {
    backgroundColor: '#fef7f7',
  },
  jobIcon: {
    width: 24,
    alignItems: 'center',
    paddingTop: 2,
  },
  jobInfo: {
    flex: 1,
    gap: 2,
  },
  jobLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3d2b1f',
  },
  jobMeta: {
    fontSize: 11,
    color: '#8c6239',
  },
  jobError: {
    fontSize: 10,
    color: '#dc2626',
    marginTop: 2,
    lineHeight: 14,
  },
  jobActions: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    paddingTop: 2,
  },
  actionBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#f0ece6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 30,
    paddingHorizontal: 24,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#3d2b1f',
  },
  emptyBody: {
    fontSize: 12,
    color: '#8c7b72',
    textAlign: 'center',
    lineHeight: 18,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#e8e0d6',
    backgroundColor: '#f5f1ec',
  },
  footerText: {
    flex: 1,
    fontSize: 10,
    color: '#b5a89a',
    lineHeight: 14,
  },
})
