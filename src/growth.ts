import AsyncStorage from '@react-native-async-storage/async-storage';

import { newId } from './storage';
import { WHO, WHO_STEP_DAYS, type Lms } from './whoData';

// 성장 기록 (키·몸무게·머리둘레)과 아기 정보(생일·성별)를 휴대폰에 저장하고,
// WHO 성장 표준과 비교해 "또래 100명 중 몇 번째"(백분위)를 계산합니다.

export type Sex = 'male' | 'female';
export type Measure = 'weight' | 'length' | 'head';

export type BabyProfile = { birthDate: string; sex: Sex };

export type GrowthEntry = {
  id: string;
  /** 잰 날 (YYYY-MM-DD) */
  date: string;
  weightKg?: number;
  lengthCm?: number;
  headCm?: number;
};

const PROFILE_KEY = 'baby-log/baby-profile/v1';
const GROWTH_KEY = 'baby-log/growth/v1';

export async function loadProfile(): Promise<BabyProfile | null> {
  try {
    const raw = await AsyncStorage.getItem(PROFILE_KEY);
    return raw ? (JSON.parse(raw) as BabyProfile) : null;
  } catch {
    return null;
  }
}

export async function saveProfile(p: BabyProfile): Promise<void> {
  await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(p));
}

export async function loadGrowth(): Promise<GrowthEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(GROWTH_KEY);
    const list = raw ? (JSON.parse(raw) as GrowthEntry[]) : [];
    return list.sort((a, b) => a.date.localeCompare(b.date));
  } catch {
    return [];
  }
}

async function writeGrowth(list: GrowthEntry[]) {
  await AsyncStorage.setItem(GROWTH_KEY, JSON.stringify(list));
}

export async function addGrowth(e: Omit<GrowthEntry, 'id'>): Promise<GrowthEntry[]> {
  const list = await loadGrowth();
  // 같은 날 다시 재면 그날 기록을 덮어씁니다.
  const rest = list.filter((x) => x.date !== e.date);
  const next = [...rest, { ...e, id: newId() }].sort((a, b) => a.date.localeCompare(b.date));
  await writeGrowth(next);
  return next;
}

export async function removeGrowth(id: string): Promise<GrowthEntry[]> {
  const next = (await loadGrowth()).filter((x) => x.id !== id);
  await writeGrowth(next);
  return next;
}

export function valueOf(e: GrowthEntry, m: Measure): number | undefined {
  return m === 'weight' ? e.weightKg : m === 'length' ? e.lengthCm : e.headCm;
}

/** 'YYYY-MM-DD' → 그날 0시 (휴대폰 시간대) */
export function parseDate(s: string): number | null {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (d.getMonth() !== Number(m[2]) - 1) return null;
  return d.getTime();
}

export function toDateString(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function ageDays(birthDate: string, date: string): number | null {
  const b = parseDate(birthDate);
  const t = parseDate(date);
  if (b === null || t === null) return null;
  return Math.round((t - b) / 86400000);
}

/** '3개월 12일' 처럼 */
export function ageLabel(days: number): string {
  if (days < 0) return '태어나기 전';
  const months = Math.floor(days / 30.4375);
  const rest = Math.round(days - months * 30.4375);
  if (months === 0) return `생후 ${days}일`;
  return rest > 0 ? `${months}개월 ${rest}일` : `${months}개월`;
}

/** 표에 있는 범위 (0 ~ 약 3년) */
export function maxTableDays(): number {
  return (WHO.weight.male.length - 1) * WHO_STEP_DAYS;
}

/** 아기 나이(일)에서의 L, M, S. 7일 간격 표 사이는 직선으로 이어서 씁니다. */
export function lmsAt(measure: Measure, sex: Sex, days: number): Lms | null {
  const table = WHO[measure][sex];
  if (days < 0 || days > maxTableDays()) return null;
  const x = days / WHO_STEP_DAYS;
  const i = Math.min(Math.floor(x), table.length - 2);
  const f = x - i;
  const a = table[i];
  const b = table[i + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

function zScore(x: number, [l, m, s]: Lms): number {
  return Math.abs(l) < 1e-9 ? Math.log(x / m) / s : (Math.pow(x / m, l) - 1) / (l * s);
}

/** z 점수가 z 일 때의 값 (예: 상위 3% 선) */
export function valueAtZ(z: number, [l, m, s]: Lms): number {
  return Math.abs(l) < 1e-9 ? m * Math.exp(s * z) : m * Math.pow(1 + l * s * z, 1 / l);
}

/** 표준정규분포 누적확률 (0~100) */
function normalCdf(z: number): number {
  // Abramowitz-Stegun 7.1.26
  const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-(z * z) / 2);
  return (z >= 0 ? (1 + y) / 2 : (1 - y) / 2) * 100;
}

/** 백분위 (0~100). 예: 60 이면 또래 100명 중 작은 쪽부터 60번째. */
export function percentile(measure: Measure, sex: Sex, days: number, value: number): number | null {
  const lms = lmsAt(measure, sex, days);
  if (!lms || !(value > 0)) return null;
  return normalCdf(zScore(value, lms));
}

/** '상위 40%' 처럼 엄마 아빠가 바로 알아듣는 말로 */
export function percentileLabel(p: number): string {
  if (p >= 97) return '또래보다 많이 큰 편 (상위 3% 안)';
  if (p <= 3) return '또래보다 많이 작은 편 (하위 3% 안)';
  const top = Math.max(1, Math.round(100 - p));
  return `또래 100명 중 큰 쪽에서 ${top}번째`;
}

export const MEASURES: { key: Measure; label: string; unit: string }[] = [
  { key: 'weight', label: '몸무게', unit: 'kg' },
  { key: 'length', label: '키', unit: 'cm' },
  { key: 'head', label: '머리둘레', unit: 'cm' },
];

/** 성장 곡선에 그릴 선들: 3·15·50·85·97 백분위 */
export const CURVE_Z: { z: number; label: string }[] = [
  { z: -1.881, label: '3' },
  { z: -1.036, label: '15' },
  { z: 0, label: '50' },
  { z: 1.036, label: '85' },
  { z: 1.881, label: '97' },
];
