import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import Purchases, { PACKAGE_TYPE, type PurchasesPackage } from 'react-native-purchases';

import { PREMIUM_ENTITLEMENT, REVENUECAT_ANDROID_KEY } from './config';

// 프리미엄(유료 구독) 상태를 앱 전체에 알려 주는 곳입니다.
// - 결제 키가 있으면: 구글 플레이 정기 구독(RevenueCat)으로 확인해요.
// - 결제 키가 비어 있으면: '테스트 모드'. 결제 화면에서 프리미엄을 직접 켜고 끌 수 있어요.

export const TEST_MODE = !REVENUECAT_ANDROID_KEY || Platform.OS !== 'android';
const TEST_KEY = 'baby-log/premium-test/v1';

export type Plan = {
  id: 'monthly' | 'annual';
  title: string;
  price: string;
  note?: string;
  /** 무료 체험 기간이 있으면 true (구글 플레이 콘솔에서 7일 무료 체험 혜택을 켜 둬요) */
  trial?: boolean;
  pkg?: PurchasesPackage;
};

/** 결제가 연결되기 전에 보여 줄 예시 가격 */
const SAMPLE_PLANS: Plan[] = [
  { id: 'annual', title: '1년', price: '₩19,900', note: '한 달에 약 1,650원 · 43% 할인', trial: true },
  { id: 'monthly', title: '1개월', price: '₩2,900', trial: true },
];

type PremiumState = {
  isPremium: boolean;
  plans: Plan[];
  paywallOpen: boolean;
  /** 어떤 기능을 보려다 결제 화면이 열렸는지 (안내 문구에 써요) */
  paywallReason?: string;
  openPaywall: (reason?: string) => void;
  closePaywall: () => void;
  buy: (plan: Plan) => Promise<'done' | 'cancelled'>;
  restore: () => Promise<boolean>;
  setTestPremium: (on: boolean) => void;
};

const Ctx = createContext<PremiumState | null>(null);

let configured = false;

export function PremiumProvider({ children }: { children: ReactNode }) {
  const [isPremium, setPremium] = useState(false);
  const [plans, setPlans] = useState<Plan[]>(SAMPLE_PLANS);
  const [paywall, setPaywall] = useState<{ open: boolean; reason?: string }>({ open: false });

  useEffect(() => {
    if (TEST_MODE) {
      AsyncStorage.getItem(TEST_KEY)
        .then((v) => setPremium(v === '1'))
        .catch(() => {});
      return;
    }
    const onInfo = (info: { entitlements: { active: Record<string, unknown> } }) =>
      setPremium(!!info.entitlements.active[PREMIUM_ENTITLEMENT]);
    try {
      if (!configured) {
        Purchases.configure({ apiKey: REVENUECAT_ANDROID_KEY });
        configured = true;
      }
      Purchases.addCustomerInfoUpdateListener(onInfo);
      Purchases.getCustomerInfo().then(onInfo).catch(() => {});
      Purchases.getOfferings()
        .then((o) => {
          const pkgs = o.current?.availablePackages ?? [];
          const pick = (t: PACKAGE_TYPE) => pkgs.find((p) => p.packageType === t);
          const out: Plan[] = [];
          const annual = pick(PACKAGE_TYPE.ANNUAL);
          const monthly = pick(PACKAGE_TYPE.MONTHLY);
          const hasTrial = (p: PurchasesPackage) => !!p.product.defaultOption?.freePhase;
          if (annual) {
            // 월 구독 12개월 값과 비교해 몇 % 싼지 보여 줘요.
            const m = monthly?.product.price;
            const off = m ? Math.round((1 - annual.product.price / (m * 12)) * 100) : 0;
            const perMonth = Math.round(annual.product.price / 12 / 10) * 10;
            out.push({
              id: 'annual',
              title: '1년',
              price: annual.product.priceString,
              note: `한 달에 약 ${perMonth.toLocaleString('ko-KR')}원${off > 0 ? ` · ${off}% 할인` : ''}`,
              trial: hasTrial(annual),
              pkg: annual,
            });
          }
          if (monthly) {
            out.push({
              id: 'monthly',
              title: '1개월',
              price: monthly.product.priceString,
              trial: hasTrial(monthly),
              pkg: monthly,
            });
          }
          if (out.length > 0) setPlans(out);
        })
        .catch(() => {});
    } catch {
      // 결제 모듈이 없는 환경(Expo Go 등)에서는 무료로 둡니다.
    }
    return () => {
      try {
        Purchases.removeCustomerInfoUpdateListener(onInfo);
      } catch {}
    };
  }, []);

  const setTestPremium = useCallback((on: boolean) => {
    setPremium(on);
    AsyncStorage.setItem(TEST_KEY, on ? '1' : '0').catch(() => {});
  }, []);

  const buy = useCallback(
    async (plan: Plan): Promise<'done' | 'cancelled'> => {
      if (TEST_MODE || !plan.pkg) {
        setTestPremium(true);
        return 'done';
      }
      try {
        const r = await Purchases.purchasePackage(plan.pkg);
        const ok = !!r.customerInfo.entitlements.active[PREMIUM_ENTITLEMENT];
        setPremium(ok);
        return ok ? 'done' : 'cancelled';
      } catch (e) {
        if ((e as { userCancelled?: boolean }).userCancelled) return 'cancelled';
        throw new Error('결제를 마치지 못했어요. 잠시 후 다시 해 주세요.');
      }
    },
    [setTestPremium],
  );

  const restore = useCallback(async () => {
    if (TEST_MODE) return isPremium;
    const info = await Purchases.restorePurchases();
    const ok = !!info.entitlements.active[PREMIUM_ENTITLEMENT];
    setPremium(ok);
    return ok;
  }, [isPremium]);

  const value = useMemo<PremiumState>(
    () => ({
      isPremium,
      plans,
      paywallOpen: paywall.open,
      paywallReason: paywall.reason,
      openPaywall: (reason) => setPaywall({ open: true, reason }),
      closePaywall: () => setPaywall({ open: false }),
      buy,
      restore,
      setTestPremium,
    }),
    [isPremium, plans, paywall, buy, restore, setTestPremium],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePremium(): PremiumState {
  const v = useContext(Ctx);
  if (!v) throw new Error('PremiumProvider 안에서만 쓸 수 있어요');
  return v;
}
