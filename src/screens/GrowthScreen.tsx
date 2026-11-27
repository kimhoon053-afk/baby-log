import { useEffect, useMemo, useState } from 'react';
import { Alert, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Circle, Line, Path, Text as SvgText } from 'react-native-svg';

import { Locked } from '../components/Paywall';
import {
  addGrowth,
  ageDays,
  ageLabel,
  CURVE_Z,
  lmsAt,
  loadGrowth,
  loadProfile,
  maxTableDays,
  MEASURES,
  parseDate,
  percentile,
  percentileLabel,
  removeGrowth,
  saveProfile,
  toDateString,
  valueAtZ,
  valueOf,
  type BabyProfile,
  type GrowthEntry,
  type Measure,
  type Sex,
} from '../growth';
import { usePremium } from '../premium';
import { C } from '../theme';

export default function GrowthScreen({ now, babyName }: { now: number; babyName: string }) {
  const { isPremium } = usePremium();
  const [profile, setProfile] = useState<BabyProfile | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  const [list, setList] = useState<GrowthEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [measure, setMeasure] = useState<Measure>('weight');

  useEffect(() => {
    Promise.all([loadProfile(), loadGrowth()]).then(([p, g]) => {
      setProfile(p);
      setList(g);
      setLoaded(true);
    });
  }, []);

  if (!loaded) return null;

  if (!profile || editingProfile) {
    return (
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>성장</Text>
        <ProfileForm
          initial={profile}
          babyName={babyName}
          onSave={async (p) => {
            await saveProfile(p);
            setProfile(p);
            setEditingProfile(false);
          }}
          onCancel={profile ? () => setEditingProfile(false) : undefined}
        />
      </ScrollView>
    );
  }

  const today = toDateString(now);
  const age = ageDays(profile.birthDate, today) ?? 0;
  const latest = [...list].reverse();

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.titleRow}>
        <Text style={styles.title}>성장</Text>
        <Pressable onPress={() => setEditingProfile(true)}>
          <Text style={styles.profileText}>
            {profile.sex === 'male' ? '👦' : '👧'} {ageLabel(age)} · 수정
          </Text>
        </Pressable>
      </View>

      <AddForm today={today} onAdd={async (e) => setList(await addGrowth(e))} />

      <Text style={styles.section}>또래와 비교 (WHO 성장 기준)</Text>
      {list.length === 0 ? (
        <Text style={styles.empty}>키나 몸무게를 한 번 입력하면 성장 곡선이 나와요.</Text>
      ) : !isPremium ? (
        <Locked
          title="성장 곡선 비교"
          desc="우리 아기의 키·몸무게·머리둘레가 또래 100명 중 몇 번째인지, 성장 곡선 위에 점으로 보여줘요."
          reason="성장 곡선 비교"
        />
      ) : (
        <>
          <View style={styles.segment}>
            {MEASURES.map((m) => (
              <Pressable
                key={m.key}
                onPress={() => setMeasure(m.key)}
                style={[styles.segBtn, measure === m.key && styles.segBtnOn]}
              >
                <Text style={[styles.segText, measure === m.key && styles.segTextOn]}>{m.label}</Text>
              </Pressable>
            ))}
          </View>
          <PercentileSummary profile={profile} list={list} />
          <GrowthCurve profile={profile} list={list} measure={measure} todayAge={age} />
        </>
      )}

      {latest.length > 0 && (
        <>
          <Text style={styles.section}>기록 (길게 누르면 지워요)</Text>
          <View style={styles.card}>
            {latest.map((g) => {
              const d = ageDays(profile.birthDate, g.date);
              return (
                <Pressable
                  key={g.id}
                  onLongPress={() =>
                    Alert.alert('이 기록을 지울까요?', g.date, [
                      { text: '취소', style: 'cancel' },
                      { text: '지우기', style: 'destructive', onPress: async () => setList(await removeGrowth(g.id)) },
                    ])
                  }
                  style={styles.row}
                >
                  <View style={{ width: 96 }}>
                    <Text style={styles.rowDate}>{g.date.slice(5).replace('-', '/')}</Text>
                    {d !== null && <Text style={styles.rowAge}>{ageLabel(d)}</Text>}
                  </View>
                  <Text style={styles.rowVal}>
                    {[
                      g.weightKg !== undefined ? `${g.weightKg}kg` : null,
                      g.lengthCm !== undefined ? `${g.lengthCm}cm` : null,
                      g.headCm !== undefined ? `머리 ${g.headCm}cm` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}
    </ScrollView>
  );
}

function ProfileForm({
  initial,
  babyName,
  onSave,
  onCancel,
}: {
  initial: BabyProfile | null;
  babyName: string;
  onSave: (p: BabyProfile) => void;
  onCancel?: () => void;
}) {
  const [birth, setBirth] = useState(initial?.birthDate ?? '');
  const [sex, setSex] = useState<Sex | null>(initial?.sex ?? null);
  const ok = parseDate(birth) !== null && sex !== null;

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{babyName === '아기 기록' ? '아기' : babyName.replace(/ 기록$/, '')} 정보</Text>
      <Text style={styles.help}>또래 아기와 비교하려면 생일과 성별이 필요해요.</Text>
      <Text style={styles.label}>생일</Text>
      <TextInput
        value={birth}
        onChangeText={setBirth}
        placeholder="예: 2026-08-15"
        keyboardType="numbers-and-punctuation"
        style={styles.input}
        placeholderTextColor={C.sub}
      />
      <Text style={styles.label}>성별</Text>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {(
          [
            ['male', '👦 남자아이'],
            ['female', '👧 여자아이'],
          ] as const
        ).map(([k, label]) => (
          <Pressable key={k} onPress={() => setSex(k)} style={[styles.choice, sex === k && styles.choiceOn]}>
            <Text style={[styles.choiceText, sex === k && { color: C.feedDeep }]}>{label}</Text>
          </Pressable>
        ))}
      </View>
      <Pressable
        disabled={!ok}
        onPress={() => onSave({ birthDate: toDateString(parseDate(birth)!), sex: sex! })}
        style={[styles.save, !ok && { opacity: 0.4 }]}
      >
        <Text style={styles.saveText}>저장</Text>
      </Pressable>
      {onCancel && (
        <Pressable onPress={onCancel} style={{ alignSelf: 'center', padding: 10 }}>
          <Text style={{ color: C.sub }}>취소</Text>
        </Pressable>
      )}
    </View>
  );
}

function num(s: string): number | undefined {
  const v = Number(s.replace(',', '.'));
  return s.trim() !== '' && v > 0 ? Math.round(v * 100) / 100 : undefined;
}

function AddForm({ today, onAdd }: { today: string; onAdd: (e: Omit<GrowthEntry, 'id'>) => void }) {
  const [date, setDate] = useState(today);
  const [w, setW] = useState('');
  const [l, setL] = useState('');
  const [h, setH] = useState('');

  const submit = () => {
    const t = parseDate(date);
    if (t === null) {
      Alert.alert('날짜를 확인해 주세요', '예: 2026-11-28');
      return;
    }
    const e = { date: toDateString(t), weightKg: num(w), lengthCm: num(l), headCm: num(h) };
    if (e.weightKg === undefined && e.lengthCm === undefined && e.headCm === undefined) {
      Alert.alert('하나 이상 입력해 주세요', '몸무게, 키, 머리둘레 중 잰 것만 넣으면 돼요.');
      return;
    }
    if ((e.weightKg ?? 0) > 40 || (e.lengthCm ?? 0) > 150 || (e.headCm ?? 0) > 70) {
      Alert.alert('숫자를 확인해 주세요', '몸무게는 kg, 키와 머리둘레는 cm 로 넣어 주세요.');
      return;
    }
    Keyboard.dismiss();
    onAdd(e);
    setW('');
    setL('');
    setH('');
  };

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>새로 잰 값 넣기</Text>
      <View style={styles.inputs}>
        <Field label="날짜" value={date} onChange={setDate} placeholder={today} wide />
        <Field label="몸무게 (kg)" value={w} onChange={setW} placeholder="6.2" />
        <Field label="키 (cm)" value={l} onChange={setL} placeholder="61.5" />
        <Field label="머리둘레 (cm)" value={h} onChange={setH} placeholder="40.1" />
      </View>
      <Pressable onPress={submit} style={styles.save}>
        <Text style={styles.saveText}>저장</Text>
      </Pressable>
    </View>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  wide,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  placeholder: string;
  wide?: boolean;
}) {
  return (
    <View style={[{ flexBasis: '30%', flexGrow: 1 }, wide && { flexBasis: '100%' }]}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor="#B9B5C2"
        keyboardType={wide ? 'numbers-and-punctuation' : 'decimal-pad'}
        style={styles.input}
      />
    </View>
  );
}

function PercentileSummary({ profile, list }: { profile: BabyProfile; list: GrowthEntry[] }) {
  return (
    <View style={styles.card}>
      {MEASURES.map((m) => {
        const last = [...list].reverse().find((g) => valueOf(g, m.key) !== undefined);
        if (!last) return null;
        const v = valueOf(last, m.key)!;
        const d = ageDays(profile.birthDate, last.date);
        const p = d === null ? null : percentile(m.key, profile.sex, d, v);
        return (
          <View key={m.key} style={styles.pRow}>
            <Text style={styles.pLabel}>{m.label}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.pValue}>
                {v}
                {m.unit} {p !== null && <Text style={styles.pBadge}> {Math.round(p)} 백분위</Text>}
              </Text>
              <Text style={styles.pDesc}>{p === null ? '만 3세까지만 비교할 수 있어요' : percentileLabel(p)}</Text>
            </View>
          </View>
        );
      })}
      <Text style={styles.fine}>
        백분위 50 = 딱 평균이에요. 3~97 사이면 보통 범위예요. 한 번 잰 값보다 곡선을 따라 꾸준히 크는지가 더
        중요해요. 걱정되면 소아과 선생님과 상의하세요.
      </Text>
    </View>
  );
}

function GrowthCurve({
  profile,
  list,
  measure,
  todayAge,
}: {
  profile: BabyProfile;
  list: GrowthEntry[];
  measure: Measure;
  todayAge: number;
}) {
  const [w, setW] = useState(0);
  const H = 240;
  const padL = 34;
  const padR = 22;
  const padT = 10;
  const padB = 24;

  const points = useMemo(
    () =>
      list
        .map((g) => ({ d: ageDays(profile.birthDate, g.date), v: valueOf(g, measure) }))
        .filter((p): p is { d: number; v: number } => p.d !== null && p.d >= 0 && p.v !== undefined),
    [list, measure, profile],
  );

  const lastAge = Math.max(todayAge, ...points.map((p) => p.d), 0);
  const xMax = Math.min(maxTableDays(), Math.max(182, Math.ceil((lastAge + 60) / 30.4375) * 30.4375));
  const samples = Array.from({ length: 41 }, (_, i) => (xMax * i) / 40);

  const curves = CURVE_Z.map((c) => ({
    ...c,
    vals: samples.map((d) => valueAtZ(c.z, lmsAt(measure, profile.sex, d)!)),
  }));
  const all = curves.flatMap((c) => c.vals).concat(points.map((p) => p.v));
  const yMin = Math.floor(Math.min(...all) * 0.95);
  const yMax = Math.ceil(Math.max(...all) * 1.02);

  const x = (d: number) => padL + (d / xMax) * (w - padL - padR);
  const y = (v: number) => padT + (1 - (v - yMin) / (yMax - yMin)) * (H - padT - padB);
  const path = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(samples[i]).toFixed(1)},${y(v).toFixed(1)}`).join(' ');

  const months = Math.round(xMax / 30.4375);
  const monthStep = months <= 8 ? 1 : months <= 16 ? 2 : 3;
  const unit = MEASURES.find((m) => m.key === measure)!.unit;
  const yTicks = Array.from({ length: 5 }, (_, i) => yMin + ((yMax - yMin) * i) / 4);
  const color = C.feedDeep;
  const sorted = [...points].sort((a, b) => a.d - b.d);

  return (
    <View style={styles.card} onLayout={(e) => setW(e.nativeEvent.layout.width - 28)}>
      <Text style={styles.cardTitle}>성장 곡선 ({unit})</Text>
      {w > 0 && (
        <Svg width={w} height={H}>
          {/* 3~97 백분위 사이를 옅게 칠해요 (보통 범위) */}
          <Path
            d={`${path(curves[0].vals)} ${[...curves[4].vals]
              .map((v, i, arr) => `L${x(samples[arr.length - 1 - i]).toFixed(1)},${y(arr[arr.length - 1 - i]).toFixed(1)}`)
              .join(' ')} Z`}
            fill="#FFF1E8"
          />
          {yTicks.map((v) => (
            <SvgText key={v} x={padL - 4} y={y(v) + 3} fontSize={9} fill={C.sub} textAnchor="end">
              {v.toFixed(measure === 'weight' ? 1 : 0)}
            </SvgText>
          ))}
          {Array.from({ length: Math.floor(months / monthStep) + 1 }, (_, i) => i * monthStep).map((m) => (
            <SvgText key={m} x={x(m * 30.4375)} y={H - 6} fontSize={9} fill={C.sub} textAnchor="middle">
              {m === 0 ? '0' : `${m}개월`}
            </SvgText>
          ))}
          {curves.map((c) => (
            <Path
              key={c.label}
              d={path(c.vals)}
              stroke={c.z === 0 ? '#C9A58C' : '#E5D3C6'}
              strokeWidth={c.z === 0 ? 2 : 1}
              strokeDasharray={c.z === 0 ? undefined : '4,3'}
              fill="none"
            />
          ))}
          {curves.map((c) => (
            <SvgText key={`l${c.label}`} x={w - padR + 3} y={y(c.vals[c.vals.length - 1]) + 3} fontSize={9} fill={C.sub}>
              {c.label}
            </SvgText>
          ))}
          <Line x1={x(todayAge)} x2={x(todayAge)} y1={padT} y2={H - padB} stroke={C.danger} strokeWidth={1} opacity={0.3} />
          {sorted.length > 1 && (
            <Path
              d={sorted.map((p, i) => `${i ? 'L' : 'M'}${x(p.d).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')}
              stroke={color}
              strokeWidth={2.5}
              fill="none"
            />
          )}
          {sorted.map((p, i) => (
            <Circle key={i} cx={x(p.d)} cy={y(p.v)} r={4.5} fill={color} stroke="#fff" strokeWidth={1.5} />
          ))}
        </Svg>
      )}
      <Text style={styles.fine}>점선 숫자는 백분위 (3·15·50·85·97), 주황 점이 우리 아기예요.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, marginBottom: 6 },
  title: { fontSize: 26, fontWeight: '800', color: C.text, marginTop: 4 },
  profileText: { color: C.sub, fontSize: 14, fontWeight: '600' },
  section: { fontSize: 15, fontWeight: '700', color: C.sub, marginTop: 22, marginBottom: 2 },
  empty: { color: C.sub, fontSize: 15, paddingVertical: 18, textAlign: 'center' },
  card: {
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: C.line,
    marginTop: 12,
  },
  cardTitle: { fontSize: 16, fontWeight: '800', color: C.text, marginBottom: 6 },
  help: { color: C.sub, fontSize: 14, marginBottom: 6 },
  label: { fontSize: 13, color: C.sub, marginTop: 10, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: C.text,
    backgroundColor: '#FFFDFB',
  },
  inputs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { flex: 1, borderWidth: 2, borderColor: C.line, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  choiceOn: { borderColor: C.feedDeep, backgroundColor: '#FFF3EC' },
  choiceText: { fontSize: 15, fontWeight: '700', color: C.text },
  save: { backgroundColor: C.feedDeep, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 14 },
  saveText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  segment: { flexDirection: 'row', backgroundColor: C.line, borderRadius: 14, padding: 4, marginTop: 10 },
  segBtn: { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center' },
  segBtnOn: { backgroundColor: C.card },
  segText: { fontSize: 14, fontWeight: '600', color: C.sub },
  segTextOn: { color: C.text, fontWeight: '800' },
  pRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  pLabel: { width: 72, fontSize: 14, color: C.sub, marginTop: 2 },
  pValue: { fontSize: 18, fontWeight: '800', color: C.text },
  pBadge: { fontSize: 13, color: C.feedDeep, fontWeight: '800' },
  pDesc: { fontSize: 13, color: C.sub, marginTop: 2 },
  fine: { fontSize: 12, color: C.sub, marginTop: 6, lineHeight: 18 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line },
  rowDate: { fontSize: 15, fontWeight: '700', color: C.text },
  rowAge: { fontSize: 12, color: C.sub },
  rowVal: { flex: 1, fontSize: 15, color: C.text },
});
