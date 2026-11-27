import { cloudStore } from './cloudStore';
import type { Family } from './family';
import { localStore, type LogStore } from './storage';

// 혼자 쓸 때: 휴대폰 안에 저장 (아기 id 'baby-1', 기록한 사람 'me')
// 가족 공유 중: 클라우드에 저장 (가족의 아기 id, 내 사용자 id·호칭)
export const LOCAL_BABY_ID = 'baby-1';

export type StoreContext = {
  store: LogStore;
  babyId: string;
  me: string;
  myName?: string;
};

export function storeFor(family: Family | null): StoreContext {
  if (!family) return { store: localStore, babyId: LOCAL_BABY_ID, me: 'me' };
  return { store: cloudStore(), babyId: family.babyId, me: family.userId, myName: family.myName };
}
