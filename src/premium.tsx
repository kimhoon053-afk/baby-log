import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import Purchases, { PACKAGE_TYPE, type PurchasesPackage } from 'react-native-purchases';

import { PREMIUM_ENTITLEMENT, REVENUECAT_ANDROID_KEY } from './config';
import { fetchFamilyPremium, setFamilyPremium, type Family, type FamilyPremium } from './family';

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
  /** 내가 구독했거나, 같은 가족 누군가가 구독했으면 true */
  isPremium: boolean;
  /** 내가 직접 구독 중인지 */
  ownPremium: boolean;
  /** 가족 구독 정보 (가족 공유 중일 때만) */
  familyPremium: FamilyPremium | null;
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

type Info = { entitlements: { active: Record<string, { expirationDate: string | null }> } };

const FAR_FUTURE = '2099-12-31T00:00:00.000Z';

export function PremiumProvider({ children, family }: { children: ReactNode; family: Family | null }) {
  const [ownPremium, setPremium] = useState(false);
  /** 내 구독이 끝나는 날 (평생/테스트는 아주 먼 날) */
  const [ownUntil, setOwnUntil] = useState<string | null>(null);
  const [familyPremium, setFamilyPremiumState] = useState<FamilyPremium | null>(null);
  const [tick, setTick] = useState(0);
  const [plans, setPlans] = useState<Plan[]>(SAMPLE_PLANS);
  const [paywall, setPaywall] = useState<{ open: boolean; reason?: string }>({ open: false });

  useEffect(() => {
    if (TEST_MODE) {
      AsyncStorage.getItem(TEST_KEY)
        .then((v) => {
          setPremium(v === '1');
          setOwnUntil(v === '1' ? FAR_FUTURE : null);
        })
        .catch(() => {});
      return;
    }
    const onInfo = (info: Info) => {
      const ent = info.entitlements.active[PREMIUM_ENTITLEMENT];
      setPremium(!!ent);
      setOwnUntil(ent ? (ent.expirationDate ?? FAR_FUTURE) : null);
    };
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

  // 가족 공유 중이면 가족의 구독 정보를 불러와요. (앱으로 돌아올 때마다 다시 확인)
  useEffect(() => {
    if (!family) {
      setFamilyPremiumState(null);
      return;
    }
    let alive = true;
    const load = () =>
      fetchFamilyPremium(family.babyId).then((p) => {
        if (alive) setFamilyPremiumState(p);
      });
    load();
    const sub = AppState.addEventListener('change', (st) => st === 'active' && load());
    return () => {
      alive = false;
      sub.remove();
    };
  }, [family, tick]);

  // 내가 구독 중이면 가족 모두가 쓸 수 있게 가족 정보에 적어 둬요.
  useEffect(() => {
    if (!family || !ownUntil) return;
    if (familyPremium && familyPremium.until >= ownUntil) return;
    setFamilyPremium(family, ownUntil).then(() => setTick((t) => t + 1));
  }, [family, ownUntil, familyPremium]);

  const setTestPremium = useCallback(
    (on: boolean) => {
      setPremium(on);
      setOwnUntil(on ? FAR_FUTURE : null);
      AsyncStorage.setItem(TEST_KEY, on ? '1' : '0').catch(() => {});
      // 테스트로 끌 때는 가족 프리미엄도 같이 꺼요.
      if (!on && family) setFamilyPremium(family, null).then(() => setTick((t) => t + 1));
    },
    [family],
  );

  const buy = useCallback(
    async (plan: Plan): Promise<'done' | 'cancelled'> => {
      if (TEST_MODE || !plan.pkg) {
        setTestPremium(true);
        return 'done';
      }
      try {
        const r = await Purchases.purchasePackage(plan.pkg);
        const ent = (r.customerInfo as Info).entitlements.active[PREMIUM_ENTITLEMENT];
        const ok = !!ent;
        setPremium(ok);
        setOwnUntil(ent ? (ent.expirationDate ?? FAR_FUTURE) : null);
        return ok ? 'done' : 'cancelled';
      } catch (e) {
        if ((e as { userCancelled?: boolean }).userCancelled) return 'cancelled';
        throw new Error('결제를 마치지 못했어요. 잠시 후 다시 해 주세요.');
      }
    },
    [setTestPremium],
  );

  const restore = useCallback(async () => {
    if (TEST_MODE) return ownPremium;
    const info = (await Purchases.restorePurchases()) as Info;
    const ent = info.entitlements.active[PREMIUM_ENTITLEMENT];
    setPremium(!!ent);
    setOwnUntil(ent ? (ent.expirationDate ?? FAR_FUTURE) : null);
    return !!ent;
  }, [ownPremium]);

  const familyActive = !!familyPremium && new Date(familyPremium.until).getTime() > Date.now();
  const isPremium = ownPremium || familyActive;

  const value = useMemo<PremiumState>(
    () => ({
      isPremium,
      ownPremium,
      familyPremium: familyActive ? familyPremium : null,
      plans,
      paywallOpen: paywall.open,
      paywallReason: paywall.reason,
      openPaywall: (reason) => setPaywall({ open: true, reason }),
      closePaywall: () => setPaywall({ open: false }),
      buy,
      restore,
      setTestPremium,
    }),
    [isPremium, ownPremium, familyActive, familyPremium, plans, paywall, buy, restore, setTestPremium],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePremium(): PremiumState {
  const v = useContext(Ctx);
  if (!v) throw new Error('PremiumProvider 안에서만 쓸 수 있어요');
  return v;
}
