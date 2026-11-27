import { localStore } from './storage';

// 지금은 아기 한 명, 이 기기 한 대만 씁니다.
// 가족 공유를 붙일 때 이 파일에서 클라우드 저장소로 바꿉니다.
export const BABY_ID = 'baby-1';
export const ME = 'me';
export const store = localStore;
