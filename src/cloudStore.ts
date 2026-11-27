import AsyncStorage from '@react-native-async-storage/async-storage';

import type { LogStore } from './storage';
import { supabase } from './supabase';
import type { LogEntry } from './types';

// 가족 공유 중일 때 쓰는 저장소: 클라우드(Supabase)의 logs 표에 저장합니다.
// 인터넷이 잠깐 끊겨도 마지막으로 받은 기록은 보이도록 휴대폰에 한 벌 저장해 둡니다.

type Row = {
  id: string;
  baby_id: string;
  kind: LogEntry['kind'];
  subtype: LogEntry['subtype'];
  amount_ml: number | null;
  start_at: string;
  end_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  created_by_name: string | null;
};

export function toRow(e: LogEntry): Row {
  return {
    id: e.id,
    baby_id: e.babyId,
    kind: e.kind,
    subtype: e.subtype,
    amount_ml: e.amountMl ?? null,
    start_at: e.startAt,
    end_at: e.endAt ?? null,
    created_at: e.createdAt,
    updated_at: e.updatedAt,
    created_by: e.createdBy,
    created_by_name: e.createdByName ?? null,
  };
}

function fromRow(r: Row): LogEntry {
  return {
    id: r.id,
    babyId: r.baby_id,
    kind: r.kind,
    subtype: r.subtype,
    amountMl: r.amount_ml ?? undefined,
    startAt: new Date(r.start_at).toISOString(),
    endAt: r.end_at ? new Date(r.end_at).toISOString() : undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    createdBy: r.created_by ?? '',
    createdByName: r.created_by_name ?? undefined,
  };
}

const cacheKey = (babyId: string) => `baby-log/cloud-cache/${babyId}`;

export function cloudStore(): LogStore {
  return {
    async list(babyId) {
      // 통계(최근 30일)에 필요한 만큼 넉넉히 40일치를 받아 옵니다.
      const since = new Date(Date.now() - 40 * 86400000).toISOString();
      const { data, error } = await supabase!
        .from('logs')
        .select('*')
        .eq('baby_id', babyId)
        .or(`start_at.gte."${since}",and(kind.eq.sleep,end_at.is.null)`)
        .order('start_at', { ascending: false })
        .limit(3000);
      if (error) {
        const cached = await AsyncStorage.getItem(cacheKey(babyId)).catch(() => null);
        if (cached) return JSON.parse(cached) as LogEntry[];
        throw error;
      }
      const list = (data as Row[]).map(fromRow);
      AsyncStorage.setItem(cacheKey(babyId), JSON.stringify(list)).catch(() => {});
      return list;
    },
    async save(entry) {
      const { error } = await supabase!.from('logs').upsert(toRow(entry));
      if (error) throw error;
    },
    async remove(id) {
      const { error } = await supabase!.from('logs').delete().eq('id', id);
      if (error) throw error;
    },
  };
}

/** 다른 가족이 기록을 추가·수정·삭제하면 onChange 를 불러 줍니다. 끝낼 때는 돌려준 함수를 부르세요. */
export function subscribeLogs(babyId: string, onChange: () => void): () => void {
  if (!supabase) return () => {};
  const sb = supabase;
  let stopped = false;
  let channel: ReturnType<typeof sb.channel> | null = null;
  (async () => {
    // 실시간 연결에도 로그인 정보를 먼저 넣어야 가족 기록 알림이 와요.
    await sb.auth.getSession();
    await sb.realtime.setAuth();
    if (stopped) return;
    channel = sb
      .channel(`logs-${babyId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'logs', filter: `baby_id=eq.${babyId}` },
        () => onChange(),
      )
      // 삭제 알림에는 아기 정보가 안 들어 있어서 따로 받습니다.
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'logs' }, () => onChange())
      .subscribe();
  })().catch(() => {});
  return () => {
    stopped = true;
    if (channel) sb.removeChannel(channel);
  };
}
