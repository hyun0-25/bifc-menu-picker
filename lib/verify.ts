// Design Ref: §2.2 처리 9~11 — 추천 결과 마무리 (3곳 채우기·기본 문장·안내 문구)
// AI 답 검사(후보 id 대조, 이유 규칙 검사)는 PLAN 작업 11·12에서 이 파일에 추가한다.
import type { Cuisine, FilterConditions, Recommendation, Restaurant } from "./types";

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
