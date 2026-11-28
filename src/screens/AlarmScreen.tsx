import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { listMembers, type Family, type Member } from '../family';
import { durationLabel, timeLabel } from '../format';
import { QUIET_END_HOUR, QUIET_START_HOUR, nextFeedAt, type ReminderSettings } from '../reminders';
import type { ButtonFeedback } from '../sounds';
import { C } from '../theme';

const CHOICES = [90, 120, 150, 180, 210, 240];

type Props = {
  settings: ReminderSettings;
  onChange: (s: ReminderSettings) => void;
  permission: 'granted' | 'denied' | 'unknown';
  onAskPermission: () => void;
  lastFeedIso?: string;
  now: number;
  feedback: ButtonFeedback;
  onFeedbackChange: (f: ButtonFeedback) => void;
  family: Family | null;
  nightDuty: string | null;
  onNightDutyChange: (userId: string | null) => void;
};

export default function AlarmScreen({
  settings,
  onChange,
  permission,
  onAskPermission,
  lastFeedIso,
  now,
  feedback,
  onFeedbackChange,
  family,
  nightDuty,
  onNightDutyChange,
}: Props) {
  const set = (patch: Partial<ReminderSettings>) => onChange({ ...settings, ...patch });
  const [members, setMembers] = useState<Member[]>([]);
  useEffect(() => {
    if (!family) return;
    listMembers(family.babyId).then(setMembers, () => {});
  }, [family]);
  const due = nextFeedAt(lastFeedIso, settings);

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>알림 · 소리</Text>

      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>알림 받기</Text>
            <Text style={styles.help}>마지막 수유 후 정한 시간이 지나면 알려 드려요.</Text>
          </View>
          <Switch
            value={settings.enabled}
            onValueChange={(v) => {
              set({ enabled: v });
              if (v && permission !== 'granted') onAskPermission();
            }}
            trackColor={{ true: C.feedDeep, false: C.line }}
            thumbColor="#fff"
          />
        </View>
      </View>

      {settings.enabled && permission === 'denied' && (
        <Pressable style={[styles.card, styles.warn]} onPress={onAskPermission}>
          <Text style={styles.warnText}>
            휴대폰에서 알림이 꺼져 있어요. 여기를 눌러 허용하거나, 휴대폰 설정 → 애플리케이션 → Expo Go → 알림에서 켜
            주세요.
          </Text>
        </Pressable>
      )}

      <Text style={styles.section}>수유 간격</Text>
      <View style={[styles.card, !settings.enabled && styles.dim]}>
        <View style={styles.stepper}>
          <Pressable
            style={styles.stepBtn}
            onPress={() => set({ intervalMin: Math.max(30, settings.intervalMin - 15) })}
          >
            <Text style={styles.stepText}>−</Text>
          </Pressable>
          <View style={{ alignItems: 'center', minWidth: 160 }}>
            <Text style={styles.big}>{durationLabel(settings.intervalMin * 60000)}</Text>
            <Text style={styles.help}>마다</Text>
          </View>
          <Pressable
            style={styles.stepBtn}
            onPress={() => set({ intervalMin: Math.min(8 * 60, settings.intervalMin + 15) })}
          >
            <Text style={styles.stepText}>+</Text>
          </Pressable>
        </View>
        <View style={styles.chips}>
          {CHOICES.map((m) => (
            <Pressable
              key={m}
              onPress={() => set({ intervalMin: m })}
              style={[styles.chip, settings.intervalMin === m && styles.chipOn]}
            >
              <Text style={[styles.chipText, settings.intervalMin === m && { color: '#fff' }]}>
                {durationLabel(m * 60000)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <Text style={styles.section}>밤에는</Text>
      <View style={[styles.card, !settings.enabled && styles.dim]}>
        <View style={styles.rowBetween}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>밤에는 조용히</Text>
            <Text style={styles.help}>
              밤 {QUIET_START_HOUR - 12}시 ~ 아침 {QUIET_END_HOUR}시에는 소리·진동 없이 알림만 와요.
            </Text>
          </View>
          <Switch
            value={settings.quietNight}
            onValueChange={(v) => set({ quietNight: v })}
            trackColor={{ true: C.sleepDeep, false: C.line }}
            thumbColor="#fff"
          />
        </View>
        <View style={[styles.rowBetween, { marginTop: 14 }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>밤 화면</Text>
            <Text style={styles.help}>밤에는 화면을 어둡게 해서 눈부시지 않게 해요.</Text>
          </View>
          <Switch
            value={settings.nightScreen}
            onValueChange={(v) => set({ nightScreen: v })}
            trackColor={{ true: C.sleepDeep, false: C.line }}
            thumbColor="#fff"
          />
        </View>
      </View>

      <Text style={styles.section}>🌙 밤 당번</Text>
      <View style={styles.card}>
        {!family ? (
          <Text style={styles.help}>
            가족 공유를 켜면, 밤에는 당번 한 사람 휴대폰에만 수유 알림이 울리게 할 수 있어요. 다른 사람은 푹 자요.
          </Text>
        ) : (
          <>
            <Text style={styles.help}>
              밤 {QUIET_START_HOUR - 12}시 ~ 아침 {QUIET_END_HOUR}시에는 당번 휴대폰에만 알림이 울려요. 낮에는 모두에게
              와요.
            </Text>
            <View style={styles.chips}>
              <Pressable
                onPress={() => onNightDutyChange(null)}
                style={[styles.chip, nightDuty === null && styles.dutyOn]}
              >
                <Text style={[styles.chipText, nightDuty === null && { color: '#fff' }]}>모두</Text>
              </Pressable>
              {members.map((m) => (
                <Pressable
                  key={m.userId}
                  onPress={() => onNightDutyChange(m.userId)}
                  style={[styles.chip, nightDuty === m.userId && styles.dutyOn]}
                >
                  <Text style={[styles.chipText, nightDuty === m.userId && { color: '#fff' }]}>
                    {m.name}
                    {m.userId === family.userId ? ' (나)' : ''}
                  </Text>
                </Pressable>
              ))}
            </View>
            {nightDuty && (
              <Text style={[styles.help, { marginTop: 10 }]}>
                {nightDuty === family.userId
                  ? '오늘 밤은 내가 당번이에요. 밤 알림이 이 휴대폰에 와요.'
                  : `오늘 밤 당번: ${members.find((m) => m.userId === nightDuty)?.name ?? '다른 가족'}. 이 휴대폰은 밤에 울리지 않아요.`}
              </Text>
            )}
          </>
        )}
      </View>

      <Text style={styles.section}>다음 알림</Text>
      <View style={styles.card}>
        <Text style={styles.label}>
          {!settings.enabled
            ? '알림이 꺼져 있어요.'
            : due === null
              ? '수유를 기록하면 다음 알림 시각이 정해져요.'
              : due <= now
                ? `예정 시각(${timeLabel(new Date(due).toISOString())})이 지났어요. 수유하면 기록해 주세요.`
                : `${timeLabel(new Date(due).toISOString())}에 알려 드릴게요.`}
        </Text>
        {settings.enabled && (
          <Text style={[styles.help, { marginTop: 6 }]}>
            그때까지 수유 기록이 없으면 30분 뒤에 한 번 더 알려 드려요.
          </Text>
        )}
      </View>

      <Text style={styles.section}>기록 버튼 소리</Text>
      <View style={styles.card}>
        <ToggleRow
          label="버튼 소리"
          help="수유·기저귀·수면 버튼을 누르면 짧은 소리가 나요."
          value={feedback.sound}
          onChange={(v) => onFeedbackChange({ ...feedback, sound: v })}
        />
        <View style={styles.divider} />
        <ToggleRow
          label="밤에는 소리 끄기"
          help={`밤 ${QUIET_START_HOUR - 12}시 ~ 아침 ${QUIET_END_HOUR}시에는 아기가 깨지 않게 소리 없이 기록해요.`}
          value={feedback.quietNight}
          onChange={(v) => onFeedbackChange({ ...feedback, quietNight: v })}
          disabled={!feedback.sound}
        />
        <View style={styles.divider} />
        <ToggleRow
          label="진동"
          help="버튼을 누르면 살짝 진동해요."
          value={feedback.vibrate}
          onChange={(v) => onFeedbackChange({ ...feedback, vibrate: v })}
        />
      </View>
    </ScrollView>
  );
}

function ToggleRow({
  label,
  help,
  value,
  onChange,
  disabled,
}: {
  label: string;
  help: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <View style={[styles.rowBetween, disabled && styles.dim]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.help}>{help}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ true: C.feedDeep, false: C.line }}
        thumbColor="#fff"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: '800', color: C.text, marginTop: 4, marginBottom: 14 },
  dutyOn: { backgroundColor: C.sleepDeep, borderColor: C.sleepDeep },
  section: { fontSize: 15, fontWeight: '700', color: C.sub, marginTop: 22, marginBottom: 8 },
  card: { backgroundColor: C.card, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: C.line },
  dim: { opacity: 0.45 },
  divider: { height: 1, backgroundColor: C.line, marginVertical: 12 },
  warn: { marginTop: 10, backgroundColor: '#FFF1F0', borderColor: '#F5C2C0' },
  warnText: { color: C.danger, fontSize: 14, lineHeight: 20 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  label: { fontSize: 16, fontWeight: '700', color: C.text },
  help: { fontSize: 13, color: C.sub, marginTop: 2 },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  stepBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: C.feed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: { fontSize: 28, fontWeight: '700', color: C.feedDeep },
  big: { fontSize: 28, fontWeight: '800', color: C.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  chip: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: C.line },
  chipOn: { backgroundColor: C.feedDeep, borderColor: C.feedDeep },
  chipText: { fontSize: 14, fontWeight: '600', color: C.text },
});
