import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
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
import AlarmScreen from './src/screens/AlarmScreen';
import LogScreen from './src/screens/LogScreen';
import StatsScreen from './src/screens/StatsScreen';
import { BABY_ID, store } from './src/store';
import { C } from './src/theme';
import type { LogEntry } from './src/types';

type Tab = 'log' | 'stats' | 'alarm';

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

  const reload = useCallback(async () => {
    setEntries(await store.list(BABY_ID));
  }, []);

  const askPermission = useCallback(async () => {
    const ok = await ensurePermission();
    setPermission(ok ? 'granted' : 'denied');
  }, []);

  useEffect(() => {
    reload();
    loadReminder().then((s) => {
      setReminder(s);
      setReminderLoaded(true);
      if (s.enabled) askPermission();
    });
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, [reload, askPermission]);

  // 마지막 수유나 알림 설정이 바뀌면 알림 예약을 다시 맞춥니다.
  const lastFeedIso = entries.find((e) => e.kind === 'feed')?.startAt;
  useEffect(() => {
    if (!reminderLoaded || Platform.OS === 'web') return;
    rescheduleFeedReminder(lastFeedIso, reminder).catch(() => {});
  }, [lastFeedIso, reminder, reminderLoaded, permission]);

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
          />
        )}
      </View>

      <View style={styles.tabBar}>
        <TabButton icon="📝" label="기록" active={tab === 'log'} onPress={() => setTab('log')} />
        <TabButton icon="📊" label="통계" active={tab === 'stats'} onPress={() => setTab('stats')} />
        <TabButton icon="⏰" label="알림" active={tab === 'alarm'} onPress={() => setTab('alarm')} />
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
