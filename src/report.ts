import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { durationLabel } from './format';
import {
  ageDays,
  ageLabel,
  loadGrowth,
  loadProfile,
  MEASURES,
  percentile,
  toDateString,
  valueOf,
  type BabyProfile,
  type GrowthEntry,
} from './growth';
import { activeDays, average, computeRange, longestSleepByDay, startOfDay, type DayStats } from './stats';
import type { LogEntry } from './types';

// 소아과 진료 때 보여 줄 리포트 (최근 14일 요약 + 성장 기록)를 PDF로 만들어 공유합니다.

const DAYS = 14;
const W = ['일', '월', '화', '수', '목', '금', '토'];

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
}

const n1 = (v: number | null) => (v === null ? '-' : v.toFixed(1).replace(/\.0$/, ''));
const gap = (m: number | null) => (m === null ? '-' : durationLabel(m * 60000));

export function buildReportHtml(
  entries: LogEntry[],
  now: number,
  babyName: string,
  profile: BabyProfile | null,
  growth: GrowthEntry[],
): string {
  const range = computeRange(entries, DAYS, now);
  const active = activeDays(range, entries, now);
  const longest = longestSleepByDay(entries, now);
  const avg = (f: (d: DayStats) => number) => average(active.map(f));
  const today = toDateString(now);
  const age = profile ? ageDays(profile.birthDate, today) : null;

  const summary = [
    ['하루 수유', `${n1(avg((d) => d.feedCount))}회`],
    ['평균 수유 간격', gap(average(active.flatMap((d) => d.feedGapsMin)))],
    ['하루 분유', `${Math.round(avg((d) => d.formulaMl) ?? 0)}ml`],
    ['하루 소변 / 대변', `${n1(avg((d) => d.peeCount))} / ${n1(avg((d) => d.poopCount))}회`],
    ['하루 수면', durationLabel((avg((d) => d.sleepMs) ?? 0))],
    [
      '가장 길게 잔 잠 (평균)',
      durationLabel(average(active.map((d) => longest.get(d.start) ?? 0)) ?? 0),
    ],
  ];

  const rows = [...range]
    .reverse()
    .filter((d) => active.includes(d) || d.start === startOfDay(now))
    .map((d) => {
      const dt = new Date(d.start);
      return `<tr><td>${dt.getMonth() + 1}/${dt.getDate()} (${W[dt.getDay()]})</td><td>${d.feedCount}</td><td>${
        d.formulaMl || '-'
      }</td><td>${gap(average(d.feedGapsMin))}</td><td>${d.peeCount}</td><td>${d.poopCount}</td><td>${durationLabel(
        d.sleepMs,
      )}</td></tr>`;
    })
    .join('');

  const recentGrowth = growth.slice(-5).reverse();
  const growthRows = recentGrowth
    .map((g) => {
      const days = profile ? ageDays(profile.birthDate, g.date) : null;
      const cells = MEASURES.map((m) => {
        const v = valueOf(g, m.key);
        if (v === undefined) return '<td>-</td>';
        const p = profile && days !== null ? percentile(m.key, profile.sex, days, v) : null;
        return `<td>${v}${m.unit}${p === null ? '' : ` <span class="p">(${Math.round(p)}백분위)</span>`}</td>`;
      }).join('');
      return `<tr><td>${g.date}${days !== null ? `<br><span class="p">${ageLabel(days)}</span>` : ''}</td>${cells}</tr>`;
    })
    .join('');

  return `<!doctype html><html><head><meta charset="utf-8">
<style>
  body { font-family: -apple-system, 'Noto Sans KR', sans-serif; color: #2B2A33; padding: 28px; font-size: 13px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .sub { color: #7A7787; margin-bottom: 18px; }
  h2 { font-size: 15px; margin: 22px 0 8px; color: #E8763A; }
  .grid { display: flex; flex-wrap: wrap; gap: 8px; }
  .tile { border: 1px solid #EFE8E1; border-radius: 10px; padding: 10px 12px; width: 30%; }
  .tile b { display: block; font-size: 17px; margin-top: 2px; }
  .tile span { color: #7A7787; font-size: 11px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border-bottom: 1px solid #EFE8E1; padding: 6px 4px; text-align: center; }
  th { background: #FFF3EC; font-size: 12px; }
  .p { color: #7A7787; font-size: 11px; }
  .foot { color: #7A7787; font-size: 10px; margin-top: 24px; }
</style></head><body>
<h1>${esc(babyName)} 성장·생활 리포트</h1>
<div class="sub">${today} 작성${
    age !== null ? ` · ${ageLabel(age)} · ${profile!.sex === 'male' ? '남아' : '여아'}` : ''
  } · 최근 ${active.length}일 기준</div>

<h2>하루 평균</h2>
<div class="grid">${summary.map(([k, v]) => `<div class="tile"><span>${k}</span><b>${v}</b></div>`).join('')}</div>

<h2>날짜별 기록</h2>
<table><tr><th>날짜</th><th>수유(회)</th><th>분유(ml)</th><th>수유 간격</th><th>소변</th><th>대변</th><th>수면</th></tr>${rows}</table>

<h2>성장 기록</h2>
${
  growthRows
    ? `<table><tr><th>잰 날</th><th>몸무게</th><th>키</th><th>머리둘레</th></tr>${growthRows}</table>`
    : '<div class="p">아직 입력한 성장 기록이 없어요.</div>'
}

<div class="foot">꼬물노트 앱으로 만든 리포트예요. 백분위는 WHO 아동 성장 표준(한국 영유아 성장도표 만 3세 미만 기준과 같음)으로 계산했고, 진단이 아닌 참고용이에요.</div>
</body></html>`;
}

export async function shareReport(entries: LogEntry[], now: number, babyName: string): Promise<void> {
  const [profile, growth] = await Promise.all([loadProfile(), loadGrowth()]);
  const html = buildReportHtml(entries, now, babyName, profile, growth);
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: '소아과 리포트 보내기', UTI: 'com.adobe.pdf' });
  } else {
    await Print.printAsync({ html });
  }
}
