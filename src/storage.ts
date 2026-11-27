import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LogEntry } from './types';

// 기록을 어디에 저장할지 정하는 곳입니다.
// 지금은 휴대폰 안(AsyncStorage)에 저장합니다.
// 가족 공유를 붙일 때는 같은 모양(LogStore)으로 클라우드 버전을 만들어 이 부분만 바꾸면 됩니다.

export interface LogStore {
  list(babyId: string): Promise<LogEntry[]>;
  save(entry: LogEntry): Promise<void>;
  remove(id: string): Promise<void>;
}

const KEY = 'baby-log/entries/v1';

async function readAll(): Promise<LogEntry[]> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as LogEntry[];
  } catch {
    return [];
  }
}

async function writeAll(entries: LogEntry[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(entries));
}

export const localStore: LogStore = {
  async list(babyId) {
    const all = await readAll();
    return all
      .filter((e) => e.babyId === babyId)
      .sort((a, b) => b.startAt.localeCompare(a.startAt));
  },
  async save(entry) {
    const all = await readAll();
    const i = all.findIndex((e) => e.id === entry.id);
    if (i >= 0) all[i] = entry;
    else all.push(entry);
    await writeAll(all);
  },
  async remove(id) {
    const all = await readAll();
    await writeAll(all.filter((e) => e.id !== id));
  },
};

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
