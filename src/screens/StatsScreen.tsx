import { useMemo, useState } from 'react';
import { ScrollView, Pressable, StyleSheet, Text, View } from 'react-native';

import { durationLabel } from '../format';
import { activeDays, average, computeDay, computeRange, startOfDay, type DayStats } from '../stats';
import { C } from '../theme';
import type { LogEntry } from '../types';

type Period = 'today' | 'week' | 'month';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export default function StatsScreen({ entries, now }: { entries: LogEntry[]; now: number }) {
  const [period, setPeriod] = useState<Period>('today');

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>통계</Text>
      <View style={styles.segment}>
        {(
          [
            ['today', '오늘'],
            ['week', '최근 7일'],
            ['month', '최근 30일'],
          ] as const
        ).map(([key, label]) => (
          <Pressable
            key={key}
            onPress={() => setPeriod(key)}
            style={[styles.segBtn, period === key && styles.segBtnOn]}
          >
            <Text style={[styles.segText, period === key && styles.segTextOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {entries.length === 0 ? (
        <Text style={styles.empty}>기록이 쌓이면 여기에서 통계를 볼 수 있어요.</Text>
      ) : period === 'today' ? (
        <TodayView entries={entries} now={now} />
      ) : (
        <RangeView entries={entries} now={now} days={period === 'week' ? 7 : 30} />
      )}
    </ScrollView>
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
  title: { fontSize: 26, fontWeight: '800', color: C.text, marginTop: 4, marginBottom: 14 },
  segment: { flexDirection: 'row', backgroundColor: C.line, borderRadius: 14, padding: 4, marginBottom: 16 },
  segBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  segBtnOn: { backgroundColor: C.card },
  segText: { fontSize: 15, fontWeight: '600', color: C.sub },
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
