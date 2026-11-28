import AsyncStorage from '@react-native-async-storage/async-storage';

import { ACTION_BREAST, ACTION_FORMULA } from './reminders';
import { newId } from './storage';
import type { StoreContext } from './store';
import type { LogEntry } from './types';

// 수유 알림의 "모유 먹였어요 / 분유 먹였어요" 버튼을 누르면 앱이 열리면서 바로 기록해요.
// 모유는 지난번과 반대쪽, 분유는 지난번과 같은 양으로 적어요. (틀리면 기록 화면에서 고치면 돼요)

const HANDLED_KEY = 'baby-log/handled-actions/v1';

export function isFeedAction(actionId: string): boolean {
  return actionId === ACTION_BREAST || actionId === ACTION_FORMULA;
}

/** 같은 알림 버튼을 두 번 처리하지 않도록 기억해요. 처음이면 true. */
async function markHandled(key: string): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(HANDLED_KEY);
    const list: string[] = raw ? JSON.parse(raw) : [];
    if (list.includes(key)) return false;
    await AsyncStorage.setItem(HANDLED_KEY, JSON.stringify([...list, key].slice(-30)));
    return true;
  } catch {
    return true;
  }
}

/** 기록했으면 화면에 보여 줄 문구, 아니면 null */
export async function recordFromNotification(
  actionId: string,
  key: string,
  ctx: StoreContext,
  at: number,
): Promise<string | null> {
  if (!isFeedAction(actionId)) return null;
  if (!(await markHandled(key))) return null;
  const entries = await ctx.store.list(ctx.babyId).catch(() => [] as LogEntry[]);
  const t = new Date(at).toISOString();
  const base = {
    id: newId(),
    babyId: ctx.babyId,
    kind: 'feed' as const,
    startAt: t,
    createdAt: t,
    updatedAt: t,
    createdBy: ctx.me,
    createdByName: ctx.myName,
  };
  let entry: LogEntry;
  let label: string;
  if (actionId === ACTION_FORMULA) {
    const ml = entries.find((e) => e.subtype === 'formula')?.amountMl ?? 120;
    entry = { ...base, subtype: 'formula', amountMl: ml };
    label = `분유 ${ml}ml`;
  } else {
    const lastBreast = entries.find((e) => e.subtype === 'breast_left' || e.subtype === 'breast_right');
    const side = lastBreast?.subtype === 'breast_left' ? 'breast_right' : 'breast_left';
    entry = { ...base, subtype: side };
    label = side === 'breast_left' ? '모유 왼쪽' : '모유 오른쪽';
  }
  await ctx.store.save(entry);
  return `알림에서 ${label} 기록했어요`;
}
