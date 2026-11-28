import { durationLabel, timeLabel } from './format';
import { average, computeDay, startOfDay } from './stats';
import type { LogEntry } from './types';

// 카톡 등으로 보낼 '오늘 요약' 글을 만들어요.
export function todaySummaryText(entries: LogEntry[], now: number, babyName: string): string {
  const d = computeDay(entries, startOfDay(now), now);
  const date = new Date(now);
  const gap = average(d.feedGapsMin);
  const lastFeed = entries.find((e) => e.kind === 'feed');
  const sleeping = entries.find((e) => e.kind === 'sleep' && !e.endAt);
  const lines = [
    `[꼬물노트] ${babyName} ${date.getMonth() + 1}월 ${date.getDate()}일 요약 (${timeLabel(date.toISOString())} 기준)`,
    '',
    `🍼 수유 ${d.feedCount}회 (모유 ${d.breastCount} · 분유 ${d.formulaCount}${d.formulaMl ? `, 분유 ${d.formulaMl}ml` : ''})`,
  ];
  if (gap !== null) lines.push(`⏱ 평균 수유 간격 ${durationLabel(gap * 60000)}`);
  if (lastFeed) lines.push(`🕐 마지막 수유 ${timeLabel(lastFeed.startAt)}`);
  lines.push(`🧷 기저귀 ${d.peeCount + d.poopCount}회 (소변 ${d.peeCount} · 대변 ${d.poopCount})`);
  lines.push(`😴 수면 ${durationLabel(d.sleepMs)}${sleeping ? ' (지금 자는 중)' : ''}`);
  return lines.join('\n');
}
