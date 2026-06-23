// src/db.ts
import * as SQLite from 'expo-sqlite';
import AsyncStorage from '@react-native-async-storage/async-storage';

const db = SQLite.openDatabaseSync('kofitrack.db');

export type SyncStatus = 'pending' | 'syncing' | 'verifying' | 'synced' | 'failed';

// ---------- Helper: generate strong unique ID (no crypto dependency) ----------
function generateStrongId(): string {
  const now = typeof performance !== 'undefined' && performance.now
    ? performance.now()
    : Date.now();
  const timestamp = now.toString(36);
  const randomPart = Math.random().toString(36).substring(2, 15);
  const extra = Array(8).fill(0).map(() => Math.floor(36 * Math.random()).toString(36)).join('');
  return `${timestamp}-${randomPart}-${extra}`;
}

async function getDeviceUniqueId(): Promise<string> {
  const key = '@device_unique_id';
  let deviceId = await AsyncStorage.getItem(key);
  if (!deviceId) {
    deviceId = generateStrongId();
    await AsyncStorage.setItem(key, deviceId);
  }
  return deviceId;
}

export async function generateLocalUuid(): Promise<string> {
  const deviceId = await getDeviceUniqueId();
  const uniquePart = generateStrongId();
  return `${deviceId}-${uniquePart}`;
}

// ---------- Database initialization ----------
export const initDatabase = async () => {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    
    CREATE TABLE IF NOT EXISTS pending_deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      local_uuid TEXT UNIQUE,
      client_uuid TEXT UNIQUE,
      coffee_type TEXT NOT NULL,
      member_id TEXT NOT NULL,
      member_name TEXT,
      kgs REAL NOT NULL,
      recorded_at TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      retry_count INTEGER DEFAULT 0,
      next_retry_at TEXT,
      last_attempt_at TEXT,
      server_response TEXT,
      receipt_no TEXT,
      sync_error TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_status ON pending_deliveries(status);
    CREATE INDEX IF NOT EXISTS idx_next_retry ON pending_deliveries(next_retry_at);
    
    CREATE TABLE IF NOT EXISTS sync_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      local_uuid TEXT,
      client_uuid TEXT,
      attempt_no INTEGER,
      operation TEXT,
      status TEXT,
      server_response TEXT,
      error_message TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    
    CREATE TABLE IF NOT EXISTS cached_members (
      id TEXT PRIMARY KEY,
      reg_no TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT,
      national_id TEXT,
      factory_id TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_members_reg_no ON cached_members(reg_no);
    CREATE INDEX IF NOT EXISTS idx_members_name ON cached_members(name);
  `);
};

// ========== SYNC AUDIT LOG ==========
export const addSyncLog = async (log: {
  local_uuid?: string;
  client_uuid?: string;
  attempt_no?: number;
  operation: string;
  status: string;
  server_response?: string;
  error_message?: string;
}) => {
  await db.runAsync(
    `INSERT INTO sync_logs (local_uuid, client_uuid, attempt_no, operation, status, server_response, error_message)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [log.local_uuid || null, log.client_uuid || null, log.attempt_no || null, log.operation, log.status, log.server_response || null, log.error_message || null]
  );
};

export interface SyncLog {
  id: number;
  local_uuid: string | null;
  client_uuid: string | null;
  attempt_no: number | null;
  operation: string;
  status: string;
  server_response: string | null;
  error_message: string | null;
  created_at: string;
}

export const getAllSyncLogs = async (): Promise<SyncLog[]> => {
  return await db.getAllAsync<SyncLog>('SELECT * FROM sync_logs ORDER BY created_at DESC');
};

export const clearSyncLogs = async (): Promise<void> => {
  await db.runAsync('DELETE FROM sync_logs');
};

// ========== DELIVERIES (pending) ==========
export const savePendingDelivery = async (delivery: {
  coffee_type: 'cherry' | 'mbuni';
  member_id: string;
  member_name: string;
  kgs: number;
}) => {
  try {
    const local_uuid = await generateLocalUuid();
    const recorded_at = new Date().toISOString();
    await db.runAsync(
      `INSERT INTO pending_deliveries (local_uuid, client_uuid, coffee_type, member_id, member_name, kgs, recorded_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [local_uuid, local_uuid, delivery.coffee_type, delivery.member_id, delivery.member_name, delivery.kgs, recorded_at]
    );
    await addSyncLog({ local_uuid, client_uuid: local_uuid, operation: 'insert', status: 'pending' });
    return local_uuid;
  } catch (error) {
    console.error('savePendingDelivery error:', error);
    throw error;
  }
};

export const getDeliveriesToSync = async () => {
  const now = new Date().toISOString();
  return await db.getAllAsync<{
    id: number;
    local_uuid: string;
    client_uuid: string;
    coffee_type: string;
    member_id: string;
    member_name: string;
    kgs: number;
    recorded_at: string;
    status: SyncStatus;
    retry_count: number;
    next_retry_at: string | null;
    last_attempt_at: string | null;
    receipt_no: string | null;
    sync_error: string | null;
  }>(`SELECT * FROM pending_deliveries 
     WHERE status IN ('pending', 'failed') 
        OR (status = 'syncing' AND next_retry_at IS NOT NULL AND next_retry_at <= ?)
     ORDER BY retry_count ASC, recorded_at ASC`, [now]);
};

export const updateDeliveryState = async (local_uuid: string, updates: Partial<{
  status: SyncStatus;
  retry_count: number;
  next_retry_at: string | null;
  last_attempt_at: string;
  server_response: string;
  receipt_no: string;
  sync_error: string;
}>) => {
  const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  const values = Object.values(updates);
  values.push(local_uuid);
  await db.runAsync(`UPDATE pending_deliveries SET ${fields} WHERE local_uuid = ?`, values);
};

export const markDeliverySynced = async (local_uuid: string, receiptNo: string) => {
  await updateDeliveryState(local_uuid, { status: 'synced', receipt_no: receiptNo });
  await addSyncLog({ local_uuid, operation: 'mark_synced', status: 'synced', server_response: receiptNo });
};

export const deletePendingDelivery = async (local_uuid: string) => {
  await db.runAsync(`DELETE FROM pending_deliveries WHERE local_uuid = ?`, [local_uuid]);
};

export const getAllLocalDeliveries = async () => {
  return await db.getAllAsync<{
    id: number;
    local_uuid: string;
    client_uuid: string;
    coffee_type: string;
    member_id: string;
    member_name: string;
    kgs: number;
    recorded_at: string;
    status: SyncStatus;
    retry_count: number;
    sync_error: string | null;
    receipt_no: string | null;
  }>('SELECT * FROM pending_deliveries ORDER BY recorded_at DESC');
};

export const getUnsyncedCount = async () => {
  const result = await db.getFirstAsync<{ count: number }>(`SELECT COUNT(*) as count FROM pending_deliveries WHERE status NOT IN ('synced')`);
  return result?.count || 0;
};

// ========== MEMBERS CACHE ==========
export const cacheMembers = async (members: Array<{
  id: string;
  reg_no: string;
  name: string;
  phone?: string;
  national_id?: string;
  factory_id: string;
}>) => {
  for (const member of members) {
    await db.runAsync(
      `INSERT OR REPLACE INTO cached_members (id, reg_no, name, phone, national_id, factory_id, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [member.id, member.reg_no, member.name, member.phone || '', member.national_id || '', member.factory_id, new Date().toISOString()]
    );
  }
};

export const searchMemberLocal = async (regNo: string, factoryId: string) => {
  const result = await db.getFirstAsync<{
    id: string;
    reg_no: string;
    name: string;
    phone: string;
    national_id: string;
  }>(`SELECT id, reg_no, name, phone, national_id FROM cached_members 
     WHERE reg_no = ? AND factory_id = ?`, [regNo, factoryId]);
  return result || null;
};

export const getAllMembersLocal = async (factoryId: string) => {
  return await db.getAllAsync<any>(`SELECT * FROM cached_members WHERE factory_id = ? ORDER BY name`, [factoryId]);
};

export const clearMembersCache = async () => {
  await db.runAsync(`DELETE FROM cached_members`);
};

export const getPendingDeliveryByUuid = async (local_uuid: string) => {
  return await db.getFirstAsync<{
    id: number;
    local_uuid: string;
    client_uuid: string;
    coffee_type: string;
    member_id: string;
    member_name: string;
    kgs: number;
    recorded_at: string;
    status: SyncStatus;
    receipt_no: string | null;
    sync_error: string | null;
  }>(`SELECT * FROM pending_deliveries WHERE local_uuid = ?`, [local_uuid]);
};