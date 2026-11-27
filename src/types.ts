// 기록 한 건의 모양입니다.
// 나중에 가족 공유(클라우드 저장)를 붙일 때 그대로 서버 표에 옮길 수 있도록
// 아기(babyId), 기록한 사람(createdBy), 수정 시각(updatedAt)을 처음부터 넣어 둡니다.

export type LogKind = 'feed' | 'diaper' | 'sleep';

export type FeedType = 'breast_left' | 'breast_right' | 'formula';
export type DiaperType = 'pee' | 'poop';

export type LogEntry = {
  id: string;
  babyId: string;
  kind: LogKind;
  /** 수유면 FeedType, 기저귀면 DiaperType, 수면이면 'sleep' */
  subtype: FeedType | DiaperType | 'sleep';
  /** 분유 양(ml). 분유일 때만 씁니다. */
  amountMl?: number;
  /** 언제 일어난 일인지 (ISO 시각 문자열) */
  startAt: string;
  /** 수면이 끝난 시각. 아직 자는 중이면 비어 있습니다. */
  endAt?: string;
  createdAt: string;
  updatedAt: string;
  /** 기록한 사람. 혼자 쓸 때는 'me', 가족 공유 중에는 사용자 id 입니다. */
  createdBy: string;
  /** 기록한 사람 호칭 (엄마, 아빠 등). 가족 공유 중에만 있어요. */
  createdByName?: string;
};
