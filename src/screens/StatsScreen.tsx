import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Pressable, StyleSheet, Text, View } from 'react-native';

import LineChart from '../components/LineChart';
import { Locked } from '../components/Paywall';
import PatternClock from '../components/PatternClock';
import { durationLabel } from '../format';
import { usePremium } from '../premium';
import { shareReport } from '../report';
import { activeDays, average, computeDay, computeRange, computeWeeks, startOfDay, type DayStats } from '../stats';
import { C } from '../theme';
import type { LogEntry } from '../types';

type Period = 'today' | 'week' | 'month' | 'trend' | 'pattern';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export default function StatsScreen({
  entries,
  now,
  babyName,
}: {
  entries: LogEntry[];
  now: number;
  babyName: string;
}) {
  const [period, setPeriod] = useState<Period>('today');
  const { isPremium, openPaywall } = usePremium();
  const [making, setMaking] = useState(false);

  const onReport = async () => {
    if (!isPremium) {
      openPaywall('소아과용 리포트');
      return;
    }
    if (entries.length === 0) {
      Alert.alert('아직 기록이 없어요', '기록이 쌓이면 리포트를 만들 수 있어요.');
      return;
    }
    setMaking(true);
    try {
      await shareReport(entries, now, babyName);
    } catch {
      Alert.alert('리포트를 만들지 못했어요', '잠시 후 다시 해 주세요.');
    } finally {
      setMaking(false);
    }
  };

  const tabs: [Period, string, boolean][] = [
    ['today', '오늘', false],
    ['week', '7일', false],
    ['month', '30일', true],
    ['trend', '추세', true],
    ['pattern', '패턴', true],
  ];

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>통계</Text>
        <Pressable onPress={onReport} style={styles.reportBtn} disabled={making}>
          {making ? (
            <ActivityIndicator color={C.feedDeep} />
          ) : (
            <Text style={styles.reportText}>📄 소아과 리포트{isPremium ? '' : ' ⭐'}</Text>
          )}
        </Pressable>
      </View>
      <View style={styles.segment}>
        {tabs.map(([key, label, paid]) => (
          <Pressable
            key={key}
            onPress={() => setPeriod(key)}
            style={[styles.segBtn, period === key && styles.segBtnOn]}
          >
            <Text style={[styles.segText, period === key && styles.segTextOn]}>
              {label}
              {paid && !isPremium ? <Text style={styles.star}>⭐</Text> : null}
            </Text>
          </Pressable>
        ))}
      </View>

      {entries.length === 0 ? (
        <Text style={styles.empty}>기록이 쌓이면 여기에서 통계를 볼 수 있어요.</Text>
      ) : period === 'today' ? (
        <TodayView entries={entries} now={now} />
      ) : period === 'week' ? (
        <RangeView entries={entries} now={now} days={7} />
      ) : !isPremium ? (
        <Locked
          title={period === 'month' ? '최근 30일 통계' : period === 'trend' ? '추세 그래프' : '하루 패턴 시계'}
          desc={
            period === 'month'
              ? '한 달 동안의 하루 평균과 날짜별 그래프를 볼 수 있어요.'
              : period === 'trend'
                ? '수유 간격, 수면 시간, 분유 양이 주마다 어떻게 변했는지 꺾은선으로 보여줘요.'
                : '24시간 시계에 최근 7일의 잠·수유·기저귀를 겹쳐서 아기 생활 리듬을 한눈에 보여줘요.'
          }
          reason={period === 'month' ? '30일 통계' : period === 'trend' ? '추세 그래프' : '하루 패턴 시계'}
        />
      ) : period === 'month' ? (
        <RangeView entries={entries} now={now} days={30} />
      ) : period === 'trend' ? (
        <TrendView entries={entries} now={now} />
      ) : (
        <PatternView entries={entries} now={now} />
      )}
    </ScrollView>
  );
}

function weekLabel(t: number): string {
  const d = new Date(t);
  return `${d.getMonth() + 1}/${d.getDate()}주`;
}

function TrendView({ entries, now }: { entries: LogEntry[]; now: number }) {
  const weeks = useMemo(() => {
    const all = computeWeeks(entries, 12, now);
    // 기록이 3일 이상 있는 주부터 보여 줘요. (앱을 쓰기 시작한 주는 며칠뿐이라 평균이 들쭉날쭉해요)
    const firstIdx = all.findIndex((w, i) => w.days >= 3 || (i === all.length - 1 && w.days > 0));
    return firstIdx < 0 ? [] : all.slice(firstIdx);
  }, [entries, now]);

  if (weeks.length < 2) {
    return (
      <Text style={styles.empty}>
        추세는 2주 이상 기록이 쌓이면 보여요.{'\n'}지금은 {weeks.length}주째 기록 중이에요.
      </Text>
    );
  }
  const labels = weeks.map((w) => weekLabel(w.start));
  const hrs = (v: number) => durationLabel(v * 3600000);
  const n1 = (v: number) => v.toFixed(1).replace(/\.0$/, '');

  return (
    <View>
      <Text style={styles.note}>주별 하루 평균 · 최근 {weeks.length}주</Text>
      <LineChart
        title="평균 수유 간격"
        values={weeks.map((w) => (w.gapMin === null ? null : w.gapMin / 60))}
        labels={labels}
        color={C.feedDeep}
        format={hrs}
      />
      <LineChart
        title="하루 수유 횟수"
        values={weeks.map((w) => w.feedCount)}
        labels={labels}
        color={C.feedDeep}
        format={(v) => `${n1(v)}회`}
      />
      <LineChart
        title="하루 분유 양"
        values={weeks.map((w) => w.formulaMl)}
        labels={labels}
        color={C.feedDeep}
        format={(v) => `${Math.round(v)}ml`}
      />
      <LineChart
        title="하루 수면 시간"
        values={weeks.map((w) => w.sleepHours)}
        labels={labels}
        color={C.sleepDeep}
        format={hrs}
      />
      <LineChart
        title="가장 길게 잔 잠"
        values={weeks.map((w) => w.longestSleepHours)}
        labels={labels}
        color={C.sleepDeep}
        format={hrs}
      />
      <LineChart
        title="하루 기저귀"
        values={weeks.map((w) => w.diaper)}
        labels={labels}
        color={C.diaperDeep}
        format={(v) => `${n1(v)}회`}
      />
    </View>
  );
}

function PatternView({ entries, now }: { entries: LogEntry[]; now: number }) {
  return (
    <View>
      <Text style={styles.note}>같은 시간대에 색이 모여 있으면 그 시간이 아기의 규칙적인 리듬이에요.</Text>
      <PatternClock entries={entries} now={now} days={7} />
    </View>
  );
}

function gapText(mins: number | null): string {
  return mins === null ? '-' : durationLabel(mins * 60000);
}

function TodayView({ entries, now }: { entries: LogEntry[]; now: number }) {
  const d = useMemo(() => computeDay(entries, startOfDay(now), now), [entries, now]);
  const gap = average(d.feedGapsMin);

  return (
    <View>
      <View style={styles.tiles}>
        <Tile
          label="수유"
          value={`${d.feedCount}회`}
          sub={`모유 ${d.breastCount} · 분유 ${d.formulaCount}`}
          color={C.feedDeep}
          bg={C.feed}
        />
        <Tile label="분유 총량" value={`${d.formulaMl}ml`} color={C.feedDeep} bg={C.feed} />
        <Tile label="평균 수유 간격" value={gapText(gap)} color={C.feedDeep} bg={C.feed} />
        <Tile
          label="기저귀"
          value={`${d.peeCount + d.poopCount}회`}
          sub={`소변 ${d.peeCount} · 대변 ${d.poopCount}`}
          color={C.diaperDeep}
          bg={C.diaper}
        />
        <Tile label="수면" value={durationLabel(d.sleepMs)} color={C.sleepDeep} bg={C.sleep} wide />
      </View>

      <Text style={styles.section}>오늘 하루 흐름</Text>
      <DayTimeline entries={entries} dayStart={d.start} now={now} />
    </View>
  );
}

/** 0시~24시 한 줄에 수유·기저귀는 점, 잠은 막대로 보여 줍니다. */
function DayTimeline({ entries, dayStart, now }: { entries: LogEntry[]; dayStart: number; now: number }) {
  const span = 24 * 3600000;
  const pos = (t: number) => `${Math.min(100, Math.max(0, ((t - dayStart) / span) * 100))}%` as const;
  const dayEnd = dayStart + span;
  const inDay = entries.filter((e) => {
    const t = new Date(e.startAt).getTime();
    const end = e.endAt ? new Date(e.endAt).getTime() : e.kind === 'sleep' ? now : t;
    return end >= dayStart && t < dayEnd;
  });

  const lane = (kind: LogEntry['kind'], color: string, label: string) => (
    <View style={styles.lane}>
      <Text style={styles.laneLabel}>{label}</Text>
      <View style={styles.laneTrack}>
        {inDay
          .filter((e) => e.kind === kind)
          .map((e) => {
            const t = new Date(e.startAt).getTime();
            if (kind === 'sleep') {
              const end = e.endAt ? new Date(e.endAt).getTime() : now;
              const left = Math.max(t, dayStart);
              const w = ((Math.min(end, dayEnd) - left) / span) * 100;
              return (
                <View
                  key={e.id}
                  style={[styles.block, { left: pos(left), width: `${Math.max(w, 0.8)}%`, backgroundColor: color }]}
                />
              );
            }
            return <View key={e.id} style={[styles.dot, { left: pos(t), backgroundColor: color }]} />;
          })}
        {now < dayEnd && <View style={[styles.nowLine, { left: pos(now) }]} />}
      </View>
    </View>
  );

  return (
    <View style={styles.card}>
      {lane('feed', C.feedDeep, '수유')}
      {lane('diaper', C.diaperDeep, '기저귀')}
      {lane('sleep', C.sleepDeep, '수면')}
      <View style={styles.hours}>
        {['0시', '6시', '12시', '18시', '24시'].map((h) => (
          <Text key={h} style={styles.hourText}>
            {h}
          </Text>
        ))}
      </View>
    </View>
  );
}

function RangeView({ entries, now, days }: { entries: LogEntry[]; now: number; days: number }) {
  const range = useMemo(() => computeRange(entries, days, now), [entries, now, days]);
  const active = activeDays(range, entries, now);
  const excludesToday = active.length > 0 && active[active.length - 1].start < startOfDay(now);
  const avg = (f: (d: DayStats) => number) => average(active.map(f));

  const feedAvg = avg((d) => d.feedCount);
  const mlAvg = avg((d) => d.formulaMl);
  const diaperAvg = avg((d) => d.peeCount + d.poopCount);
  const sleepAvg = avg((d) => d.sleepMs);
  const gapAvg = average(active.flatMap((d) => d.feedGapsMin));

  const fmt1 = (n: number | null) => (n === null ? '-' : n.toFixed(1).replace(/\.0$/, ''));

  return (
    <View>
      <Text style={styles.note}>
        하루 평균 · {active.length}일 기준{excludesToday ? ' (아직 안 끝난 오늘은 빼고 계산)' : ''}
      </Text>
      <View style={styles.tiles}>
        <Tile label="수유" value={`${fmt1(feedAvg)}회`} color={C.feedDeep} bg={C.feed} />
        <Tile label="평균 수유 간격" value={gapText(gapAvg)} color={C.feedDeep} bg={C.feed} />
        <Tile label="분유" value={`${Math.round(mlAvg ?? 0)}ml`} color={C.feedDeep} bg={C.feed} />
        <Tile label="기저귀" value={`${fmt1(diaperAvg)}회`} color={C.diaperDeep} bg={C.diaper} />
        <Tile
          label="수면"
          value={sleepAvg === null ? '-' : durationLabel(sleepAvg)}
          color={C.sleepDeep}
          bg={C.sleep}
          wide
        />
      </View>

      <BarChart title="수유 횟수" unit="회" range={range} value={(d) => d.feedCount} avg={feedAvg} color={C.feedDeep} />
      <BarChart title="분유 양" unit="ml" range={range} value={(d) => d.formulaMl} avg={mlAvg} color={C.feedDeep} />
      <BarChart
        title="기저귀"
        unit="회"
        range={range}
        value={(d) => d.peeCount + d.poopCount}
        avg={diaperAvg}
        color={C.diaperDeep}
      />
      <BarChart
        title="수면 시간"
        unit="시간"
        range={range}
        value={(d) => d.sleepMs / 3600000}
        avg={sleepAvg === null ? null : sleepAvg / 3600000}
        color={C.sleepDeep}
      />
    </View>
  );
}

function BarChart({
  title,
  unit,
  range,
  value,
  avg,
  color,
}: {
  title: string;
  unit: string;
  range: DayStats[];
  value: (d: DayStats) => number;
  avg: number | null;
  color: string;
}) {
  const values = range.map(value);
  const max = Math.max(1, ...values, avg ?? 0);
  const H = 120;
  const many = range.length > 10;
  const avgText =
    avg === null ? '-' : `${unit === 'ml' ? Math.round(avg) : avg.toFixed(1).replace(/\.0$/, '')}${unit}`;

  return (
    <View style={styles.card}>
      <View style={styles.chartHead}>
        <Text style={styles.chartTitle}>{title}</Text>
        <Text style={[styles.chartAvg, { color }]}>평균 {avgText}</Text>
      </View>
      <View style={[styles.bars, { height: H }]}>
        {avg !== null && avg > 0 && (
          <View style={[styles.avgLine, { bottom: (avg / max) * H, borderColor: color }]} />
        )}
        {values.map((v, i) => (
          <View key={i} style={styles.barSlot}>
            {!many && v > 0 && (
              <Text style={styles.barValue}>{unit === '시간' ? v.toFixed(1) : Math.round(v)}</Text>
            )}
            <View
              style={[
                styles.bar,
                {
                  height: Math.max(v > 0 ? 3 : 0, (v / max) * (H - (many ? 0 : 16))),
                  backgroundColor: color,
                  borderRadius: many ? 2 : 6,
                  opacity: i === values.length - 1 ? 1 : 0.75,
                },
              ]}
            />
          </View>
        ))}
      </View>
      {many ? (
        <View style={styles.xAxisAbs}>
          {range.map((d, i) => {
            if (i % 5 !== (range.length - 1) % 5) return null;
            const date = new Date(d.start);
            return (
              <Text
                key={i}
                style={[styles.xLabel, styles.xLabelAbs, { left: `${((i + 0.5) / range.length) * 100}%` }]}
              >
                {`${date.getMonth() + 1}/${date.getDate()}`}
              </Text>
            );
          })}
        </View>
      ) : (
        <View style={styles.xAxis}>
          {range.map((d, i) => (
            <Text key={i} style={[styles.xLabel, { flex: 1 }]}>
              {WEEKDAYS[new Date(d.start).getDay()]}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

function Tile({
  label,
  value,
  sub,
  color,
  bg,
  wide,
}: {
  label: string;
  value: string;
  sub?: string;
  color: string;
  bg: string;
  wide?: boolean;
}) {
  return (
    <View style={[styles.tile, { backgroundColor: bg }, wide && { flexBasis: '100%' }]}>
      <Text style={styles.tileLabel}>{label}</Text>
      <Text style={[styles.tileValue, { color }]}>{value}</Text>
      {sub && <Text style={styles.tileSub}>{sub}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: '800', color: C.text },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, marginBottom: 14 },
  reportBtn: { backgroundColor: C.feed, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12, minWidth: 60 },
  reportText: { color: C.feedDeep, fontWeight: '800', fontSize: 14 },
  star: { fontSize: 10 },
  segment: { flexDirection: 'row', backgroundColor: C.line, borderRadius: 14, padding: 4, marginBottom: 16 },
  segBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  segBtnOn: { backgroundColor: C.card },
  segText: { fontSize: 14, fontWeight: '600', color: C.sub },
  segTextOn: { color: C.text, fontWeight: '800' },
  empty: { color: C.sub, fontSize: 15, paddingVertical: 24, textAlign: 'center' },
  note: { color: C.sub, fontSize: 13, marginBottom: 8 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { flexBasis: '47%', flexGrow: 1, borderRadius: 16, padding: 14 },
  tileLabel: { fontSize: 13, color: C.sub, marginBottom: 4 },
  tileValue: { fontSize: 22, fontWeight: '800' },
  tileSub: { fontSize: 13, color: C.text, marginTop: 4 },
  section: { fontSize: 15, fontWeight: '700', color: C.sub, marginTop: 22, marginBottom: 8 },
  card: {
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: C.line,
    marginTop: 12,
  },
  lane: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  laneLabel: { width: 48, fontSize: 13, color: C.sub },
  laneTrack: { flex: 1, height: 18, backgroundColor: '#F6F1EC', borderRadius: 9, overflow: 'hidden' },
  dot: { position: 'absolute', top: 4, width: 10, height: 10, marginLeft: -5, borderRadius: 5 },
  block: { position: 'absolute', top: 2, bottom: 2, borderRadius: 6 },
  nowLine: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: C.danger, opacity: 0.6 },
  hours: { flexDirection: 'row', justifyContent: 'space-between', marginLeft: 48 },
  hourText: { fontSize: 11, color: C.sub },
  chartHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  chartTitle: { fontSize: 15, fontWeight: '700', color: C.text },
  chartAvg: { fontSize: 14, fontWeight: '700' },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
  barSlot: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' },
  bar: { width: '80%' },
  barValue: { fontSize: 11, color: C.sub, marginBottom: 2 },
  avgLine: { position: 'absolute', left: 0, right: 0, borderTopWidth: 1, borderStyle: 'dashed', opacity: 0.6 },
  xAxis: { flexDirection: 'row', gap: 3, marginTop: 6, minHeight: 16 },
  xLabel: { fontSize: 11, color: C.sub, textAlign: 'center' },
  xAxisAbs: { height: 16, marginTop: 6 },
  xLabelAbs: { position: 'absolute', width: 40, marginLeft: -20 },
});
