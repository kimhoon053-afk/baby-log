import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { parseDate } from './growth';

// 영유아 건강검진과 국가 예방접종 일정 (질병관리청 표준 일정 기준, 만 6세까지).
// 생일을 기준으로 "언제부터 언제까지" 받으면 되는지 계산하고, 시작하는 날 아침에 알려 줘요.
// 실제 일정은 아기 상태나 백신 종류에 따라 달라질 수 있어서, 앱에서는 참고용으로 안내해요.

export type Checkup = {
  id: string;
  kind: 'vaccine' | 'checkup';
  title: string;
  detail: string;
  /** 시작: 생일로부터 몇 개월 (또는 days) */
  from: { m?: number; d?: number };
  /** 끝 */
  to: { m?: number; d?: number };
};

export const SCHEDULE: Checkup[] = [
  { id: 'hepb1', kind: 'vaccine', title: 'B형간염 1차', detail: '태어나서 바로 (보통 병원에서 맞아요)', from: { d: 0 }, to: { d: 7 } },
  { id: 'bcg', kind: 'vaccine', title: 'BCG (결핵)', detail: '생후 4주 이내', from: { d: 0 }, to: { d: 28 } },
  { id: 'hc1', kind: 'checkup', title: '영유아 건강검진 1차', detail: '생후 14~35일', from: { d: 14 }, to: { d: 35 } },
  { id: 'hepb2', kind: 'vaccine', title: 'B형간염 2차', detail: '생후 1개월', from: { m: 1 }, to: { m: 2 } },
  {
    id: 'v2m',
    kind: 'vaccine',
    title: '2개월 예방접종',
    detail: 'DTaP·소아마비·Hib·폐렴구균·로타바이러스 1차',
    from: { m: 2 },
    to: { m: 3 },
  },
  {
    id: 'v4m',
    kind: 'vaccine',
    title: '4개월 예방접종',
    detail: 'DTaP·소아마비·Hib·폐렴구균·로타바이러스 2차',
    from: { m: 4 },
    to: { m: 5 },
  },
  { id: 'hc2', kind: 'checkup', title: '영유아 건강검진 2차', detail: '생후 4~6개월', from: { m: 4 }, to: { m: 6 } },
  {
    id: 'v6m',
    kind: 'vaccine',
    title: '6개월 예방접종',
    detail: 'DTaP·소아마비·Hib·폐렴구균·B형간염 3차 (로타바이러스는 백신 종류에 따라 3차)',
    from: { m: 6 },
    to: { m: 7 },
  },
  { id: 'flu', kind: 'vaccine', title: '인플루엔자 (독감)', detail: '생후 6개월부터 매년 가을 (처음엔 4주 간격 2회)', from: { m: 6 }, to: { m: 12 } },
  { id: 'hc3', kind: 'checkup', title: '영유아 건강검진 3차', detail: '생후 9~12개월', from: { m: 9 }, to: { m: 12 } },
  {
    id: 'v12m',
    kind: 'vaccine',
    title: '12~15개월 예방접종',
    detail: 'MMR 1차·수두·Hib 4차·폐렴구균 4차',
    from: { m: 12 },
    to: { m: 15 },
  },
  {
    id: 'v12_23',
    kind: 'vaccine',
    title: 'A형간염 1차 · 일본뇌염 1·2차',
    detail: '생후 12~23개월 (일본뇌염 불활성화 백신은 1~4주 간격으로 2회)',
    from: { m: 12 },
    to: { m: 24 },
  },
  { id: 'dtap4', kind: 'vaccine', title: 'DTaP 4차', detail: '생후 15~18개월', from: { m: 15 }, to: { m: 18 } },
  { id: 'hc4', kind: 'checkup', title: '영유아 건강검진 4차 + 구강검진', detail: '생후 18~24개월', from: { m: 18 }, to: { m: 24 } },
  { id: 'hepa2', kind: 'vaccine', title: 'A형간염 2차', detail: '1차 접종 6~18개월 뒤', from: { m: 18 }, to: { m: 36 } },
  { id: 'je3', kind: 'vaccine', title: '일본뇌염 3차', detail: '2차 접종 약 1년 뒤 (생후 24~35개월)', from: { m: 24 }, to: { m: 36 } },
  { id: 'hc5', kind: 'checkup', title: '영유아 건강검진 5차', detail: '생후 30~36개월', from: { m: 30 }, to: { m: 36 } },
  { id: 'hc6', kind: 'checkup', title: '영유아 건강검진 6차 + 구강검진', detail: '생후 42~48개월', from: { m: 42 }, to: { m: 48 } },
  {
    id: 'v4y',
    kind: 'vaccine',
    title: '만 4~6세 예방접종',
    detail: 'DTaP 5차·소아마비 4차·MMR 2차',
    from: { m: 48 },
    to: { m: 84 },
  },
  { id: 'hc7', kind: 'checkup', title: '영유아 건강검진 7차 + 구강검진', detail: '생후 54~60개월', from: { m: 54 }, to: { m: 60 } },
  { id: 'hc8', kind: 'checkup', title: '영유아 건강검진 8차', detail: '생후 66~71개월', from: { m: 66 }, to: { m: 72 } },
  { id: 'je4', kind: 'vaccine', title: '일본뇌염 4차', detail: '만 6세', from: { m: 72 }, to: { m: 84 } },
];

export const SOURCE_URL = 'https://nip.kdca.go.kr';

function addTo(birth: number, p: { m?: number; d?: number }): number {
  const d = new Date(birth);
  if (p.m) d.setMonth(d.getMonth() + p.m);
  if (p.d) d.setDate(d.getDate() + p.d);
  return d.getTime();
}

export type Planned = Checkup & { start: number; end: number; done: boolean };

export function planFor(birthDate: string, done: Set<string>): Planned[] {
  const b = parseDate(birthDate);
  if (b === null) return [];
  return SCHEDULE.map((c) => ({ ...c, start: addTo(b, c.from), end: addTo(b, c.to), done: done.has(c.id) })).sort(
    (a, z) => a.start - z.start,
  );
}

const DONE_KEY = 'baby-log/checkups-done/v1';

export async function loadDone(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(DONE_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export async function saveDone(done: Set<string>): Promise<void> {
  await AsyncStorage.setItem(DONE_KEY, JSON.stringify([...done]));
}

export function shortDate(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear() % 100}.${d.getMonth() + 1}.${d.getDate()}`;
}

/** 아직 안 한 일정마다, 시작하는 날 아침 10시에 알림을 예약해요. */
export async function scheduleCheckupReminders(plan: Planned[]): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of all) {
      if (n.identifier.startsWith('checkup-')) await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
    const perm = await Notifications.getPermissionsAsync();
    if (!perm.granted) return;
    const nowT = Date.now();
    const upcoming = plan.filter((p) => !p.done && p.end > nowT).slice(0, 12);
    for (const p of upcoming) {
      const at = new Date(Math.max(p.start, nowT + 60000));
      if (p.start <= nowT) continue; // 이미 기간 안이면 앱 화면에서만 알려 줘요
      at.setHours(10, 0, 0, 0);
      await Notifications.scheduleNotificationAsync({
        identifier: `checkup-${p.id}`,
        content: {
          title: p.kind === 'vaccine' ? '💉 예방접종 시기예요' : '🩺 영유아 건강검진 시기예요',
          body: `${p.title}: 오늘부터 ${shortDate(p.end)}까지 (${p.detail})`,
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at },
      });
    }
  } catch {
    // 알림 예약이 안 돼도 화면에서는 볼 수 있어요.
  }
}
