import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, type ScrollViewInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { C } from '../theme';

// 앱을 처음 켰을 때 한 번만 보여 주는 소개 화면 (옆으로 넘기는 4장)

const KEY = 'baby-log/onboarded/v1';

type Slide = { icon: string; bg: string; color: string; title: string; body: string; points: string[]; badge?: string };

const SLIDES: Slide[] = [
  {
    icon: '📝',
    bg: C.feed,
    color: C.feedDeep,
    title: '탭 한 번으로 기록',
    badge: '광고 없음',
    body: '졸린 새벽에도 버튼 하나면 끝나요.',
    points: ['🤱 모유(왼쪽·오른쪽) · 🍼 분유 양', '💧 소변 · 💩 대변', '😴 잠들고 깬 시간'],
  },
  {
    icon: '⏰',
    bg: C.feed,
    color: C.feedDeep,
    title: '밤중 수유, 나눠서 해요',
    body: '마지막 수유 후 정해 둔 시간이 지나면 알려줘요.',
    points: ['🌙 밤에는 당번 휴대폰만 울려요', '🔔 알림에서 바로 "먹였어요" 기록', '🌑 밤에는 눈부시지 않은 어두운 화면'],
  },
  {
    icon: '👨‍👩‍👧',
    bg: C.diaper,
    color: C.diaperDeep,
    title: '가족과 함께 기록',
    badge: '무료',
    body: '초대 코드 하나로 엄마, 아빠, 할머니가 같은 기록을 봐요.',
    points: ['누가 기록해도 모두에게 바로 보여요', '💬 오늘 요약을 카톡으로 보내기', '💉 예방접종·건강검진 날짜 알림'],
  },
  {
    icon: '📊',
    bg: C.sleep,
    color: C.sleepDeep,
    title: '아기를 더 깊이 알아보기',
    badge: '⭐ 프리미엄',
    body: '오늘·7일 통계는 무료, 더 깊은 분석은 프리미엄으로.',
    points: ['📈 몇 주 동안의 추세 그래프', '🕐 24시간 하루 패턴 시계', '📏 또래와 비교하는 성장 곡선', '📄 소아과에 보여줄 PDF 리포트'],
  },
];

export default function Onboarding({ onOpenFamily }: { onOpenFamily: () => void }) {
  const [visible, setVisible] = useState(false);
  const [page, setPage] = useState(0);
  const { width } = useWindowDimensions();
  const ref = useRef<ScrollViewInstance>(null);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => setVisible(v !== '1'))
      .catch(() => {});
  }, []);

  const finish = (thenFamily?: boolean) => {
    setVisible(false);
    AsyncStorage.setItem(KEY, '1').catch(() => {});
    if (thenFamily) onOpenFamily();
  };

  const go = (i: number) => {
    ref.current?.scrollTo({ x: i * width, animated: true });
    setPage(i);
  };

  const last = page === SLIDES.length - 1;

  return (
    <Modal visible={visible} animationType="fade" onRequestClose={() => finish()}>
      <SafeAreaView style={styles.safe}>
        <Pressable onPress={() => finish()} style={styles.skip} hitSlop={10}>
          <Text style={styles.skipText}>건너뛰기</Text>
        </Pressable>
        <ScrollView
          ref={ref}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
          style={{ flex: 1 }}
        >
          {SLIDES.map((s) => (
            <View key={s.title} style={[styles.slide, { width }]}>
              <View style={[styles.circle, { backgroundColor: s.bg }]}>
                <Text style={styles.icon}>{s.icon}</Text>
              </View>
              {s === SLIDES[0] && <Text style={styles.brand}>꼬물노트에 오신 걸 환영해요</Text>}
              {s.badge && (
                <Text style={[styles.badge, { color: s.color, backgroundColor: s.bg }]}>{s.badge}</Text>
              )}
              <Text style={styles.title}>{s.title}</Text>
              <Text style={styles.body}>{s.body}</Text>
              <View style={styles.points}>
                {s.points.map((p) => (
                  <Text key={p} style={styles.point}>
                    {p}
                  </Text>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>

        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View key={i} style={[styles.dot, i === page && styles.dotOn]} />
          ))}
        </View>

        <View style={styles.bottom}>
          {last ? (
            <>
              <Pressable onPress={() => finish()} style={styles.primary}>
                <Text style={styles.primaryText}>시작하기</Text>
              </Pressable>
              <Pressable onPress={() => finish(true)} style={styles.secondary}>
                <Text style={styles.secondaryText}>가족 공유부터 설정할래요</Text>
              </Pressable>
            </>
          ) : (
            <Pressable onPress={() => go(page + 1)} style={styles.primary}>
              <Text style={styles.primaryText}>다음</Text>
            </Pressable>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  skip: { alignSelf: 'flex-end', padding: 16 },
  skipText: { color: C.sub, fontSize: 15 },
  slide: { alignItems: 'center', paddingHorizontal: 32, paddingTop: 30 },
  circle: { width: 140, height: 140, borderRadius: 70, alignItems: 'center', justifyContent: 'center' },
  icon: { fontSize: 68 },
  brand: { marginTop: 22, fontSize: 15, fontWeight: '800', color: C.sleepDeep },
  badge: {
    marginTop: 22,
    fontSize: 13,
    fontWeight: '800',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 10,
    overflow: 'hidden',
  },
  title: { fontSize: 26, fontWeight: '800', color: C.text, marginTop: 16, textAlign: 'center' },
  body: { fontSize: 16, color: C.sub, marginTop: 10, textAlign: 'center', lineHeight: 23 },
  points: {
    alignSelf: 'stretch',
    backgroundColor: C.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: C.line,
    padding: 18,
    marginTop: 26,
    gap: 12,
  },
  point: { fontSize: 16, color: C.text },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 18 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.line },
  dotOn: { width: 22, backgroundColor: C.feedDeep },
  bottom: { paddingHorizontal: 24, paddingBottom: 20 },
  primary: { backgroundColor: C.feedDeep, borderRadius: 16, paddingVertical: 17, alignItems: 'center' },
  primaryText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  secondary: { paddingVertical: 14, alignItems: 'center' },
  secondaryText: { color: C.diaperDeep, fontSize: 15, fontWeight: '700' },
});
