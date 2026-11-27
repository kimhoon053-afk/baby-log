import AsyncStorage from '@react-native-async-storage/async-storage';

import { ensureSignedIn, supabase } from './supabase';
import type { LogEntry } from './types';
import { toRow } from './cloudStore';
import { removePushDevice } from './push';

// 가족 공유 정보 (이 기기가 어느 아기의 가족인지)를 기억해 둡니다.

export type Family = {
  babyId: string;
  babyName: string;
  inviteCode: string;
  myName: string;
  userId: string;
};

export type Member = { userId: string; name: string };

const KEY = 'baby-log/family/v1';

export async function loadFamily(): Promise<Family | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Family) : null;
  } catch {
    return null;
  }
}

async function saveFamily(f: Family | null) {
  if (f) await AsyncStorage.setItem(KEY, JSON.stringify(f));
  else await AsyncStorage.removeItem(KEY);
}

type BabyRow = { id: string; name: string; invite_code: string };

function friendly(e: unknown): Error {
  const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
  if (msg.includes('invite code not found')) return new Error('초대 코드를 찾을 수 없어요. 다시 확인해 주세요.');
  if (msg.toLowerCase().includes('anonymous')) {
    return new Error('클라우드 설정에서 익명 로그인(Allow anonymous sign-ins)이 꺼져 있어요.');
  }
  if (msg.toLowerCase().includes('network') || msg.toLowerCase().includes('fetch')) {
    return new Error('인터넷 연결을 확인해 주세요.');
  }
  return new Error(`문제가 생겼어요: ${msg}`);
}

/** 새 가족 만들기. 지금까지 휴대폰에 쌓인 기록도 함께 올립니다. */
export async function createFamily(babyName: string, myName: string, localEntries: LogEntry[]): Promise<Family> {
  try {
    const userId = await ensureSignedIn();
    const { data, error } = await supabase!.rpc('create_baby', { baby_name: babyName, my_name: myName });
    if (error) throw error;
    const b = data as BabyRow;
    const fam: Family = { babyId: b.id, babyName: b.name, inviteCode: b.invite_code, myName, userId };
    if (localEntries.length > 0) {
      const rows = localEntries.map((e) =>
        toRow({ ...e, babyId: b.id, createdBy: userId, createdByName: myName }),
      );
      for (let i = 0; i < rows.length; i += 500) {
        const { error: upErr } = await supabase!.from('logs').upsert(rows.slice(i, i + 500));
        if (upErr) throw upErr;
      }
    }
    await saveFamily(fam);
    return fam;
  } catch (e) {
    throw friendly(e);
  }
}

/** 초대 코드로 가족에 들어가기. */
export async function joinFamily(code: string, myName: string): Promise<Family> {
  try {
    const userId = await ensureSignedIn();
    const { data, error } = await supabase!.rpc('join_baby', { code, my_name: myName });
    if (error) throw error;
    const b = data as BabyRow;
    const fam: Family = { babyId: b.id, babyName: b.name, inviteCode: b.invite_code, myName, userId };
    await saveFamily(fam);
    return fam;
  } catch (e) {
    throw friendly(e);
  }
}

export async function listMembers(babyId: string): Promise<Member[]> {
  const { data, error } = await supabase!
    .from('members')
    .select('user_id, display_name')
    .eq('baby_id', babyId)
    .order('joined_at');
  if (error) throw friendly(error);
  return (data ?? []).map((m) => ({ userId: m.user_id as string, name: m.display_name as string }));
}

/** 이 기기만 가족 공유에서 빠집니다. 다른 가족의 기록은 그대로 남아요. */
export async function leaveFamily(f: Family): Promise<void> {
  try {
    await removePushDevice(f);
    await supabase!.from('members').delete().eq('baby_id', f.babyId).eq('user_id', f.userId);
  } catch {
    // 인터넷이 없어도 이 기기에서는 빠지게 합니다.
  }
  await saveFamily(null);
}
