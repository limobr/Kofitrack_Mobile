import { Alert } from 'react-native'

let BluetoothClassic: any = null
try {
  const mod = require('react-native-bluetooth-classic')
  BluetoothClassic = mod.default || mod
} catch (e) {
  console.warn('react-native-bluetooth-classic not available')
}

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
  const factoryName = finalConfig.factoryName || 'KOFITRACK FACTORY'
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
   

  // Solid line
  lines.push('\x1B\x61\x00')
  lines.push(solidLine)

  return lines
}

function buildReceiptFooter(rc: any, lines: string[]) {
  // Blank line before thank you
   

  // Thank you – centred
  lines.push('\x1B\x61\x01')
  lines.push(rc.footer || 'Thank you!')
  lines.push('\x1B\x61\x00')

  // One line feed, then cut
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
  // ---------- Safety net ----------
  const weightKg = typeof kgs === 'number' ? kgs : parseFloat(String(kgs))
  if (isNaN(weightKg) || weightKg <= 0 || weightKg > 10000) {
    Alert.alert('Invalid Data', 'Weight out of allowed range. Cannot print receipt.')
    return 'error'
  }

  try {
    const finalConfig = config || { paperWidth: 58 }
    console.log('=== PRINT DELIVERY RECEIPT START ===')
    console.log('Printer address:', finalConfig.printerAddress)

    const rc = finalConfig.receiptSettings || {}
    const fi = finalConfig.factoryInfo || {}
    const paperWidth = finalConfig.paperWidth || rc.paperWidth || 58
    const charsPerLine = paperWidth === 80 ? 48 : 32
    const solidLine = '-'.repeat(charsPerLine)
    const dottedLine = '.'.repeat(charsPerLine)
    const delivery = rc.delivery || {}

    const typeLabel = type === 'cherry' ? 'CHERRY DELIVERY RECEIPT' : 'MBUNI DELIVERY RECEIPT'

    // Start with common header
    const lines = buildReceiptBasics(rc, fi, finalConfig, charsPerLine, solidLine, dottedLine, typeLabel)

    // Member info
    if (rc.showMemberName !== false) lines.push(`Member: ${memberName}`)
    if (rc.showRegNo !== false) lines.push(`Reg No:  ${regNo}`)
    if (rc.showPhone && fi.phone) lines.push(`Phone: ${fi.phone}`)

    // Blank line after member info
     

    // Season
    if (rc.showSeason !== false && finalConfig.season) {
      lines.push(`Season: ${finalConfig.season}`)
        // blank after season if shown
    }

    // Dotted line
    lines.push(dottedLine)

    // Weights
    if (delivery.showWeight !== false) {
      lines.push(padLine(charsPerLine, 'Weight:  ', `${weightKg.toFixed(2)} kg`))
    }
    if (rc.showNetTotal !== false && finalConfig.netTotal != null) {
      if (typeof finalConfig.netTotal === 'number' && finalConfig.netTotal < 0) {
        Alert.alert('Invalid Data', 'Net total cannot be negative. Contact support.')
        return 'error'
      }
      lines.push(padLine(charsPerLine, 'Net Total: ', `${finalConfig.netTotal.toFixed(2)} kg`))
    }

    // Blank line after weights
     

    // Dotted line
    lines.push(dottedLine)

    // Date, time, receipt number, clerk
    if (rc.showDate !== false) lines.push(padLine(charsPerLine, 'Date:    ', date))
    if (rc.showTime !== false) lines.push(padLine(charsPerLine, 'Time:    ', time))
    if (rc.showReceiptNumber !== false && finalConfig.receiptNo) {
      lines.push(padLine(charsPerLine, 'Receipt No: ', String(finalConfig.receiptNo)))
    }
    if (rc.showClerk !== false && finalConfig.clerk) {
      lines.push(padLine(charsPerLine, 'Served by: ', finalConfig.clerk))
    }

    // Footer
    buildReceiptFooter(rc, lines)

    const receipt = lines.join('\n')
    return await sendToPrinter(receipt, finalConfig.printerAddress)
  } catch (err: any) {
    console.error('Print service error:', err)
    Alert.alert('Print Error', err.message)
    return 'error'
  }
}

// ---------- Print a transaction receipt ----------

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
  // ---------- Safety net ----------
  const weightKg = typeof kgs === 'number' ? kgs : parseFloat(String(kgs))
  if (isNaN(weightKg) || weightKg <= 0 || weightKg > 10000) {
    Alert.alert('Invalid Data', 'Weight out of allowed range. Cannot print receipt.')
    return 'error'
  }

  try {
    const finalConfig = config || { paperWidth: 58 }
    console.log('=== PRINT TRANSACTION RECEIPT START ===')
    console.log('Printer address:', finalConfig.printerAddress)

    const rc = finalConfig.receiptSettings || {}
    const fi = finalConfig.factoryInfo || {}
    const paperWidth = finalConfig.paperWidth || rc.paperWidth || 58
    const charsPerLine = paperWidth === 80 ? 48 : 32
    const solidLine = '-'.repeat(charsPerLine)
    const dottedLine = '.'.repeat(charsPerLine)
    const transaction = rc.transaction || {}

    const typeLabel = type === 'cherry' ? 'CHERRY TRANSACTION RECEIPT' : 'MBUNI TRANSACTION RECEIPT'

    // Start with common header
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

    // Blank line after seller/buyer info
     

    // Season
    if (rc.showSeason !== false && finalConfig.season) {
      lines.push(`Season: ${finalConfig.season}`)
        // blank after season if shown
    }

    // Dotted line
    lines.push(dottedLine)

    // Weight & Net Total
    if (transaction.showWeight !== false) {
      lines.push(padLine(charsPerLine, 'Weight:  ', `${weightKg.toFixed(2)} kg`))
    }
    if (rc.showNetTotal !== false && finalConfig.netTotal != null) {
      if (typeof finalConfig.netTotal === 'number' && finalConfig.netTotal < 0) {
        Alert.alert('Invalid Data', 'Net total cannot be negative. Contact support.')
        return 'error'
      }
      lines.push(padLine(charsPerLine, 'Net Total: ', `${finalConfig.netTotal.toFixed(2)} kg`))
    }

    // Blank line after weights
     

    // Dotted line
    lines.push(dottedLine)

    // Date, time, receipt number, clerk
    if (rc.showDate !== false) lines.push(padLine(charsPerLine, 'Date:    ', date))
    if (rc.showTime !== false) lines.push(padLine(charsPerLine, 'Time:    ', time))
    if (rc.showReceiptNumber !== false && finalConfig.receiptNo) {
      lines.push(padLine(charsPerLine, 'Receipt No: ', String(finalConfig.receiptNo)))
    }
    if (rc.showClerk !== false && finalConfig.clerk) {
      lines.push(padLine(charsPerLine, 'Served by: ', finalConfig.clerk))
    }

    // Footer
    buildReceiptFooter(rc, lines)

    const receipt = lines.join('\n')
    return await sendToPrinter(receipt, finalConfig.printerAddress)
  } catch (err: any) {
    console.error('Print service error:', err)
    Alert.alert('Print Error', err.message)
    return 'error'
  }
}

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
    console.log('=== PRINT STATEMENT RECEIPT START ===')

    const rc = finalConfig.receiptSettings || {}
    const fi = finalConfig.factoryInfo || {}
    const factoryName = finalConfig.factoryName || 'KOFITRACK FACTORY'
    const paperWidth = finalConfig.paperWidth || rc.paperWidth || 58
    const charsPerLine = paperWidth === 80 ? 48 : 32
    const solidLine = '-'.repeat(charsPerLine)
    const dottedLine = '.'.repeat(charsPerLine)

    const padLine = (label: string, value: string) => {
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

    const formatRow = (
      date: string,
      qty: string,
      total: string
    ) => {
      return (
        date.padEnd(dateWidth) +
        qty.padStart(qtyWidth) +
        total.padStart(totalWidth)
      )
    }

    // Table header
    lines.push(formatRow('DATE', 'QTY', 'TOTAL'))
    lines.push(dottedLine)

    // Entries
    for (const entry of entries) {
      const dateStr = entry.date.substring(0, 10) // avoid long dates
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
    console.error('Print statement error:', err)
    Alert.alert('Print Error', err.message)
    return 'error'
  }
}

// ---------- Shared Bluetooth printing ----------

async function sendToPrinter(receipt: string, printerAddress?: string): Promise<'thermal-ok' | 'ble-sent' | 'error'> {
  // Classic Bluetooth SPP
  if (BluetoothClassic && printerAddress) {
    console.log('Trying Classic Bluetooth SPP...')
    let devices: any[] = []
    try {
      devices = await BluetoothClassic.getBondedDevices()
      console.log('Bonded devices found:', devices.length)
    } catch (err: any) {
      console.warn('getBondedDevices failed:', err.message)
    }

    const printer = devices.find((d: any) => d.address === printerAddress)
    if (!printer) {
      Alert.alert('Printer Not Paired', 'Please pair the printer in Android Bluetooth settings first.')
      return 'error'
    }

    console.log('Found printer:', printer.name, printer.type)

    try {
      console.log('Connecting...')
      await printer.connect()
      console.log('Connected. Writing...')
      await printer.write(receipt)
      await printer.disconnect()
      console.log('Print success via printer.write()')
      Alert.alert('Print Success', 'Receipt printed successfully via Classic Bluetooth')
      return 'thermal-ok'
    } catch (err: any) {
      console.warn('Explicit connect/write failed:', err.message)
      try {
        console.log('Trying direct write without connect...')
        await printer.write(receipt)
        await printer.disconnect()
        console.log('Print success via direct write')
        Alert.alert('Print Success', 'Receipt printed via Classic Bluetooth')
        return 'thermal-ok'
      } catch (secondErr: any) {
        console.error('All write attempts failed:', secondErr.message)
        Alert.alert('Print Error', 'Failed to send data to printer: ' + secondErr.message)
        return 'error'
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
      Alert.alert('Print Success', 'Receipt printed via thermal library')
      return 'thermal-ok'
    } catch (err: any) {
      console.warn('Thermal library printRaw failed:', err.message)
    }
  }

  Alert.alert('Printing Unavailable', 'No classic Bluetooth SPP library available.')
  return 'error'
}

export async function getPairedPrinters() {
  return []
}