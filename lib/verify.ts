// Design Ref: §2.2 처리 9~11 — AI 답 검사와 추천 결과 마무리 (후보 대조·값 덮어쓰기·3곳 채우기·기본 문장·안내 문구)
// 이유 규칙 검사(50자·숫자)는 PLAN 작업 12에서 이 파일에 추가한다.
import type { AiPick, Cuisine, FilterConditions, Recommendation, Restaurant } from "./types";

/** 추천 개수 */
export const RECOMMEND_COUNT = 3;

/** 같은 메뉴 종류 최대 개수 — PRD must ① 규칙 7 */
export const MAX_SAME_CUISINE = 2;

export const NOTICES = {
  none: "조건에 맞는 곳이 없어요. 조건을 조금 완화해 보세요.",
  fewCandidates: "조건을 조금 완화해 보세요",
  cuisineLimited: "메뉴 취향을 넓히면 더 다양하게 추천받을 수 있어요",
} as const;

/**
 * 코드가 만드는 기본 추천 이유. 목록 값만 쓰므로 이유 규칙(50자, 숫자 2개 이상, 값 일치)을 항상 지킨다.
 * 예: "1인 25,000원, 도보 5분, 최대 20명" / 룸이 필요하면 "1인 25,000원, 도보 5분, 룸 12명"
 */
export function defaultReason(restaurant: Restaurant, conditions: FilterConditions): string {
  const price = `1인 ${restaurant.pricePerPerson.toLocaleString("ko-KR")}원`;
  const walk = `도보 ${restaurant.walkMinutes}분`;
  const capacity = conditions.needRoom
    ? `룸 ${restaurant.roomCapacity}명`
    : `최대 ${restaurant.maxCapacity}명`;
  return `${price}, ${walk}, ${capacity}`;
}

/**
 * 이미 고른 가게(picked)에 후보(candidates)를 앞에서부터 더해 3곳을 채운다.
 * 같은 메뉴는 최대 2곳, 같은 가게는 한 번만. 더한 가게의 이유는 기본 문장을 쓴다.
 * candidates는 필터가 정렬한 순서(가까운 순)를 그대로 따른다.
 */
export function fillRecommendations(
  picked: readonly Recommendation[],
  candidates: readonly Restaurant[],
  conditions: FilterConditions,
): Recommendation[] {
  const result = [...picked];
  const used = new Set(result.map((r) => r.id));
  const cuisineCount = new Map<Cuisine, number>();
  for (const r of result) cuisineCount.set(r.cuisine, (cuisineCount.get(r.cuisine) ?? 0) + 1);

  for (const candidate of candidates) {
    if (result.length >= RECOMMEND_COUNT) break;
    if (used.has(candidate.id)) continue;
    if ((cuisineCount.get(candidate.cuisine) ?? 0) >= MAX_SAME_CUISINE) continue;

    result.push({ ...candidate, reason: defaultReason(candidate, conditions) });
    used.add(candidate.id);
    cuisineCount.set(candidate.cuisine, (cuisineCount.get(candidate.cuisine) ?? 0) + 1);
  }
  return result;
}

/**
 * 안내 문구를 정한다 (Design §2.2 처리 11).
 * "조건 완화" 안내는 걸러진 후보 자체가 3곳 미만일 때만 띄운다.
 */
export function chooseNotice(candidateCount: number, resultCount: number): string | undefined {
  if (candidateCount === 0) return NOTICES.none;
  if (candidateCount < RECOMMEND_COUNT) return NOTICES.fewCandidates;
  if (resultCount < RECOMMEND_COUNT) return NOTICES.cuisineLimited;
  return undefined;
}

// ── AI 답 검사 (PLAN 작업 11) ──────────────────────────────────────

export type CheckedPicks = {
  /** 검사를 통과한 가게. 이유만 AI 글이고 나머지 값은 모두 목록(후보) 값이다. */
  recommendations: Recommendation[];
  /** 빼낸 이유 (서버 기록·다시 요청할 때 쓴다). 화면에는 보여 주지 않는다. */
  problems: string[];
};

/**
 * AI 답을 걸러진 후보와 대조한다 (Design §2.2 처리 9, Plan SC: SC-2·SC-3).
 * - 후보 id에 없는 가게는 뺀다. 전체 목록에는 있어도 조건에서 걸러진 가게라면 통과시키지 않는다.
 * - 같은 가게를 두 번 고르면 처음 것만 남긴다.
 * - 이름·메뉴·가격·도보·인원·룸·예약 값은 AI 답이 아니라 후보 값으로 채운다. AI가 덧붙인 값은 버린다.
 * - 3곳보다 많이 골랐으면 앞의 3곳만 남긴다.
 */
export function checkAiPicks(picks: readonly AiPick[], candidates: readonly Restaurant[]): CheckedPicks {
  const byId = new Map(candidates.map((r) => [r.id, r]));
  const recommendations: Recommendation[] = [];
  const problems: string[] = [];
  const used = new Set<string>();

  for (const pick of picks) {
    const candidate = byId.get(pick.id);
    if (!candidate) {
      problems.push(`후보에 없는 가게를 골랐습니다: ${pick.id}`);
      continue;
    }
    if (used.has(pick.id)) {
      problems.push(`같은 가게를 두 번 골랐습니다: ${pick.id}`);
      continue;
    }
    if (recommendations.length >= RECOMMEND_COUNT) {
      problems.push(`${RECOMMEND_COUNT}곳보다 많이 골랐습니다: ${pick.id}`);
      continue;
    }
    used.add(pick.id);
    recommendations.push({ ...candidate, reason: pick.reason.trim() });
  }
  return { recommendations, problems };
}
