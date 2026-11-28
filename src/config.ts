// 가족 공유용 클라우드(Supabase) 주소와 공개 키입니다.
// 둘 다 앱 안에 들어가도 되는 공개용 값이에요. (데이터는 supabase/schema.sql 의 규칙으로 가족만 볼 수 있게 잠겨 있어요)
// 비어 있으면 가족 공유 없이 휴대폰 안에만 저장합니다.
export const SUPABASE_URL = 'https://khsikiybnbpyneynrlne.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_0DPM8BzNdRfgrfFdJPBYag_IUTa4NN6';

// 구독 결제(RevenueCat)의 안드로이드 공개 키입니다. (RevenueCat 대시보드 → API keys → Google Play, goog_ 로 시작)
// 비어 있으면 아직 결제가 연결되지 않은 '테스트 모드'로 돌아가고, 결제 화면에서 프리미엄을 직접 켜 볼 수 있어요.
export const REVENUECAT_ANDROID_KEY = '';
/** RevenueCat 에서 만든 권한(Entitlement) 이름 */
export const PREMIUM_ENTITLEMENT = 'premium';
