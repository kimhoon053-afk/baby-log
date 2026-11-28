import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { C } from '../theme';

/**
 * 주별 추세를 꺾은선으로 그립니다. 값이 없는 주(null)는 건너뛰고 이어 그려요.
 */
export default function LineChart({
  title,
  values,
  labels,
  color,
  format,
}: {
  title: string;
  values: (number | null)[];
  labels: string[];
  color: string;
  format: (v: number) => string;
}) {
  const [w, setW] = useState(0);
  const H = 130;
  const padL = 8;
  const padR = 8;
  const padT = 22;
  const padB = 8;

  const pts = values.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v !== null);
  const nums = pts.map((p) => p.v);
  const lo = nums.length ? Math.min(...nums) : 0;
  const hi = nums.length ? Math.max(...nums) : 1;
  const span = hi - lo || Math.max(1, hi * 0.2);
  const yMin = Math.max(0, lo - span * 0.25);
  const yMax = hi + span * 0.25;

  const x = (i: number) => padL + (values.length <= 1 ? 0.5 : i / (values.length - 1)) * (w - padL - padR);
  const y = (v: number) => padT + (1 - (v - yMin) / (yMax - yMin || 1)) * (H - padT - padB);

  const d = pts.map((p, k) => `${k === 0 ? 'M' : 'L'}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');

  const first = pts[0];
  const last = pts[pts.length - 1];
  let change = '';
  if (first && last && first !== last && first.v > 0) {
    const pct = Math.round(((last.v - first.v) / first.v) * 100);
    change = pct === 0 ? '변화 없음' : `${pct > 0 ? '▲' : '▼'} ${Math.abs(pct)}%`;
  }

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>{title}</Text>
        <Text style={[styles.now, { color }]}>
          {last ? `이번 주 ${format(last.v)}` : '-'}
          {change ? <Text style={styles.change}>{`  ${change}`}</Text> : null}
        </Text>
      </View>
      <View style={{ height: H }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
        {w > 0 && (
          <Svg width={w} height={H}>
            {[0.25, 0.5, 0.75].map((f) => (
              <Line
                key={f}
                x1={0}
                x2={w}
                y1={padT + f * (H - padT - padB)}
                y2={padT + f * (H - padT - padB)}
                stroke={C.line}
                strokeWidth={1}
              />
            ))}
            {pts.length > 1 && <Path d={d} stroke={color} strokeWidth={3} fill="none" strokeLinejoin="round" />}
            {pts.map((p) => (
              <Circle
                key={p.i}
                cx={x(p.i)}
                cy={y(p.v)}
                r={p === last ? 5 : 3.5}
                fill={p === last ? color : C.card}
                stroke={color}
                strokeWidth={2}
              />
            ))}
            {first && first !== last && (
              <SvgText x={x(first.i) - 2} y={y(first.v) - 9} fontSize={10} fill={C.sub} textAnchor="start">
                {format(first.v)}
              </SvgText>
            )}
          </Svg>
        )}
      </View>
      <View style={styles.axis}>
        <Text style={styles.axisText}>{labels[0]}</Text>
        <Text style={styles.axisText}>{labels[labels.length - 1]}</Text>
      </View>
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
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 },
  title: { fontSize: 15, fontWeight: '700', color: C.text },
  now: { fontSize: 14, fontWeight: '800' },
  change: { fontSize: 12, color: C.sub, fontWeight: '600' },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  axisText: { fontSize: 11, color: C.sub },
});
