import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';

import {
  DEFAULT_REMINDER,
  ensurePermission,
  loadReminder,
  rescheduleFeedReminder,
  saveReminder,
  type ReminderSettings,
} from './src/reminders';
import { syncPushDevice } from './src/push';
import AlarmScreen from './src/screens/AlarmScreen';
import { DEFAULT_FEEDBACK, loadFeedback, saveFeedback, type ButtonFeedback } from './src/sounds';
import LogScreen from './src/screens/LogScreen';
import StatsScreen from './src/screens/StatsScreen';
import { subscribeLogs } from './src/cloudStore';
import { loadFamily, type Family } from './src/family';
import FamilyScreen from './src/screens/FamilyScreen';
import { localStore } from './src/storage';
import { LOCAL_BABY_ID, storeFor } from './src/store';
import { C } from './src/theme';
import type { LogEntry } from './src/types';

type Tab = 'log' | 'stats' | 'alarm' | 'family';

export default function App() {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
        <StatusBar style="dark" />
        <Main />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function Main() {
  const [tab, setTab] = useState<Tab>('log');
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [now, setNow] = useState(Date.now());
  const [reminder, setReminder] = useState<ReminderSettings>(DEFAULT_REMINDER);
  const [reminderLoaded, setReminderLoaded] = useState(false);
  const [permission, setPermission] = useState<'granted' | 'denied' | 'unknown'>('unknown');

  const [feedback, setFeedback] = useState<ButtonFeedback>(DEFAULT_FEEDBACK);
  const [family, setFamily] = useState<Family | null>(null);
  const [familyLoaded, setFamilyLoaded] = useState(false);
  const ctx = useMemo(() => storeFor(family), [family]);

  const reload = useCallback(async () => {
    try {
      setEntries(await ctx.store.list(ctx.babyId));
    } catch {
      // 인터넷이 끊긴 경우 등: 지금 보이는 기록을 그대로 둡니다.
    }
  }, [ctx]);

  const loadLocalEntries = useCallback(() => localStore.list(LOCAL_BABY_ID), []);

  useEffect(() => {
    loadFamily().then((f) => {
      setFamily(f);
      setFamilyLoaded(true);
    });
  }, []);

  // 저장소가 바뀌면 (혼자 ↔ 가족) 기록을 다시 불러오고,
  // 가족 공유 중이면 다른 가족의 기록 변화를 실시간으로 받습니다.
  useEffect(() => {
    if (!familyLoaded) return;
    reload();
    const unsub = family ? subscribeLogs(family.babyId, () => reload()) : () => {};
    const appSub = AppState.addEventListener('change', (st) => {
      if (st === 'active') {
        setNow(Date.now());
        reload();
      }
    });
    return () => {
      unsub();
      appSub.remove();
    };
  }, [family, familyLoaded, reload]);

  const askPermission = useCallback(async () => {
    const ok = await ensurePermission();
    setPermission(ok ? 'granted' : 'denied');
  }, []);

  useEffect(() => {
    loadFeedback().then(setFeedback);
    loadReminder().then((s) => {
      setReminder(s);
      setReminderLoaded(true);
      if (s.enabled) askPermission();
    });
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, [askPermission]);

  // 진짜 앱 + 가족 공유 중이면 서버가 가족 모두에게 알림을 보내요 (서버 푸시).
  const [serverPush, setServerPush] = useState(false);
  useEffect(() => {
    if (!reminderLoaded) return;
    let alive = true;
    syncPushDevice(family, reminder).then((ok) => alive && setServerPush(ok));
    return () => {
      alive = false;
    };
  }, [family, reminder, reminderLoaded, permission]);

  // 그 밖에는 휴대폰 안에서 알림을 예약해요. 마지막 수유나 설정이 바뀌면 다시 맞춥니다.
  const lastFeedIso = entries.find((e) => e.kind === 'feed')?.startAt;
  useEffect(() => {
    if (!reminderLoaded || Platform.OS === 'web') return;
    rescheduleFeedReminder(serverPush ? undefined : lastFeedIso, reminder).catch(() => {});
  }, [lastFeedIso, reminder, reminderLoaded, permission, serverPush]);

  // 알림을 눌러 앱을 열면 기록 화면으로 갑니다.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = Notifications.addNotificationResponseReceivedListener(() => setTab('log'));
    return () => sub.remove();
  }, []);

  const changeReminder = (s: ReminderSettings) => {
    setReminder(s);
    saveReminder(s);
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        {tab === 'log' && (
          <LogScreen
            entries={entries}
            reload={reload}
            now={now}
            setNow={setNow}
            reminder={reminder}
            onOpenAlarm={() => setTab('alarm')}
            ctx={ctx}
            title={family ? `${family.babyName} 기록` : '아기 기록'}
            feedback={feedback}
          />
        )}
        {tab === 'stats' && <StatsScreen entries={entries} now={now} />}
        {tab === 'alarm' && (
          <AlarmScreen
            settings={reminder}
            onChange={changeReminder}
            permission={permission}
            onAskPermission={askPermission}
            lastFeedIso={lastFeedIso}
            now={now}
            feedback={feedback}
            onFeedbackChange={(f) => {
              setFeedback(f);
              saveFeedback(f);
            }}
          />
        )}
        {tab === 'family' && (
          <FamilyScreen
            family={family}
            onFamilyChange={(f) => {
              setEntries([]);
              setFamily(f);
              if (f) setTab('log');
            }}
            loadLocalEntries={loadLocalEntries}
          />
        )}
      </View>

      <View style={styles.tabBar}>
        <TabButton icon="📝" label="기록" active={tab === 'log'} onPress={() => setTab('log')} />
        <TabButton icon="📊" label="통계" active={tab === 'stats'} onPress={() => setTab('stats')} />
        <TabButton icon="⏰" label="알림" active={tab === 'alarm'} onPress={() => setTab('alarm')} />
        <TabButton icon="👨‍👩‍👧" label="가족" active={tab === 'family'} onPress={() => setTab('family')} />
      </View>
    </View>
  );
}

function TabButton({
  icon,
  label,
  active,
  onPress,
}: {
  icon: string;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.tabBtn}>
      <Text style={[styles.tabIcon, !active && { opacity: 0.45 }]}>{icon}</Text>
      <Text style={[styles.tabLabel, active && styles.tabLabelOn]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: C.line,
    backgroundColor: C.card,
    paddingTop: 6,
    paddingBottom: 6,
  },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  tabIcon: { fontSize: 22 },
  tabLabel: { fontSize: 12, color: C.sub, marginTop: 2, fontWeight: '600' },
  tabLabelOn: { color: C.text, fontWeight: '800' },
});
