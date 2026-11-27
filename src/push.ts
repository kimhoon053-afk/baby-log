import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { Family } from './family';
import { ensureChannels, type ReminderSettings } from './reminders';
import { supabase } from './supabase';

// 가족 모두에게 가는 수유 알림 (서버 푸시).
// 진짜 앱으로 설치한 휴대폰은 서버에 "알림 받을 주소(푸시 토큰)"와 알림 설정을 등록하고,
// 서버(supabase/push.sql)가 1분마다 확인해서 시간이 되면 알림을 보내요.
// Expo Go 미리보기에서는 푸시를 쓸 수 없어서 예전처럼 휴대폰 안에서 알림을 예약해요.

const projectId: string | undefined =
  (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
  Constants.easConfig?.projectId ??
  undefined;

export function canUsePush(): boolean {
  return (
    Platform.OS !== 'web' &&
    Constants.executionEnvironment !== ExecutionEnvironment.StoreClient &&
    !!projectId &&
    !!supabase
  );
}

function timeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul';
  } catch {
    return 'Asia/Seoul';
  }
}

/**
 * 이 휴대폰을 서버 푸시에 등록하거나 설정을 맞춥니다.
 * 서버 푸시를 쓰게 되면 true (그러면 휴대폰 안의 알림 예약은 끕니다).
 */
export async function syncPushDevice(family: Family | null, s: ReminderSettings): Promise<boolean> {
  if (!family || !canUsePush()) return false;
  try {
    const perm = await Notifications.getPermissionsAsync();
    if (!perm.granted) return false;
    await ensureChannels();
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    const { error } = await supabase!.from('push_devices').upsert({
      user_id: family.userId,
      baby_id: family.babyId,
      token,
      enabled: s.enabled,
      interval_min: s.intervalMin,
      quiet_night: s.quietNight,
      tz: timeZone(),
      updated_at: new Date().toISOString(),
    });
    return !error;
  } catch {
    return false;
  }
}

export async function removePushDevice(family: Family): Promise<void> {
  if (!supabase) return;
  await supabase
    .from('push_devices')
    .delete()
    .eq('user_id', family.userId)
    .eq('baby_id', family.babyId)
    .then(
      () => {},
      () => {},
    );
}
