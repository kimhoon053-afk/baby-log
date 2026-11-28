import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, Pressable, SectionList, Share, StyleSheet, Text, View } from 'react-native';

import {
  agoLabel,
  dayKey,
  dayTitle,
  durationLabel,
  entryEmoji,
  entryTitle,
  sleepingFor,
  timeLabel,
} from '../format';
import { nextFeedAt, type ReminderSettings } from '../reminders';
import { playButton, type ButtonFeedback } from '../sounds';
import { todaySummaryText } from '../summary';
import type { StoreContext } from '../store';
import { newId } from '../storage';
import { C } from '../theme';
import type { DiaperType, FeedType, LogEntry } from '../types';

type Props = {
  entries: LogEntry[];
  reload: () => Promise<void>;
  now: number;
  setNow: (n: number) => void;
  reminder: ReminderSettings;
  onOpenAlarm: () => void;
  ctx: StoreContext;
  title: string;
  feedback: ButtonFeedback;
};

export default function LogScreen({ entries, reload, now, setNow, reminder, onOpenAlarm, ctx, title, feedback }: Props) {
  const { store } = ctx;
  const [formulaOpen, setFormulaOpen] = useState(false);
  const [formulaMl, setFormulaMl] = useState(120);
  const [toast, setToast] = useState<{ text: string; undoId?: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 마지막으로 먹인 분유 양을 기억해 두었다가 다음에 기본값으로 씁니다.
  useEffect(() => {
    const lastFormula = entries.find((e) => e.subtype === 'formula');
    if (lastFormula?.amountMl) setFormulaMl(lastFormula.amountMl);
  }, [entries]);

  const showToast = (text: string, undoId?: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ text, undoId });
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  };

  const add = async (partial: Pick<LogEntry, 'kind' | 'subtype'> & Partial<LogEntry>, label: string) => {
    playButton(partial.kind, feedback);
    const t = new Date().toISOString();
    const entry: LogEntry = {
      id: newId(),
      babyId: ctx.babyId,
      startAt: t,
      createdAt: t,
      updatedAt: t,
      createdBy: ctx.me,
      createdByName: ctx.myName,
      ...partial,
    };
    if (!(await attempt(() => store.save(entry)))) return;
    setNow(Date.now());
    showToast(`${label} 기록했어요`, entry.id);
  };

  // 저장·삭제를 시도하고, 실패하면 (주로 인터넷 문제) 알려 줍니다.
  const attempt = async (fn: () => Promise<void>): Promise<boolean> => {
    try {
      await fn();
      await reload().catch(() => {});
      return true;
    } catch {
      showToast('저장하지 못했어요. 인터넷 연결을 확인해 주세요.');
      return false;
    }
  };

  const undo = async (id: string) => {
    setToast(null);
    await attempt(() => store.remove(id));
  };

  const feed = (subtype: FeedType, label: string, amountMl?: number) =>
    add({ kind: 'feed', subtype, amountMl }, label);
  const diaper = (subtype: DiaperType, label: string) => add({ kind: 'diaper', subtype }, label);

  const sleeping = entries.find((e) => e.kind === 'sleep' && !e.endAt);

  const toggleSleep = async () => {
    if (sleeping) {
      playButton('wake', feedback);
      const t = new Date().toISOString();
      if (!(await attempt(() => store.save({ ...sleeping, endAt: t, updatedAt: t })))) return;
      setNow(Date.now());
      showToast('깼어요 기록했어요');
    } else {
      await add({ kind: 'sleep', subtype: 'sleep' }, '잠들었어요');
    }
  };

  const confirmDelete = (e: LogEntry) => {
    Alert.alert('이 기록을 지울까요?', `${timeLabel(e.startAt)} ${entryTitle(e, now)}`, [
      { text: '취소', style: 'cancel' },
      {
        text: '지우기',
        style: 'destructive',
        onPress: async () => {
          await attempt(() => store.remove(e.id));
        },
      },
    ]);
  };

  const lastFeed = entries.find((e) => e.kind === 'feed');
  const lastDiaper = entries.find((e) => e.kind === 'diaper');

  const sections = useMemo(() => {
    const map = new Map<string, LogEntry[]>();
    for (const e of entries) {
      const k = dayKey(e.startAt);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(e);
    }
    return [...map.values()].map((data) => ({ title: dayTitle(data[0].startAt, now), data }));
  }, [entries, now]);

  const header = (
    <View>
      <View style={styles.titleRow}>
        <Text style={styles.appTitle}>{title}</Text>
        <Pressable
          onPress={() =>
            Share.share({ message: todaySummaryText(entries, now, title.replace(/ 기록$/, '').replace('아기', '우리 아기')) }).catch(
              () => {},
            )
          }
          style={styles.shareBtn}
          hitSlop={8}
        >
          <Text style={styles.shareText}>💬 오늘 요약 보내기</Text>
        </Pressable>
      </View>

      <NextFeedCard lastFeedIso={lastFeed?.startAt} reminder={reminder} now={now} onPress={onOpenAlarm} />

      <View style={styles.summaryRow}>
        <SummaryBox
          label="마지막 수유"
          value={lastFeed ? agoLabel(lastFeed.startAt, now) : '아직 없어요'}
          color={C.feedDeep}
        />
        <SummaryBox
          label="마지막 기저귀"
          value={lastDiaper ? agoLabel(lastDiaper.startAt, now) : '아직 없어요'}
          color={C.diaperDeep}
        />
      </View>

      <Text style={styles.groupTitle}>수유</Text>
      <View style={styles.row}>
        <BigButton emoji="🤱" label="모유 왼쪽" bg={C.feed} onPress={() => feed('breast_left', '모유 왼쪽')} />
        <BigButton emoji="🤱" label="모유 오른쪽" bg={C.feed} onPress={() => feed('breast_right', '모유 오른쪽')} />
        <BigButton emoji="🍼" label="분유" bg={C.feed} onPress={() => setFormulaOpen(true)} />
      </View>

      <Text style={styles.groupTitle}>기저귀</Text>
      <View style={styles.row}>
        <BigButton emoji="💧" label="소변" bg={C.diaper} onPress={() => diaper('pee', '소변')} />
        <BigButton emoji="💩" label="대변" bg={C.diaper} onPress={() => diaper('poop', '대변')} />
      </View>

      <Text style={styles.groupTitle}>수면</Text>
      <View style={styles.row}>
        <BigButton
          emoji={sleeping ? '🌞' : '😴'}
          label={sleeping ? `깼어요\n(자는 중 · ${sleepingFor(sleeping.startAt, now)})` : '잠들었어요'}
          bg={sleeping ? C.sleepDeep : C.sleep}
          fg={sleeping ? '#fff' : C.text}
          onPress={toggleSleep}
        />
      </View>

      <Text style={[styles.groupTitle, { marginTop: 28 }]}>기록</Text>
      {entries.length === 0 && (
        <Text style={styles.empty}>위 버튼을 누르면 여기에 기록이 쌓여요.</Text>
      )}
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <SectionList
        sections={sections}
        keyExtractor={(e) => e.id}
        ListHeaderComponent={header}
        contentContainerStyle={styles.content}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => <Text style={styles.dayTitle}>{section.title}</Text>}
        renderItem={({ item }) => (
          <Pressable onLongPress={() => confirmDelete(item)} style={styles.item}>
            <Text style={styles.itemTime}>{timeLabel(item.startAt)}</Text>
            <Text style={styles.itemEmoji}>{entryEmoji(item)}</Text>
            <Text style={styles.itemTitle}>{entryTitle(item, now)}</Text>
            {item.createdByName ? <Text style={styles.itemWho}>{item.createdByName}</Text> : null}
          </Pressable>
        )}
        ListFooterComponent={
          entries.length > 0 ? <Text style={styles.hint}>기록을 길게 누르면 지울 수 있어요.</Text> : undefined
        }
      />

      {toast && (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{toast.text}</Text>
          {toast.undoId && (
            <Pressable onPress={() => undo(toast.undoId!)} hitSlop={12}>
              <Text style={styles.toastUndo}>되돌리기</Text>
            </Pressable>
          )}
        </View>
      )}

      <FormulaModal
        visible={formulaOpen}
        ml={formulaMl}
        setMl={setFormulaMl}
        onCancel={() => setFormulaOpen(false)}
        onSave={() => {
          setFormulaOpen(false);
          feed('formula', `분유 ${formulaMl}ml`, formulaMl);
        }}
      />
    </View>
  );
}

function NextFeedCard({
  lastFeedIso,
  reminder,
  now,
  onPress,
}: {
  lastFeedIso?: string;
  reminder: ReminderSettings;
  now: number;
  onPress: () => void;
}) {
  const due = nextFeedAt(lastFeedIso, reminder);
  let main: string;
  let sub: string;
  let progress = 0;
  let late = false;
  if (!reminder.enabled) {
    main = '수유 알림 꺼짐';
    sub = '눌러서 수유 간격을 정하고 알림을 켜 보세요';
  } else if (due === null || !lastFeedIso) {
    main = '수유를 기록해 주세요';
    sub = `기록하면 ${durationLabel(reminder.intervalMin * 60000)} 뒤에 알려 드려요`;
  } else {
    const left = due - now;
    const total = reminder.intervalMin * 60000;
    progress = Math.min(1, Math.max(0, 1 - left / total));
    late = left <= 0;
    main = late ? `${durationLabel(-left)} 지났어요` : `${durationLabel(left)} 남았어요`;
    sub = `${timeLabel(new Date(due).toISOString())} 예정 · ${durationLabel(total)}마다 알림`;
  }
  return (
    <Pressable onPress={onPress} style={[styles.nextCard, late && { backgroundColor: '#FFE9E6' }]}>
      <Text style={styles.nextLabel}>⏰ 다음 수유까지</Text>
      <Text style={[styles.nextMain, late && { color: C.danger }]}>{main}</Text>
      {reminder.enabled && due !== null && (
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${progress * 100}%`, backgroundColor: late ? C.danger : C.feedDeep },
            ]}
          />
        </View>
      )}
      <Text style={styles.nextSub}>{sub}</Text>
    </Pressable>
  );
}

function SummaryBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.summaryBox}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, { color }]}>{value}</Text>
    </View>
  );
}

function BigButton({
  emoji,
  label,
  bg,
  fg = C.text,
  onPress,
}: {
  emoji: string;
  label: string;
  bg: string;
  fg?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.bigBtn, { backgroundColor: bg, opacity: pressed ? 0.7 : 1 }]}
    >
      <Text style={styles.bigEmoji}>{emoji}</Text>
      <Text style={[styles.bigLabel, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

const PRESETS = [60, 80, 100, 120, 150, 180];

function FormulaModal({
  visible,
  ml,
  setMl,
  onCancel,
  onSave,
}: {
  visible: boolean;
  ml: number;
  setMl: (n: number) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel} />
      <View style={styles.sheet}>
        <Text style={styles.sheetTitle}>🍼 분유 얼마나 먹었나요?</Text>
        <View style={styles.stepper}>
          <Pressable style={styles.stepBtn} onPress={() => setMl(Math.max(10, ml - 10))}>
            <Text style={styles.stepText}>−</Text>
          </Pressable>
          <Text style={styles.mlText}>{ml}ml</Text>
          <Pressable style={styles.stepBtn} onPress={() => setMl(Math.min(400, ml + 10))}>
            <Text style={styles.stepText}>+</Text>
          </Pressable>
        </View>
        <View style={styles.presets}>
          {PRESETS.map((p) => (
            <Pressable
              key={p}
              onPress={() => setMl(p)}
              style={[styles.preset, p === ml && { backgroundColor: C.feedDeep, borderColor: C.feedDeep }]}
            >
              <Text style={[styles.presetText, p === ml && { color: '#fff' }]}>{p}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.sheetActions}>
          <Pressable style={[styles.actionBtn, { backgroundColor: C.line }]} onPress={onCancel}>
            <Text style={styles.actionText}>취소</Text>
          </Pressable>
          <Pressable style={[styles.actionBtn, { backgroundColor: C.feedDeep, flex: 2 }]} onPress={onSave}>
            <Text style={[styles.actionText, { color: '#fff' }]}>기록하기</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 120 },
  appTitle: { fontSize: 26, fontWeight: '800', color: C.text, flexShrink: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4, marginBottom: 14, gap: 8 },
  shareBtn: { backgroundColor: '#FEE500', borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12 },
  shareText: { color: '#3A1D1D', fontWeight: '800', fontSize: 13 },
  nextCard: { backgroundColor: C.feed, borderRadius: 20, padding: 18, marginBottom: 10 },
  nextLabel: { fontSize: 14, fontWeight: '700', color: C.feedDeep },
  nextMain: { fontSize: 30, fontWeight: '800', color: C.text, marginTop: 4 },
  progressTrack: { height: 8, backgroundColor: 'rgba(255,255,255,0.7)', borderRadius: 4, marginTop: 12, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4 },
  nextSub: { fontSize: 13, color: C.text, marginTop: 8, opacity: 0.75 },
  summaryRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  summaryBox: {
    flex: 1,
    backgroundColor: C.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: C.line,
  },
  summaryLabel: { fontSize: 13, color: C.sub, marginBottom: 4 },
  summaryValue: { fontSize: 18, fontWeight: '700' },
  groupTitle: { fontSize: 15, fontWeight: '700', color: C.sub, marginTop: 18, marginBottom: 8 },
  row: { flexDirection: 'row', gap: 10 },
  bigBtn: {
    flex: 1,
    minHeight: 92,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    paddingVertical: 12,
  },
  bigEmoji: { fontSize: 30, marginBottom: 6 },
  bigLabel: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
  empty: { color: C.sub, fontSize: 15, paddingVertical: 12 },
  dayTitle: { fontSize: 14, fontWeight: '700', color: C.text, marginTop: 10, marginBottom: 6 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.card,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: C.line,
  },
  itemTime: { width: 78, fontSize: 14, color: C.sub, fontVariant: ['tabular-nums'] },
  itemEmoji: { fontSize: 20, marginRight: 10 },
  itemWho: { marginLeft: 'auto', paddingLeft: 8, fontSize: 13, color: C.sub },
  itemTitle: { fontSize: 16, color: C.text, fontWeight: '600', flexShrink: 1 },
  hint: { textAlign: 'center', color: C.sub, fontSize: 13, marginTop: 8 },
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 32,
    backgroundColor: C.text,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toastText: { color: '#fff', fontSize: 15, flexShrink: 1 },
  toastUndo: { color: '#FFC79E', fontSize: 15, fontWeight: '700', marginLeft: 12 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    backgroundColor: C.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 36,
  },
  sheetTitle: { fontSize: 19, fontWeight: '800', color: C.text, textAlign: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginVertical: 18 },
  stepBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: C.feed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: { fontSize: 30, fontWeight: '700', color: C.feedDeep },
  mlText: { fontSize: 36, fontWeight: '800', color: C.text, minWidth: 150, textAlign: 'center' },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  preset: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: C.line,
  },
  presetText: { fontSize: 15, fontWeight: '600', color: C.text },
  sheetActions: { flexDirection: 'row', gap: 10, marginTop: 22 },
  actionBtn: { flex: 1, paddingVertical: 16, borderRadius: 16, alignItems: 'center' },
  actionText: { fontSize: 17, fontWeight: '700', color: C.text },
});
