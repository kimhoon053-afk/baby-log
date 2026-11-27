import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import { isQuietTime } from './reminders';

// 기록 버튼을 누를 때 나는 소리와 진동입니다.
// "밤에는 소리 끄기"를 켜 두면 밤 10시~아침 7시에는 소리 없이 짧은 진동만 나요.

export type SoundKind = 'feed' | 'diaper' | 'sleep' | 'wake';

export type ButtonFeedback = {
  sound: boolean;
  quietNight: boolean;
  vibrate: boolean;
};

export const DEFAULT_FEEDBACK: ButtonFeedback = { sound: true, quietNight: true, vibrate: true };

const KEY = 'baby-log/button-feedback/v1';

const SOURCES: Record<SoundKind, number> = {
  feed: require('../assets/sounds/feed.wav'),
  diaper: require('../assets/sounds/diaper.wav'),
  sleep: require('../assets/sounds/sleep.wav'),
  wake: require('../assets/sounds/wake.wav'),
};

const players: Partial<Record<SoundKind, AudioPlayer>> = {};
let modeSet = false;

export async function loadFeedback(): Promise<ButtonFeedback> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? { ...DEFAULT_FEEDBACK, ...JSON.parse(raw) } : DEFAULT_FEEDBACK;
  } catch {
    return DEFAULT_FEEDBACK;
  }
}

export async function saveFeedback(f: ButtonFeedback): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(f));
}

function player(kind: SoundKind): AudioPlayer {
  let p = players[kind];
  if (!p) {
    p = createAudioPlayer(SOURCES[kind]);
    p.volume = 0.6;
    players[kind] = p;
  }
  return p;
}

/** 버튼 소리와 진동. 실패해도 기록에는 영향을 주지 않아요. */
export function playButton(kind: SoundKind, f: ButtonFeedback): void {
  const night = f.quietNight && isQuietTime(new Date());
  if (f.vibrate && Platform.OS !== 'web') {
    Haptics.impactAsync(night ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium).catch(
      () => {},
    );
  }
  if (!f.sound || night) return;
  try {
    if (!modeSet) {
      modeSet = true;
      // 휴대폰이 무음 모드면 소리를 내지 않아요. 다른 앱 음악도 멈추지 않아요.
      setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' }).catch(() => {});
    }
    const p = player(kind);
    p.seekTo(0).catch(() => {});
    p.play();
  } catch {
    // 소리를 못 내도 괜찮아요.
  }
}
