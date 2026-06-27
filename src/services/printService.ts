import { getCachedFactorySettings } from './factorySettingsCache'
import BluetoothClassic from './bluetoothClassic'

export interface PrintConfig {
  printerAddress?: string
  paperWidth?: 58 | 80
  receiptSettings?: any
  factoryInfo?: any
  factoryName?: string
  season?: string
  clerk?: string
  receiptNo?: string | number
  netTotal?: number
  isPending?: boolean
  localUuid?: string
}

// ---------- Date/Time formatting helpers ----------
function formatDate(isoDate: string): string {
  try {
    const date = new Date(isoDate)
    if (isNaN(date.getTime())) return isoDate
    return date.toLocaleDateString([], { year: 'numeric', month: 'numeric', day: 'numeric' })
  } catch {
    return isoDate
  }
}

function formatTime(isoTime: string): string {
  // The time may be a full ISO string or just a time string
  try {
    // If it contains 'T', treat as full ISO
    if (isoTime.includes('T')) {
      const date = new Date(isoTime)
      if (!isNaN(date.getTime())) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      }
    }
    // Otherwise, try to parse as "HH:MM:SS.sss"
    const match = isoTime.match(/(\d{2}):(\d{2}):(\d{2})/)
    if (match) {
      return `${match[1]}:${match[2]}:${match[3]}`
    }
    return isoTime
  } catch {
    return isoTime
  }
}

// ---------- Shared helpers ----------

function padLine(charsPerLine: number, label: string, value: string): string {
  const combined = label + value
  if (combined.length >= charsPerLine) return combined
  const spaces = ' '.repeat(charsPerLine - combined.length)
  return label + spaces + value
}

function buildReceiptBasics(
  rc: any,
  fi: any,
  finalConfig: any,
  charsPerLine: number,
  solidLine: string,
  dottedLine: string,
  typeLabel: string,
) {
  const _cachedSettings = getCachedFactorySettings()
  const factoryName = finalConfig.factoryName || _cachedSettings?.name || 'KOFITRACK FACTORY'
  const lines: string[] = []

  // Factory info – centre aligned
  lines.push('\x1B\x61\x01')
  lines.push(factoryName.toUpperCase())
  if (rc.showFactoryAddress && fi.address) lines.push(fi.address)
  if (rc.showFactoryEmail && fi.email) lines.push(fi.email)
  if (rc.showFactoryPhone && fi.phone) lines.push(fi.phone)

  // Coffee type header
  lines.push(typeLabel)

  // Blank line after factory info group
  lines.push('')

  // Solid line
  lines.push('\x1B\x61\x00')
  lines.push(solidLine)

  return lines
}

function buildReceiptFooter(rc: any, lines: string[]) {
  // Blank line before thank you
  lines.push('')

  // Thank you – centred
  lines.push('\x1B\x61\x01')
  lines.push(rc.footer || 'Thank you!')
  lines.push('\x1B\x61\x00')

  // One line feed, then cut
  lines.push('\n')
  lines.push('\x1D\x56\x42\x00')
}

// ---------- Print a delivery receipt ----------

export async function printDeliveryReceipt(
  memberName: string,
  regNo: string,
  kgs: number,
  type: 'cherry' | 'mbuni',
  date: string,
  time: string,
  config?: PrintConfig,
): Promise<'thermal-ok' | 'ble-sent' | 'error'> {
  const weightKg = typeof kgs === 'number' ? kgs : parseFloat(String(kgs))
  if (isNaN(weightKg) || weightKg <= 0 || weightKg > 10000) {
    console.error('Print service error: weight out of allowed range', weightKg)
    throw new Error('Weight out of allowed range. Cannot print receipt.')
  }

  try {
    const finalConfig = config || { paperWidth: 58 }

    const _cs = getCachedFactorySettings()
    const rc = finalConfig.receiptSettings || _cs?.settings?.receipt || {}
    const fi = finalConfig.factoryInfo || _cs?.settings?.factoryInfo || {}
    const paperWidth = finalConfig.paperWidth || rc.paperWidth || 58
    const charsPerLine = paperWidth === 80 ? 48 : 32
    const solidLine = '-'.repeat(charsPerLine)
    const dottedLine = '.'.repeat(charsPerLine)
    const delivery = rc.delivery || {}

    // Remove [OFFLINE] from title – we'll add a separate "OFFLINE" line later
    let typeLabel = type === 'cherry' ? 'CHERRY DELIVERY RECEIPT' : 'MBUNI DELIVERY RECEIPT'

    const formattedDate = formatDate(date)
    const formattedTime = formatTime(time)

    const lines = buildReceiptBasics(rc, fi, finalConfig, charsPerLine, solidLine, dottedLine, typeLabel)

    // --- Insert "OFFLINE" line right after the header if offline ---
    if (finalConfig.isPending) {
      lines.push('OFFLINE')    // centered or plain – adjust as you like
    }

    // Member info
    if (rc.showMemberName !== false) lines.push(`Member: ${memberName}`)
    if (rc.showRegNo !== false) lines.push(`Reg No:   ${regNo}`)
    if (rc.showPhone && fi.phone) lines.push(`Phone: ${fi.phone}`)

    lines.push('')

    // Season
    if (rc.showSeason !== false && finalConfig.season) {
      lines.push(`Season: ${finalConfig.season}`)
      lines.push('')
    }

    lines.push(dottedLine)

    // Weights
    if (delivery.showWeight !== false) {
      lines.push(padLine(charsPerLine, 'Weight:   ', `${weightKg.toFixed(2)} kg`))
    }
    // Net total – keep "Unavailable offline" for offline
    if (rc.showNetTotal !== false && finalConfig.netTotal != null && !finalConfig.isPending) {
      if (typeof finalConfig.netTotal === 'number' && finalConfig.netTotal < 0) {
        console.error('Print service error: net total negative', finalConfig.netTotal)
        throw new Error('Net total cannot be negative. Contact support.')
      }
      lines.push(padLine(charsPerLine, 'Net Total:', `${finalConfig.netTotal.toFixed(2)} kg`))
    } else if (finalConfig.isPending) {
      lines.push(padLine(charsPerLine, 'Net Total:', 'Unavailable offline'))
    }

    lines.push('')
    lines.push(dottedLine)

    // Date, time – always shown
    if (rc.showDate !== false) lines.push(padLine(charsPerLine, 'Date:     ', formattedDate))
    if (rc.showTime !== false) lines.push(padLine(charsPerLine, 'Time:     ', formattedTime))

    // Receipt number – skip entirely when offline
    if (!finalConfig.isPending && rc.showReceiptNumber !== false) {
      let receiptDisplay = ''
      if (finalConfig.receiptNo) {
        receiptDisplay = String(finalConfig.receiptNo)
      } else {
        receiptDisplay = '—'
      }
      lines.push(padLine(charsPerLine, 'Receipt No:', receiptDisplay))
    }

    // Clerk – always show if available
    if (rc.showClerk !== false && finalConfig.clerk) {
      lines.push(padLine(charsPerLine, 'Served by:', finalConfig.clerk))
    }

    // Offline notice lines removed – no extra text at bottom

    // Footer
    buildReceiptFooter(rc, lines)

    const receipt = lines.join('\n')
    return await sendToPrinter(receipt, finalConfig.printerAddress)
  } catch (err: any) {
    // Only log unexpected errors — known states (BLUETOOTH_OFF, PRINTER_UNREACHABLE) are silent
    if (err?.message && !err.message.startsWith('BLUETOOTH_OFF') && !err.message.startsWith('PRINTER_UNREACHABLE')) {
      console.warn('[printService] delivery error:', err.message)
    }
    throw err
  }
}

// ---------- Print a transaction receipt (similar formatting) ----------
export async function printTransactionReceipt(
  sellerName: string,
  sellerRegNo: string,
  buyerName: string,
  buyerRegNo: string,
  kgs: number,
  type: 'cherry' | 'mbuni',
  date: string,
  time: string,
  config?: PrintConfig,
): Promise<'thermal-ok' | 'ble-sent' | 'error'> {
  const weightKg = typeof kgs === 'number' ? kgs : parseFloat(String(kgs))
  if (isNaN(weightKg) || weightKg <= 0 || weightKg > 10000) {
    throw new Error('Weight out of allowed range (0–10000 kg).')
  }

  try {
    const finalConfig = config || { paperWidth: 58 }

    const _cs = getCachedFactorySettings()
    const rc = finalConfig.receiptSettings || _cs?.settings?.receipt || {}
    const fi = finalConfig.factoryInfo || _cs?.settings?.factoryInfo || {}
    const paperWidth = finalConfig.paperWidth || rc.paperWidth || 58
    const charsPerLine = paperWidth === 80 ? 48 : 32
    const solidLine = '-'.repeat(charsPerLine)
    const dottedLine = '.'.repeat(charsPerLine)
    const transaction = rc.transaction || {}

    let typeLabel = type === 'cherry' ? 'CHERRY TRANSACTION RECEIPT' : 'MBUNI TRANSACTION RECEIPT'
    if (finalConfig.isPending) {
      typeLabel = `[OFFLINE] ${typeLabel}`
    }

    const formattedDate = formatDate(date)
    const formattedTime = formatTime(time)

    const lines = buildReceiptBasics(rc, fi, finalConfig, charsPerLine, solidLine, dottedLine, typeLabel)

    // Seller info
    if (transaction.showSeller !== false) {
      lines.push(`Seller: ${sellerName}`)
      if (rc.showRegNo !== false) lines.push(`S.Reg No: ${sellerRegNo}`)
    }

    // Buyer info
    if (transaction.showBuyer !== false) {
      lines.push(`Buyer: ${buyerName}`)
      if (rc.showRegNo !== false) lines.push(`B.Reg No: ${buyerRegNo}`)
    }

    lines.push('')

    // Season
    if (rc.showSeason !== false && finalConfig.season) {
      lines.push(`Season: ${finalConfig.season}`)
      lines.push('')
    }

    lines.push(dottedLine)

    // Only show weight, no Net Total
    if (transaction.showWeight !== false) {
      lines.push(padLine(charsPerLine, 'Weight:   ', `${weightKg.toFixed(2)} kg`))
    }

    lines.push('')
    lines.push(dottedLine)

    // Date, time, receipt number, clerk
    if (rc.showDate !== false) lines.push(padLine(charsPerLine, 'Date:     ', formattedDate))
    if (rc.showTime !== false) lines.push(padLine(charsPerLine, 'Time:     ', formattedTime))

    if (rc.showReceiptNumber !== false) {
      let receiptDisplay = ''
      if (finalConfig.isPending && finalConfig.localUuid) {
        receiptDisplay = `PENDING-${finalConfig.localUuid.substring(0, 8)}`
      } else if (finalConfig.receiptNo) {
        receiptDisplay = String(finalConfig.receiptNo)
      } else {
        receiptDisplay = '—'
      }
      lines.push(padLine(charsPerLine, 'Receipt No:', receiptDisplay))
    }

    if (rc.showClerk !== false && finalConfig.clerk) {
      lines.push(padLine(charsPerLine, 'Served by:', finalConfig.clerk))
    }

    if (finalConfig.isPending) {
      lines.push('')
      lines.push('*** This is an OFFLINE receipt ***')
      lines.push('Will be replaced after sync.')
    }

    buildReceiptFooter(rc, lines)

    const receipt = lines.join('\n')
    return await sendToPrinter(receipt, finalConfig.printerAddress)
  } catch (err: any) {
    // Only log unexpected errors — known states (BLUETOOTH_OFF, PRINTER_UNREACHABLE) are silent
    if (err?.message && !err.message.startsWith('BLUETOOTH_OFF') && !err.message.startsWith('PRINTER_UNREACHABLE')) {
      console.warn('[printService] transaction error:', err.message)
    }
    throw err
  }
}

// ---------- Print statement receipt (unchanged, but we add same date formatting if used) ----------
export async function printStatementReceipt(
  memberName: string,
  regNo: string,
  phone: string,
  coffeeType: 'cherry' | 'mbuni',
  season: string,
  entries: { date: string; type: string; kgs: number; runningTotal: number }[],
  totals: { delivered: number; bought: number; sold: number; net: number },
  periodStart?: string,
  periodEnd?: string,
  config?: PrintConfig
): Promise<'thermal-ok' | 'ble-sent' | 'error'> {
  try {
    const finalConfig = config || { paperWidth: 58 }

    const _cs = getCachedFactorySettings()
    const rc = finalConfig.receiptSettings || _cs?.settings?.receipt || {}
    const fi = finalConfig.factoryInfo || _cs?.settings?.factoryInfo || {}
    const _cachedSettings = getCachedFactorySettings()
  const factoryName = finalConfig.factoryName || _cachedSettings?.name || 'KOFITRACK FACTORY'
    const paperWidth = finalConfig.paperWidth || rc.paperWidth || 58
    const charsPerLine = paperWidth === 80 ? 48 : 32
    const solidLine = '-'.repeat(charsPerLine)
    const dottedLine = '.'.repeat(charsPerLine)

    const padLineLocal = (label: string, value: string) => {
      const combined = label + value
      if (combined.length >= charsPerLine) return combined
      const spaces = ' '.repeat(charsPerLine - combined.length)
      return label + spaces + value
    }

    const lines: string[] = []

    // Factory info – centre
    lines.push('\x1B\x61\x01')
    lines.push(factoryName.toUpperCase())
    if (rc.showFactoryAddress && fi.address) lines.push(fi.address)
    if (rc.showFactoryEmail && fi.email) lines.push(fi.email)
    if (rc.showFactoryPhone && fi.phone) lines.push(fi.phone)

    // Coffee type header
    const typeLabel = coffeeType === 'cherry' ? 'CHERRY DETAILED STATEMENT' : 'MBUNI DETAILED STATEMENT'
    lines.push(typeLabel)

    // Solid line
    lines.push('\x1B\x61\x00')
    lines.push(solidLine)

    // Member info
    if (rc.showMemberName !== false) lines.push(`NAME: ${memberName}`)
    if (rc.showRegNo !== false) lines.push(`REG ID: ${regNo}`)
    if (rc.showPhone && phone) lines.push(`PHONE: ${phone}`)

    // Season
    if (rc.showSeason !== false && season) {
      lines.push(`SEASON: ${season}`)
    }

    // Period header if filtered
    if (periodStart && periodEnd) {
      lines.push(`PERIOD: ${periodStart} - ${periodEnd}`)
    }

    // Fixed-width columns for 58mm paper
    const dateWidth = 12
    const qtyWidth = 8
    const totalWidth = charsPerLine - dateWidth - qtyWidth

    const formatRow = (date: string, qty: string, total: string) => {
      return date.padEnd(dateWidth) + qty.padStart(qtyWidth) + total.padStart(totalWidth)
    }

    // Table header
    lines.push(formatRow('DATE', 'QTY', 'TOTAL'))
    lines.push(dottedLine)

    // Entries
    for (const entry of entries) {
      const dateStr = entry.date.substring(0, 10)
      const qty = entry.kgs.toFixed(2)
      const total = entry.runningTotal.toFixed(2)
      lines.push(formatRow(dateStr, qty, total))
    }

    lines.push(solidLine)

    // Summary
    const isFiltered = periodStart && periodEnd
    if (isFiltered) {
      lines.push('PERIOD SUMMARY:')
    } else {
      lines.push('SEASON SUMMARY (Full):')
    }
    lines.push(`DELIVERED: ${totals.delivered.toFixed(2)} kgs`)
    lines.push(`BOUGHT:    ${totals.bought.toFixed(2)} kgs`)
    lines.push(`SOLD:      ${totals.sold.toFixed(2)} kgs`)
    lines.push(`NET:       ${totals.net.toFixed(2)} kgs`)

    // Footer
    const now = new Date()
    lines.push(`Print date: ${now.toLocaleDateString()}`)
    lines.push(`${now.toLocaleTimeString()}`)
    if (finalConfig.clerk) {
      lines.push(`Served by: ${finalConfig.clerk}`)
    }
    lines.push('\x1B\x61\x01')
    lines.push(rc.footer || 'Thanks for choosing us')
    lines.push('\x1B\x61\x00')
    lines.push('\n')
    lines.push('\x1D\x56\x42\x00')

    const receipt = lines.join('\n')
    return await sendToPrinter(receipt, finalConfig.printerAddress)
  } catch (err: any) {
    // Only log unexpected errors — known states (BLUETOOTH_OFF, PRINTER_UNREACHABLE) are silent
    if (err?.message && !err.message.startsWith('BLUETOOTH_OFF') && !err.message.startsWith('PRINTER_UNREACHABLE')) {
      console.warn('[printService] statement error:', err.message)
    }
    throw err
  }
}

// ---------- Shared Bluetooth printing (unchanged) ----------

// Error message prefixes that should not produce console noise.
// These are routine states the UI already handles via toasts/dots.
const SILENT_PREFIXES = ['BLUETOOTH_OFF', 'PRINTER_UNREACHABLE']

function isSilentError(msg: string): boolean {
  return SILENT_PREFIXES.some((p) => msg.startsWith(p))
}

async function sendToPrinter(receipt: string, printerAddress?: string): Promise<'thermal-ok' | 'ble-sent' | 'error'> {
  if (BluetoothClassic && printerAddress) {
    let devices: any[] = []
    try {
      devices = await BluetoothClassic.getBondedDevices()
    } catch (err: any) {
      const msg: string = err?.message || ''
      const lower = msg.toLowerCase()
      // Bluetooth adapter off — expected when user hasn't enabled BT
      if (
        lower.includes('madapter is not enabled') ||
        lower.includes('bluetooth is not enabled') ||
        lower.includes('adapter not enabled') ||
        lower.includes('bluetooth adapter')
      ) {
        throw new Error('BLUETOOTH_OFF')
      }
      // Unexpected — worth a single warn
      console.warn('[printService] getBondedDevices error:', msg)
      throw new Error('Could not list bonded devices. Please pair the printer in Bluetooth settings.')
    }

    const printer = devices.find((d: any) => d.address === printerAddress)
    if (!printer) {
      throw new Error('Printer not paired. Please pair it in Android Bluetooth settings.')
    }

    try {
      await printer.connect()
      await printer.write(receipt)
      await printer.disconnect()
      return 'thermal-ok'
    } catch (err: any) {
      // Try direct write without explicit connect (some SPP devices prefer this)
      try {
        await printer.write(receipt)
        await printer.disconnect()
        return 'thermal-ok'
      } catch (secondErr: any) {
        const msg2: string = secondErr?.message || ''
        if (
          msg2.includes('socket might closed') ||
          msg2.includes('timeout') ||
          msg2.includes('Not connected') ||
          msg2.includes('read ret: -1')
        ) {
          throw new Error('PRINTER_UNREACHABLE:' + (printer.name || printerAddress))
        }
        throw new Error('Failed to send data to printer: ' + msg2)
      }
    }
  }

  // Fallback – Thermal library
  let ThermalModule: any = null
  try {
    ThermalModule = require('react-native-thermal-receipt-printer')
  } catch (_) {}

  if (ThermalModule?.printRaw && printerAddress) {
    try {
      await ThermalModule.printRaw(receipt, printerAddress)
      return 'thermal-ok'
    } catch (err: any) {
      throw new Error('Thermal print failed: ' + (err?.message || ''))
    }
  }

  throw new Error('No compatible printing method available.')
}

export async function getPairedPrinters() {
  return []
}