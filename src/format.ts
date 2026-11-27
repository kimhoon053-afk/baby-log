import type { LogEntry } from './types';

export function timeLabel(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, '0');
  const ampm = h < 12 ? '오전' : '오후';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${ampm} ${h12}:${m}`;
}

export function durationLabel(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (totalMin === 0) return '1분 미만';
  if (h === 0) return `${m}분`;
  if (m === 0) return `${h}시간`;
  return `${h}시간 ${m}분`;
}

export function agoLabel(iso: string, now: number): string {
  const ms = now - new Date(iso).getTime();
  if (ms < 60000) return '방금 전';
  return `${durationLabel(ms)} 전`;
}

export function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function dayTitle(iso: string, now: number): string {
  const key = dayKey(iso);
  if (key === dayKey(new Date(now).toISOString())) return '오늘';
  if (key === dayKey(new Date(now - 86400000).toISOString())) return '어제';
  const d = new Date(iso);
  const w = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${w})`;
}

export function entryEmoji(e: LogEntry): string {
  switch (e.subtype) {
    case 'breast_left':
    case 'breast_right':
      return '🤱';
    case 'formula':
      return '🍼';
    case 'pee':
      return '💧';
    case 'poop':
      return '💩';
    default:
      return '😴';
  }
}

export function entryTitle(e: LogEntry, now: number): string {
  switch (e.subtype) {
    case 'breast_left':
      return '모유 · 왼쪽';
    case 'breast_right':
      return '모유 · 오른쪽';
    case 'formula':
      return `분유 · ${e.amountMl ?? 0}ml`;
    case 'pee':
      return '기저귀 · 소변';
    case 'poop':
      return '기저귀 · 대변';
    default: {
      const end = e.endAt ? new Date(e.endAt).getTime() : now;
      const dur = durationLabel(end - new Date(e.startAt).getTime());
      return e.endAt ? `수면 · ${dur}` : `자는 중 · ${sleepingFor(e.startAt, now)}`;
    }
  }
}

/** 자는 중일 때 '방금 잠들었어요' / '1시간 20분째' 처럼 보여줍니다. */
export function sleepingFor(startIso: string, now: number): string {
  const ms = now - new Date(startIso).getTime();
  if (ms < 60000) return '방금 잠들었어요';
  return `${durationLabel(ms)}째`;
}
