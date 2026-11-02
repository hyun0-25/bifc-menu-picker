// Design Ref: §2.2 처리 6 — AI를 부르기 전에 코드로 조건을 거른다 (PRD must ① 규칙 3~6)
// Plan SC: SC-2 조건 준수 100% — 이 함수를 통과한 가게만 AI에 후보로 보낸다.
import { DEFAULT_WALK_MINUTES, type FilterConditions, type Restaurant } from "./types";

/** 실제로 적용할 도보 거리(분): 입력값이 없으면 목적별 기본값(점심 10분, 회식 15분) */
export function resolveMaxWalkMinutes(conditions: FilterConditions): number {
  return conditions.maxWalkMinutes ?? DEFAULT_WALK_MINUTES[conditions.purpose];
}

/** 한 가게가 조건을 모두 만족하는지 */
export function matchesConditions(restaurant: Restaurant, conditions: FilterConditions): boolean {
  const maxWalk = resolveMaxWalkMinutes(conditions);

  // 규칙 3: 1인 가격이 예산을 넘으면 제외 (같으면 통과)
  if (restaurant.pricePerPerson > conditions.budget) return false;

  // 규칙 4: 최대 인원이 입력 인원보다 적으면 제외
  if (restaurant.maxCapacity < conditions.people) return false;

  // 규칙 4: 룸이 필요하면 룸이 있고 룸 인원도 입력 인원 이상이어야 함
  if (conditions.needRoom && (!restaurant.hasRoom || restaurant.roomCapacity < conditions.people)) {
    return false;
  }

  // 규칙 5: 예약이 필요하면 "가능"만 통과 ("불가", "정보 없음" 제외)
  if (conditions.needReservation && restaurant.reservation !== "가능") return false;

  // 규칙 6: 도보 시간이 거리를 넘으면 제외 (같으면 통과)
  if (restaurant.walkMinutes > maxWalk) return false;

  return true;
}

/**
 * 조건에 맞는 후보만 남긴다. 가까운 순(도보 시간이 같으면 목록 순서)으로 정렬해 돌려준다.
 * 정렬 순서는 AI 답이 모자랄 때 코드가 후보를 채우는 순서로도 쓴다 (Design §2.2 처리 10).
 */
export function filterCandidates(
  restaurants: readonly Restaurant[],
  conditions: FilterConditions,
): Restaurant[] {
  return restaurants
    .filter((restaurant) => matchesConditions(restaurant, conditions))
    .sort((a, b) => a.walkMinutes - b.walkMinutes);
}
