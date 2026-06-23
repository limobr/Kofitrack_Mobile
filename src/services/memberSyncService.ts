// src/services/memberSyncService.ts
import api from '../api/client';
import { cacheMembers, getAllMembersLocal } from '../db';

export const syncMembers = async (factoryId: string) => {
  try {
    const { data } = await api.get('/members?limit=5000');
    const members = data.members.map((m: any) => ({
      id: m.id,
      reg_no: m.reg_no,
      name: m.name,
      phone: m.phone || '',
      national_id: m.national_id || '',
      factory_id: factoryId,
    }));
    await cacheMembers(members);
    console.log(`Synced ${members.length} members to local cache`);
    return true;
  } catch (error) {
    console.error('Failed to sync members', error);
    return false;
  }
};

export const getLocalMembers = async (factoryId: string) => {
  return await getAllMembersLocal(factoryId);
};