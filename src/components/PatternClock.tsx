import { useMemo, useState, type ReactElement } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';

import { startOfDay } from '../stats';
import { C } from '../theme';
import type { LogEntry } from '../types';

const DAY = 86400000;

/**
 * 24시간 시계 모양에 최근 며칠의 하루를 고리로 겹쳐 그립니다.
 * 안쪽 고리 = 오래된 날, 바깥 고리 = 오늘. 맨 위가 자정(0시), 오른쪽이 오전 6시예요.
 * 보라색 띠 = 잠, 주황 점 = 수유, 파란 점 = 기저귀.
 */
export default function PatternClock({ entries, now, days = 7 }: { entries: LogEntry[]; now: number; days?: number }) {
  const [w, setW] = useState(0);
  const size = Math.min(w, 340);
  const cx = size / 2;
  const cy = size / 2;
  const outer = size / 2 - 34;
  const inner = outer * 0.32;
  const ringW = (outer - inner) / days;

  const today = startOfDay(now);
  const dayStarts = Array.from({ length: days }, (_, i) => today - (days - 1 - i) * DAY);

  const angle = (t: number, dayStart: number) => ((t - dayStart) / DAY) * Math.PI * 2 - Math.PI / 2;
  const pt = (a: number, r: number) => [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;

  const arc = (a0: number, a1: number, r: number) => {
    const [x0, y0] = pt(a0, r);
    const [x1, y1] = pt(a1, r);
    const large = a1 - a0 > Math.PI ? 1 : 0;
    return `M${x0.toFixed(1)},${y0.toFixed(1)} A${r},${r} 0 ${large} 1 ${x1.toFixed(1)},${y1.toFixed(1)}`;
  };

  const shapes = useMemo(() => {
    if (size === 0) return [];
    const out: ReactElement[] = [];
    dayStarts.forEach((ds, ring) => {
      const r = inner + ringW * (ring + 0.5);
      const de = ds + DAY;
      out.push(<Circle key={`bg${ring}`} cx={cx} cy={cy} r={r} stroke="#F3EEE8" strokeWidth={ringW - 2} fill="none" />);
      for (const e of entries) {
        const s = new Date(e.startAt).getTime();
        if (e.kind === 'sleep') {
          const end = e.endAt ? new Date(e.endAt).getTime() : now;
          const a = Math.max(s, ds);
          const b = Math.min(end, de);
          if (b <= a) continue;
          out.push(
            <Path
              key={`s${ring}-${e.id}`}
              d={arc(angle(a, ds), angle(Math.max(b, a + 6 * 60000), ds), r)}
              stroke={C.sleepDeep}
              strokeWidth={ringW - 3}
              strokeLinecap="butt"
              fill="none"
              opacity={0.85}
            />,
          );
        }
      }
      for (const e of entries) {
        const s = new Date(e.startAt).getTime();
        if (e.kind === 'sleep' || s < ds || s >= de) continue;
        const [x, y] = pt(angle(s, ds), r);
        out.push(
          <Circle
            key={`p${ring}-${e.id}`}
            cx={x}
            cy={y}
            r={e.kind === 'feed' ? Math.min(4.5, ringW / 2.4) : Math.min(3, ringW / 3)}
            fill={e.kind === 'feed' ? C.feedDeep : C.diaperDeep}
            stroke="#fff"
            strokeWidth={1}
          />,
        );
      }
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, now, size, days]);

  // 지금 시각 바늘
  const [hx, hy] = pt(angle(now, today), outer + 4);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>하루 패턴 시계 · 최근 {days}일</Text>
      <View style={{ alignItems: 'center' }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        {size > 0 && (
          <Svg width={size} height={size}>
            <G>{shapes}</G>
            {Array.from({ length: 24 }, (_, h) => {
              const a = (h / 24) * Math.PI * 2 - Math.PI / 2;
              const [x0, y0] = pt(a, outer + 2);
              const [x1, y1] = pt(a, outer + (h % 6 === 0 ? 9 : 5));
              return <Line key={h} x1={x0} y1={y0} x2={x1} y2={y1} stroke={C.sub} strokeWidth={h % 6 === 0 ? 2 : 1} />;
            })}
            {[
              [0, '0시'],
              [6, '6시'],
              [12, '12시'],
              [18, '18시'],
            ].map(([h, label]) => {
              const a = ((h as number) / 24) * Math.PI * 2 - Math.PI / 2;
              const [x, y] = pt(a, outer + 22);
              return (
                <SvgText key={label} x={x} y={y + 4} fontSize={11} fill={C.sub} textAnchor="middle" fontWeight="700">
                  {label}
                </SvgText>
              );
            })}
            <Line x1={cx} y1={cy} x2={hx} y2={hy} stroke={C.danger} strokeWidth={2} opacity={0.5} />
            <Circle cx={cx} cy={cy} r={inner - 6} fill={C.card} />
            <SvgText x={cx} y={cy - 2} fontSize={12} fill={C.sub} textAnchor="middle">
              안쪽 = 옛날
            </SvgText>
            <SvgText x={cx} y={cy + 14} fontSize={12} fill={C.sub} textAnchor="middle">
              바깥 = 오늘
            </SvgText>
          </Svg>
        )}
      </View>
      <View style={styles.legend}>
        <Legend color={C.sleepDeep} label="잠" bar />
        <Legend color={C.feedDeep} label="수유" />
        <Legend color={C.diaperDeep} label="기저귀" />
      </View>
    </View>
  );
}

function Legend({ color, label, bar }: { color: string; label: string; bar?: boolean }) {
  return (
    <View style={styles.legendItem}>
      <View style={[bar ? styles.legendBar : styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: C.line,
    marginTop: 12,
  },
  title: { fontSize: 15, fontWeight: '700', color: C.text, marginBottom: 8 },
  legend: { flexDirection: 'row', justifyContent: 'center', gap: 18, marginTop: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendBar: { width: 16, height: 8, borderRadius: 3 },
  legendText: { fontSize: 13, color: C.sub },
});
