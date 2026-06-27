/**
 * printQueue.ts
 *
 * A lightweight, AsyncStorage-backed print queue.
 *
 * Jobs are persisted so they survive app restarts.
 * The worker picks one job at a time, retries on failure,
 * and never blocks the calling code (fire-and-forget enqueue).
 *
 * Usage:
 *   import { enqueuePrintJob } from '../services/printQueue'
 *   enqueuePrintJob({ type: 'delivery', ... })   // non-blocking
 */

import AsyncStorage from '@react-native-async-storage/async-storage'
import eventEmitter from './eventEmitter'
import {
  printDeliveryReceipt,
  printTransactionReceipt,
  printStatementReceipt,
  PrintConfig,
} from './printService'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PrintJobType = 'delivery' | 'transaction' | 'statement'
export type PrintJobStatus = 'pending' | 'printing' | 'failed'

export interface DeliveryPrintPayload {
  memberName: string
  regNo: string
  kgs: number
  coffeeType: 'cherry' | 'mbuni'
  date: string
  time: string
  config?: PrintConfig
}

export interface TransactionPrintPayload {
  sellerName: string
  sellerRegNo: string
  buyerName: string
  buyerRegNo: string
  kgs: number
  coffeeType: 'cherry' | 'mbuni'
  date: string
  time: string
  config?: PrintConfig
}

export interface StatementPrintPayload {
  memberName: string
  regNo: string
  phone: string
  coffeeType: 'cherry' | 'mbuni'
  season: string
  entries: { date: string; type: string; kgs: number; runningTotal: number }[]
  totals: { delivered: number; bought: number; sold: number; net: number }
  periodStart?: string
  periodEnd?: string
  config?: PrintConfig
}

export type PrintPayload =
  | ({ type: 'delivery' } & DeliveryPrintPayload)
  | ({ type: 'transaction' } & TransactionPrintPayload)
  | ({ type: 'statement' } & StatementPrintPayload)

export interface PrintJob {
  id: string
  createdAt: string
  status: PrintJobStatus
  retryCount: number
  lastError?: string
  label: string     // human-readable summary, e.g. "Delivery – John Doe"
  payload: PrintPayload
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const QUEUE_KEY = 'printQueue:jobs'
const MAX_RETRIES = 999          // keep retrying indefinitely until user removes
const RETRY_DELAY_MS = 5_000    // 5 s between retries
const PRINT_EVENT = 'printQueue:changed'

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

async function readJobs(): Promise<PrintJob[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

async function writeJobs(jobs: PrintJob[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(jobs))
  eventEmitter.emit(PRINT_EVENT)
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Add a new print job to the queue and kick off the worker. */
export async function enqueuePrintJob(payload: PrintPayload): Promise<string> {
  const id = `pj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  const label = buildLabel(payload)
  const job: PrintJob = {
    id,
    createdAt: new Date().toISOString(),
    status: 'pending',
    retryCount: 0,
    label,
    payload,
  }
  const jobs = await readJobs()
  jobs.push(job)
  await writeJobs(jobs)
  // Kick the worker (non-blocking)
  runWorker()
  return id
}

/** Remove a specific job (user-initiated). */
export async function removePrintJob(id: string): Promise<void> {
  const jobs = await readJobs()
  await writeJobs(jobs.filter((j) => j.id !== id))
}

/** Retry a failed job immediately. */
export async function retryPrintJob(id: string): Promise<void> {
  const jobs = await readJobs()
  const job = jobs.find((j) => j.id === id)
  if (!job) return
  job.status = 'pending'
  job.retryCount = 0
  job.lastError = undefined
  await writeJobs(jobs)
  runWorker()
}

/** Get all jobs (for the modal). */
export async function getPrintJobs(): Promise<PrintJob[]> {
  return readJobs()
}

/** Subscribe to queue changes. Returns an unsubscribe function. */
export function subscribeToPrintQueue(cb: () => void): () => void {
  eventEmitter.on(PRINT_EVENT, cb)
  return () => eventEmitter.off(PRINT_EVENT, cb)
}

/** Pending count (badge). */
export async function getPendingCount(): Promise<number> {
  const jobs = await readJobs()
  return jobs.filter((j) => j.status === 'pending' || j.status === 'printing').length
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

let _workerRunning = false

async function runWorker(): Promise<void> {
  if (_workerRunning) return
  _workerRunning = true

  try {
    while (true) {
      const jobs = await readJobs()
      const next = jobs.find((j) => j.status === 'pending')
      if (!next) break

      // Mark as printing
      next.status = 'printing'
      await writeJobs(await patchJob(next))

      try {
        await dispatchJob(next)
        // Success – remove from queue
        const current = await readJobs()
        await writeJobs(current.filter((j) => j.id !== next.id))
      } catch (err: any) {
        next.retryCount += 1
        next.lastError = err?.message || String(err)
        next.status = next.retryCount >= MAX_RETRIES ? 'failed' : 'pending'
        await writeJobs(await patchJob(next))

        if (next.status === 'pending') {
          // Wait before retrying
          await sleep(RETRY_DELAY_MS)
        }
      }
    }
  } finally {
    _workerRunning = false
  }
}

async function patchJob(updated: PrintJob): Promise<PrintJob[]> {
  const jobs = await readJobs()
  return jobs.map((j) => (j.id === updated.id ? updated : j))
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ---------------------------------------------------------------------------
// Dispatch to printService
// ---------------------------------------------------------------------------

async function dispatchJob(job: PrintJob): Promise<void> {
  const p = job.payload

  let result: 'thermal-ok' | 'ble-sent' | 'error'

  if (p.type === 'delivery') {
    result = await printDeliveryReceipt(
      p.memberName,
      p.regNo,
      p.kgs,
      p.coffeeType,
      p.date,
      p.time,
      p.config,
    )
  } else if (p.type === 'transaction') {
    result = await printTransactionReceipt(
      p.sellerName,
      p.sellerRegNo,
      p.buyerName,
      p.buyerRegNo,
      p.kgs,
      p.coffeeType,
      p.date,
      p.time,
      p.config,
    )
  } else {
    result = await printStatementReceipt(
      p.memberName,
      p.regNo,
      p.phone,
      p.coffeeType,
      p.season,
      p.entries,
      p.totals,
      p.periodStart,
      p.periodEnd,
      p.config,
    )
  }

  if (result === 'error') {
    throw new Error('Print service returned error')
  }
}

// ---------------------------------------------------------------------------
// Label builder
// ---------------------------------------------------------------------------

function buildLabel(payload: PrintPayload): string {
  switch (payload.type) {
    case 'delivery':
      return `Delivery – ${payload.memberName}`
    case 'transaction':
      return `Transaction – ${payload.sellerName} → ${payload.buyerName}`
    case 'statement':
      return `Statement – ${payload.memberName}`
  }
}