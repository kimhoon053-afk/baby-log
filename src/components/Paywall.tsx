import { useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { TEST_MODE, usePremium, type Plan } from '../premium';
import { C } from '../theme';

const FEATURES: { icon: string; title: string; desc: string }[] = [
  { icon: '📈', title: '추세 그래프', desc: '수유·수면·기저귀가 몇 주 동안 어떻게 변했는지 한눈에' },
  { icon: '🕐', title: '하루 패턴 시계', desc: '24시간 시계에 아기 생활 리듬을 색으로 표시' },
  { icon: '📏', title: '성장 곡선 비교', desc: '키·몸무게·머리둘레를 또래(WHO 성장 기준)와 비교' },
  { icon: '📄', title: '소아과용 리포트', desc: '최근 기록 요약을 PDF로 만들어 진료 때 보여주기' },
  { icon: '📊', title: '30일 통계', desc: '한 달 동안의 평균과 그래프' },
];

export default function Paywall() {
  const p = usePremium();
  const [selected, setSelected] = useState<Plan['id']>('annual');
  const [busy, setBusy] = useState(false);

  const plan = p.plans.find((x) => x.id === selected) ?? p.plans[0];

  const onBuy = async () => {
    if (!plan) return;
    setBusy(true);
    try {
      const r = await p.buy(plan);
      if (r === 'done') {
        p.closePaywall();
        Alert.alert('프리미엄이 시작됐어요 🎉', TEST_MODE ? '(테스트 모드라 실제 결제는 되지 않았어요)' : '고마워요!');
      }
    } catch (e) {
      Alert.alert('결제 오류', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onRestore = async () => {
    setBusy(true);
    try {
      const ok = await p.restore();
      Alert.alert(ok ? '구독을 찾았어요' : '구독 내역이 없어요', ok ? '프리미엄을 다시 쓸 수 있어요.' : '');
      if (ok) p.closePaywall();
    } catch {
      Alert.alert('문제가 생겼어요', '인터넷 연결을 확인해 주세요.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={p.paywallOpen} animationType="slide" onRequestClose={p.closePaywall}>
      <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={styles.content}>
        <Pressable onPress={p.closePaywall} style={styles.close} hitSlop={12}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
        <Text style={styles.badge}>⭐ 프리미엄</Text>
        <Text style={styles.title}>우리 아기를 더 깊이 알아보세요</Text>
        {p.paywallReason ? <Text style={styles.reason}>🔒 {p.paywallReason} · 프리미엄 기능</Text> : null}

        <View style={styles.card}>
          {FEATURES.map((f) => (
            <View key={f.title} style={styles.feature}>
              <Text style={styles.featureIcon}>{f.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.featureTitle}>{f.title}</Text>
                <Text style={styles.featureDesc}>{f.desc}</Text>
              </View>
            </View>
          ))}
          <Text style={styles.free}>기록, 알림, 가족 공유, 오늘·7일 통계는 계속 무료예요.</Text>
        </View>

        {p.isPremium ? (
          <View style={[styles.card, { alignItems: 'center' }]}>
            <Text style={styles.featureTitle}>지금 프리미엄을 쓰고 있어요 ✅</Text>
            {TEST_MODE && (
              <Pressable onPress={() => p.setTestPremium(false)} style={[styles.secondary, { marginTop: 12 }]}>
                <Text style={styles.secondaryText}>테스트: 프리미엄 끄기</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <>
            {p.plans.map((pl) => (
              <Pressable
                key={pl.id}
                onPress={() => setSelected(pl.id)}
                style={[styles.plan, selected === pl.id && styles.planOn]}
              >
                <View style={[styles.radio, selected === pl.id && styles.radioOn]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.planTitle}>{pl.title}</Text>
                  {pl.note ? <Text style={styles.planNote}>{pl.note}</Text> : null}
                </View>
                <Text style={styles.planPrice}>{pl.price}</Text>
              </Pressable>
            ))}

            <Pressable onPress={onBuy} disabled={busy} style={styles.buy}>
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buyText}>{TEST_MODE ? '테스트로 프리미엄 켜기' : '구독 시작하기'}</Text>
              )}
            </Pressable>
            {TEST_MODE ? (
              <Text style={styles.fine}>
                아직 구글 플레이 결제가 연결되기 전이라 테스트 모드예요. 버튼을 눌러도 돈이 나가지 않아요.
              </Text>
            ) : (
              <>
                <Text style={styles.fine}>
                  구글 플레이 계정으로 결제되고, 기간이 끝나면 자동으로 갱신돼요. 언제든 구글 플레이 → 결제 및 정기
                  결제에서 해지할 수 있어요.
                </Text>
                <Pressable onPress={onRestore} disabled={busy} style={styles.secondary}>
                  <Text style={styles.secondaryText}>이미 구독했어요 (구매 복원)</Text>
                </Pressable>
              </>
            )}
          </>
        )}
      </ScrollView>
    </Modal>
  );
}

/** 잠긴 기능 자리에 보여 주는 카드 */
export function Locked({ title, desc, reason }: { title: string; desc: string; reason: string }) {
  const { openPaywall } = usePremium();
  return (
    <Pressable onPress={() => openPaywall(reason)} style={styles.locked}>
      <Text style={styles.lockIcon}>🔒</Text>
      <Text style={styles.lockedTitle}>{title}</Text>
      <Text style={styles.lockedDesc}>{desc}</Text>
      <View style={styles.lockedBtn}>
        <Text style={styles.lockedBtnText}>⭐ 프리미엄으로 보기</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 48 },
  close: { alignSelf: 'flex-end', padding: 4 },
  closeText: { fontSize: 22, color: C.sub },
  badge: { fontSize: 15, fontWeight: '800', color: C.feedDeep, marginTop: 4 },
  title: { fontSize: 24, fontWeight: '800', color: C.text, marginTop: 6 },
  reason: { fontSize: 14, color: C.sub, marginTop: 6 },
  card: {
    backgroundColor: C.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: C.line,
    marginTop: 18,
  },
  feature: { flexDirection: 'row', gap: 12, marginBottom: 14 },
  featureIcon: { fontSize: 26 },
  featureTitle: { fontSize: 16, fontWeight: '800', color: C.text },
  featureDesc: { fontSize: 14, color: C.sub, marginTop: 2 },
  free: { fontSize: 13, color: C.sub, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 12 },
  plan: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: C.line,
    padding: 16,
    marginTop: 12,
  },
  planOn: { borderColor: C.feedDeep, backgroundColor: '#FFF3EC' },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: C.sub },
  radioOn: { borderColor: C.feedDeep, borderWidth: 6 },
  planTitle: { fontSize: 17, fontWeight: '800', color: C.text },
  planNote: { fontSize: 13, color: C.feedDeep, marginTop: 2, fontWeight: '600' },
  planPrice: { fontSize: 18, fontWeight: '800', color: C.text },
  buy: {
    backgroundColor: C.feedDeep,
    borderRadius: 16,
    paddingVertical: 17,
    alignItems: 'center',
    marginTop: 18,
  },
  buyText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  fine: { fontSize: 12, color: C.sub, marginTop: 10, textAlign: 'center', lineHeight: 18 },
  secondary: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 14 },
  secondaryText: { color: C.sub, fontSize: 14, textDecorationLine: 'underline' },
  locked: {
    backgroundColor: C.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.line,
    padding: 22,
    alignItems: 'center',
    marginTop: 12,
  },
  lockIcon: { fontSize: 30 },
  lockedTitle: { fontSize: 17, fontWeight: '800', color: C.text, marginTop: 6 },
  lockedDesc: { fontSize: 14, color: C.sub, marginTop: 6, textAlign: 'center', lineHeight: 20 },
  lockedBtn: { backgroundColor: C.feedDeep, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 18, marginTop: 14 },
  lockedBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
