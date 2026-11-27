import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { createFamily, joinFamily, leaveFamily, listMembers, type Family, type Member } from '../family';
import type { LogEntry } from '../types';
import { cloudReady } from '../supabase';
import { C } from '../theme';

const NAMES = ['엄마', '아빠', '할머니', '할아버지'];

type Props = {
  family: Family | null;
  onFamilyChange: (f: Family | null) => void;
  loadLocalEntries: () => Promise<LogEntry[]>;
};

export default function FamilyScreen({ family, onFamilyChange, loadLocalEntries }: Props) {
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>가족 공유</Text>
        {!cloudReady ? (
          <View style={styles.card}>
            <Text style={styles.label}>아직 준비 중이에요</Text>
            <Text style={styles.help}>
              클라우드 설정을 마치면 가족이 같은 아기 기록을 함께 보고 쓸 수 있어요. 그전까지는 이 휴대폰에만 저장돼요.
            </Text>
          </View>
        ) : family ? (
          <Joined family={family} onLeft={() => onFamilyChange(null)} />
        ) : (
          <Setup onDone={onFamilyChange} loadLocalEntries={loadLocalEntries} />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Setup({
  onDone,
  loadLocalEntries,
}: {
  onDone: (f: Family) => void;
  loadLocalEntries: () => Promise<LogEntry[]>;
}) {
  const [myName, setMyName] = useState('');
  const [babyName, setBabyName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [localCount, setLocalCount] = useState(0);

  useEffect(() => {
    loadLocalEntries().then((l) => setLocalCount(l.length));
  }, [loadLocalEntries]);

  const needName = () => {
    if (myName.trim()) return false;
    Alert.alert('내 호칭을 먼저 골라 주세요', '기록 옆에 누가 기록했는지 보여 줄 때 써요.');
    return true;
  };

  const create = async () => {
    if (needName() || busy) return;
    setBusy('create');
    try {
      const local = await loadLocalEntries();
      onDone(await createFamily(babyName.trim() || '우리 아기', myName.trim(), local));
    } catch (e) {
      Alert.alert('가족을 만들지 못했어요', (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const join = async () => {
    if (needName() || busy) return;
    if (code.trim().length < 6) {
      Alert.alert('초대 코드 6자리를 입력해 주세요');
      return;
    }
    setBusy('join');
    try {
      onDone(await joinFamily(code.trim(), myName.trim()));
    } catch (e) {
      Alert.alert('참여하지 못했어요', (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <View>
      <Text style={styles.lead}>가족이 같은 아기 기록을 실시간으로 함께 보고 쓸 수 있어요.</Text>

      <Text style={styles.section}>1. 나는 아기의</Text>
      <View style={styles.card}>
        <View style={styles.chips}>
          {NAMES.map((n) => (
            <Pressable key={n} onPress={() => setMyName(n)} style={[styles.chip, myName === n && styles.chipOn]}>
              <Text style={[styles.chipText, myName === n && { color: '#fff' }]}>{n}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          value={myName}
          onChangeText={setMyName}
          placeholder="직접 쓰기 (예: 이모)"
          placeholderTextColor={C.sub}
          style={styles.input}
          maxLength={10}
        />
      </View>

      <Text style={styles.section}>2-A. 처음 시작해요</Text>
      <View style={styles.card}>
        <TextInput
          value={babyName}
          onChangeText={setBabyName}
          placeholder="아기 이름이나 태명 (예: 콩이)"
          placeholderTextColor={C.sub}
          style={[styles.input, { marginTop: 0 }]}
          maxLength={20}
        />
        {localCount > 0 && (
          <Text style={[styles.help, { marginTop: 8 }]}>
            지금까지 이 휴대폰에 쌓인 기록 {localCount}개도 함께 옮겨요.
          </Text>
        )}
        <Pressable style={[styles.button, { backgroundColor: C.feedDeep }]} onPress={create}>
          {busy === 'create' ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>가족 공유 시작하기</Text>
          )}
        </Pressable>
      </View>

      <Text style={styles.section}>2-B. 초대 코드를 받았어요</Text>
      <View style={styles.card}>
        <TextInput
          value={code}
          onChangeText={(t) => setCode(t.toUpperCase().replace(/[^0-9A-Z]/g, ''))}
          placeholder="초대 코드 6자리"
          placeholderTextColor={C.sub}
          style={[styles.input, styles.codeInput, { marginTop: 0 }]}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={6}
        />
        <Pressable style={[styles.button, { backgroundColor: C.diaperDeep }]} onPress={join}>
          {busy === 'join' ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>참여하기</Text>}
        </Pressable>
      </View>
    </View>
  );
}

function Joined({ family, onLeft }: { family: Family; onLeft: () => void }) {
  const [members, setMembers] = useState<Member[] | null>(null);

  useEffect(() => {
    listMembers(family.babyId)
      .then(setMembers)
      .catch(() => setMembers([]));
  }, [family.babyId]);

  const share = () =>
    Share.share({
      message: `[아기 기록] ${family.babyName} 기록을 같이 봐요!\n앱의 '가족' 메뉴에서 초대 코드 ${family.inviteCode} 를 입력해 주세요.`,
    });

  const leave = () =>
    Alert.alert(
      '이 휴대폰의 가족 공유를 그만할까요?',
      '다른 가족의 기록은 그대로 남아요. 다시 하려면 초대 코드로 참여하면 돼요.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '그만하기',
          style: 'destructive',
          onPress: async () => {
            await leaveFamily(family);
            onLeft();
          },
        },
      ],
    );

  return (
    <View>
      <View style={[styles.card, { alignItems: 'center', backgroundColor: C.feed, borderColor: C.feed }]}>
        <Text style={styles.help}>함께 보고 있는 아기</Text>
        <Text style={styles.babyName}>{family.babyName}</Text>
        <Text style={[styles.help, { marginTop: 14 }]}>초대 코드</Text>
        <Text style={styles.code}>{family.inviteCode}</Text>
        <Pressable style={[styles.button, { backgroundColor: C.feedDeep, alignSelf: 'stretch' }]} onPress={share}>
          <Text style={styles.buttonText}>가족에게 초대 코드 보내기</Text>
        </Pressable>
        <Text style={[styles.help, { marginTop: 10, textAlign: 'center' }]}>
          가족이 앱의 '가족' 메뉴에서 이 코드를 입력하면 함께 기록할 수 있어요.
        </Text>
      </View>

      <Text style={styles.section}>함께하는 가족</Text>
      <View style={styles.card}>
        {members === null ? (
          <ActivityIndicator color={C.sub} />
        ) : members.length === 0 ? (
          <Text style={styles.help}>가족 목록을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.</Text>
        ) : (
          members.map((m) => (
            <View key={m.userId} style={styles.memberRow}>
              <Text style={styles.memberName}>{m.name}</Text>
              {m.userId === family.userId && <Text style={styles.meBadge}>나</Text>}
            </View>
          ))
        )}
      </View>

      <Pressable onPress={leave} style={{ marginTop: 28, alignItems: 'center' }}>
        <Text style={{ color: C.danger, fontSize: 14 }}>이 휴대폰 가족 공유 그만하기</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: '800', color: C.text, marginTop: 4, marginBottom: 10 },
  lead: { fontSize: 15, color: C.text, marginBottom: 4, lineHeight: 22 },
  section: { fontSize: 15, fontWeight: '700', color: C.sub, marginTop: 20, marginBottom: 8 },
  card: { backgroundColor: C.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.line },
  label: { fontSize: 16, fontWeight: '700', color: C.text },
  help: { fontSize: 13, color: C.sub, marginTop: 2, lineHeight: 19 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 9, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: C.line },
  chipOn: { backgroundColor: C.feedDeep, borderColor: C.feedDeep },
  chipText: { fontSize: 15, fontWeight: '600', color: C.text },
  input: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: C.text,
    backgroundColor: '#FFFDFB',
  },
  codeInput: { fontSize: 24, fontWeight: '800', letterSpacing: 6, textAlign: 'center' },
  button: { marginTop: 12, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  babyName: { fontSize: 24, fontWeight: '800', color: C.text, marginTop: 2 },
  code: { fontSize: 38, fontWeight: '800', color: C.feedDeep, letterSpacing: 8, marginTop: 2 },
  memberRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  memberName: { fontSize: 16, color: C.text, fontWeight: '600' },
  meBadge: {
    marginLeft: 8,
    fontSize: 12,
    color: '#fff',
    backgroundColor: C.sub,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: 'hidden',
  },
});
