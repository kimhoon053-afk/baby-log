import type { LogEntry } from './types';

// 통계 계산만 하는 곳입니다. (화면 그리기는 StatsScreen)

const SAME_FEED_MS = 20 * 60000;

export type DayStats = {
  start: number;
  end: number;
  feedCount: number;
  breastCount: number;
  formulaCount: number;
  formulaMl: number;
  peeCount: number;
  poopCount: number;
  sleepMs: number;
  /** 이 날 수유 사이 간격들 (분) */
  feedGapsMin: number[];
};

export function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function addDays(t: number, n: number): number {
  const d = new Date(t);
  d.setDate(d.getDate() + n);
  return d.getTime();
}

export function computeDay(entries: LogEntry[], dayStart: number, now: number): DayStats {
  const end = addDays(dayStart, 1);
  const s: DayStats = {
    start: dayStart,
    end,
    feedCount: 0,
    breastCount: 0,
    formulaCount: 0,
    formulaMl: 0,
    peeCount: 0,
    poopCount: 0,
    sleepMs: 0,
    feedGapsMin: [],
  };
  const feeds: { t: number; formula: boolean }[] = [];
  for (const e of entries) {
    const t = new Date(e.startAt).getTime();
    if (e.kind === 'sleep') {
      // 자정을 넘긴 잠은 날짜별로 나눠서 셉니다.
      const sEnd = e.endAt ? new Date(e.endAt).getTime() : now;
      const overlap = Math.min(sEnd, end) - Math.max(t, dayStart);
      if (overlap > 0) s.sleepMs += overlap;
      continue;
    }
    if (e.kind === 'feed') feeds.push({ t, formula: e.subtype === 'formula' });
    if (t < dayStart || t >= end) continue;
    if (e.kind === 'feed') {
      if (e.subtype === 'formula') s.formulaMl += e.amountMl ?? 0;
    } else if (e.kind === 'diaper') {
      if (e.subtype === 'pee') s.peeCount++;
      else s.poopCount++;
    }
  }
  feeds.sort((a, b) => a.t - b.t);
  // 모유 양쪽을 연달아 먹이는 것처럼 20분 안에 이어진 기록은 수유 한 번으로 셉니다.
  // 한 번의 수유 안에 분유가 있으면 '분유', 아니면 '모유'로 셉니다.
  const sessions: { t: number; formula: boolean }[] = [];
  for (let i = 0; i < feeds.length; i++) {
    const f = feeds[i];
    if (i > 0 && f.t - feeds[i - 1].t < SAME_FEED_MS) {
      sessions[sessions.length - 1].formula ||= f.formula;
    } else sessions.push({ ...f });
  }
  for (let i = 0; i < sessions.length; i++) {
    const { t, formula } = sessions[i];
    if (t < dayStart || t >= end) continue;
    s.feedCount++;
    if (formula) s.formulaCount++;
    else s.breastCount++;
    if (i > 0) s.feedGapsMin.push((t - sessions[i - 1].t) / 60000);
  }
  return s;
}

export function average(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/** 최근 n일(오늘 포함)의 날짜별 통계. 오래된 날 → 오늘 순서. */
export function computeRange(entries: LogEntry[], days: number, now: number): DayStats[] {
  const today = startOfDay(now);
  const out: DayStats[] = [];
  for (let i = days - 1; i >= 0; i--) out.push(computeDay(entries, addDays(today, -i), now));
  return out;
}

/**
 * 평균에 넣을 날들: 첫 기록이 있는 날부터 어제까지 (앱 쓰기 전 빈 날과, 아직 안 끝난 오늘은 빼기).
 * 어제까지 기록이 하나도 없으면 오늘만이라도 씁니다.
 */
export function activeDays(range: DayStats[], entries: LogEntry[], now: number): DayStats[] {
  if (entries.length === 0) return [];
  const first = Math.min(...entries.map((e) => new Date(e.startAt).getTime()));
  const firstDay = startOfDay(first);
  const today = startOfDay(now);
  const done = range.filter((d) => d.start >= firstDay && d.start < today);
  return done.length > 0 ? done : range.filter((d) => d.start === today);
}

export type WeekStats = {
  /** 이 주 첫날 0시 */
  start: number;
  /** 평균에 들어간 날 수 (0이면 기록 없는 주) */
  days: number;
  feedCount: number | null;
  gapMin: number | null;
  formulaMl: number | null;
  diaper: number | null;
  sleepHours: number | null;
  /** 하루 중 가장 길게 잔 잠 (시간) */
  longestSleepHours: number | null;
};

/**
 * 최근 n주를 7일씩 묶은 주별 하루 평균. 오래된 주 → 이번 주 순서.
 * 앱을 쓰기 전 날과 아직 안 끝난 오늘은 평균에서 빼요.
 */
export function computeWeeks(entries: LogEntry[], weeks: number, now: number): WeekStats[] {
  const range = computeRange(entries, weeks * 7, now);
  const today = startOfDay(now);
  const first = entries.length ? startOfDay(Math.min(...entries.map((e) => new Date(e.startAt).getTime()))) : today;
  const longest = longestSleepByDay(entries, now);
  const out: WeekStats[] = [];
  for (let w = 0; w < weeks; w++) {
    const chunk = range.slice(w * 7, w * 7 + 7);
    let use = chunk.filter((d) => d.start >= first && d.start < today);
    if (use.length === 0 && w === weeks - 1) use = chunk.filter((d) => d.start === today && d.start >= first);
    const avg = (f: (d: DayStats) => number) => (use.length ? average(use.map(f)) : null);
    const ls = use.map((d) => longest.get(d.start) ?? 0);
    out.push({
      start: chunk[0].start,
      days: use.length,
      feedCount: avg((d) => d.feedCount),
      gapMin: use.length ? average(use.flatMap((d) => d.feedGapsMin)) : null,
      formulaMl: avg((d) => d.formulaMl),
      diaper: avg((d) => d.peeCount + d.poopCount),
      sleepHours: avg((d) => d.sleepMs / 3600000),
      longestSleepHours: ls.length ? average(ls)! / 3600000 : null,
    });
  }
  return out;
}

/** 날짜(그날 0시) → 그날 시작한 잠 중 가장 긴 잠 (ms) */
export function longestSleepByDay(entries: LogEntry[], now: number): Map<number, number> {
  const m = new Map<number, number>();
  for (const e of entries) {
    if (e.kind !== 'sleep') continue;
    const s = new Date(e.startAt).getTime();
    const len = (e.endAt ? new Date(e.endAt).getTime() : now) - s;
    const k = startOfDay(s);
    m.set(k, Math.max(m.get(k) ?? 0, len));
  }
  return m;
}
