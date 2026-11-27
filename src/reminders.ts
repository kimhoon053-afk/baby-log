import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { durationLabel, timeLabel } from './format';

// 수유 알림: 마지막 수유 시각 + 정해 둔 간격이 되면 휴대폰에 알림을 띄웁니다.
// 그때까지도 수유 기록이 없으면 30분 뒤에 한 번 더 알려 줍니다.
// "밤에는 조용히"를 켜 두면 밤 10시~아침 7시 사이 알림은 소리·진동 없이 옵니다.

export type ReminderSettings = {
  enabled: boolean;
  intervalMin: number;
  quietNight: boolean;
};

export const DEFAULT_REMINDER: ReminderSettings = {
  enabled: true,
  intervalMin: 180,
  quietNight: true,
};

export const QUIET_START_HOUR = 22;
export const QUIET_END_HOUR = 7;
const FOLLOW_UP_MIN = 30;

const KEY = 'baby-log/reminder/v1';
const IDS = ['feed-reminder', 'feed-reminder-late'];
const CH_SOUND = 'feed';
const CH_QUIET = 'feed-quiet';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function loadReminder(): Promise<ReminderSettings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? { ...DEFAULT_REMINDER, ...JSON.parse(raw) } : DEFAULT_REMINDER;
  } catch {
    return DEFAULT_REMINDER;
  }
}

export async function saveReminder(s: ReminderSettings): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(s));
}

/** 알림을 보내도 되는지 휴대폰에 물어봅니다. 허락하면 true. */
export async function ensurePermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

let channelsReady = false;
async function ensureChannels() {
  if (channelsReady || Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CH_SOUND, {
    name: '수유 알림',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 300, 200, 300],
  });
  await Notifications.setNotificationChannelAsync(CH_QUIET, {
    name: '수유 알림 (밤, 무음)',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: null,
    enableVibrate: false,
  });
  channelsReady = true;
}

export function isQuietTime(d: Date): boolean {
  const h = d.getHours();
  return h >= QUIET_START_HOUR || h < QUIET_END_HOUR;
}

/** 다음 수유 예정 시각 (ms). 기록이 없거나 알림이 꺼져 있으면 null. */
export function nextFeedAt(lastFeedIso: string | undefined, s: ReminderSettings): number | null {
  if (!lastFeedIso || !s.enabled) return null;
  return new Date(lastFeedIso).getTime() + s.intervalMin * 60000;
}

/** 마지막 수유가 바뀌거나 설정이 바뀔 때마다 불러서 알림 예약을 새로 맞춥니다. */
export async function rescheduleFeedReminder(
  lastFeedIso: string | undefined,
  s: ReminderSettings,
): Promise<void> {
  if (Platform.OS === 'web') return;
  for (const id of IDS) {
    await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
  }
  const due = nextFeedAt(lastFeedIso, s);
  if (due === null) return;
  const perm = await Notifications.getPermissionsAsync();
  if (!perm.granted) return;
  await ensureChannels();

  const lastLabel = timeLabel(lastFeedIso!);
  const plan = [
    {
      id: IDS[0],
      at: due,
      title: '🍼 수유할 시간이에요',
      body: `마지막 수유(${lastLabel}) 후 ${durationLabel(s.intervalMin * 60000)}이 지났어요.`,
    },
    {
      id: IDS[1],
      at: due + FOLLOW_UP_MIN * 60000,
      title: '🍼 아직 수유 기록이 없어요',
      body: `마지막 수유(${lastLabel}) 후 ${durationLabel((s.intervalMin + FOLLOW_UP_MIN) * 60000)}이 지났어요.`,
    },
  ];

  for (const p of plan) {
    if (p.at <= Date.now() + 5000) continue;
    const quiet = s.quietNight && isQuietTime(new Date(p.at));
    await Notifications.scheduleNotificationAsync({
      identifier: p.id,
      content: { title: p.title, body: p.body, sound: quiet ? false : 'default' },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: p.at,
        channelId: quiet ? CH_QUIET : CH_SOUND,
      },
    });
  }
}
