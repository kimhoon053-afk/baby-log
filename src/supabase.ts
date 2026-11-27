import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { SUPABASE_KEY, SUPABASE_URL } from './config';

export const cloudReady = SUPABASE_URL.length > 0 && SUPABASE_KEY.length > 0;

export const supabase: SupabaseClient | null = cloudReady
  ? createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

// 앱이 화면에 있을 때만 로그인 상태를 자동으로 새로 고칩니다.
if (supabase && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

/** 회원가입 없이 이 기기를 익명 사용자로 로그인시킵니다. 사용자 id를 돌려줍니다. */
export async function ensureSignedIn(): Promise<string> {
  if (!supabase) throw new Error('cloud not configured');
  const { data } = await supabase.auth.getSession();
  if (data.session?.user) return data.session.user.id;
  const { data: signed, error } = await supabase.auth.signInAnonymously();
  if (error || !signed.user) throw error ?? new Error('sign-in failed');
  return signed.user.id;
}
