// Design Ref: §2.2 처리 6 — AI를 부르기 전에 코드로 조건을 거른다 (PRD must ① 규칙 3~6)
// Plan SC: SC-2 조건 준수 100% — 이 함수를 통과한 가게만 AI에 후보로 보낸다.
import {
  DEFAULT_WALK_MINUTES,
  MAX_WALK_MINUTES,
  SMALL_GROUP_LIMIT,
  UNKNOWN,
  type FilterConditions,
  type Restaurant,
} from "./types";

/**
 * 인원 조건을 만족하는지 (규칙 4).
 * - 최대 인원을 알면 그 숫자와 비교한다.
 * - 모르면("정보 없음") 4명 이하만 통과. 5명 이상은 단체석·룸 표시가 있어야 통과한다.
 */
export function fitsPeople(restaurant: Restaurant, people: number): boolean {
  if (restaurant.maxCapacity !== UNKNOWN) return restaurant.maxCapacity >= people;
  return people <= SMALL_GROUP_LIMIT || restaurant.groupSeating || restaurant.hasRoom === true;
}

/**
 * 룸 조건을 만족하는지 (규칙 4). 룸이 확인된 가게(hasRoom === true)만 통과한다.
 * 룸 인원을 알면 입력 인원 이상이어야 하고, 모르면("정보 없음") 룸이 있다는 것만으로 통과한다.
 */
export function fitsRoom(restaurant: Restaurant, people: number): boolean {
  if (restaurant.hasRoom !== true) return false;
  return restaurant.roomCapacity === UNKNOWN || restaurant.roomCapacity >= people;
}

/** 실제로 적용할 도보 거리(분): 입력값이 없으면 목적별 기본값(점심 10분, 회식 15분) */
export function resolveMaxWalkMinutes(conditions: FilterConditions): number {
  return conditions.maxWalkMinutes ?? DEFAULT_WALK_MINUTES[conditions.purpose];
}

/** 한 가게가 조건을 모두 만족하는지 */
export function matchesConditions(restaurant: Restaurant, conditions: FilterConditions): boolean {
  const maxWalk = resolveMaxWalkMinutes(conditions);

  // 규칙 3: 1인 가격이 예산을 넘으면 제외 (같으면 통과)
  if (restaurant.pricePerPerson > conditions.budget) return false;

  // 규칙 4: 최대 인원이 입력 인원보다 적으면 제외 (모르면 단체석·룸 표시로 판단)
  if (!fitsPeople(restaurant, conditions.people)) return false;

  // 규칙 4: 룸이 필요하면 룸이 확인된 가게만 (룸 인원을 알면 입력 인원 이상)
  if (conditions.needRoom && !fitsRoom(restaurant, conditions.people)) return false;

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

/**
 * 결과가 적을 때 "무엇을 빼면 몇 곳이 나오는지" 알려 주는 안내 문구를 만든다 (PLAN 작업 23).
 * 예약·룸·도보 거리를 하나씩 풀어 보고, 후보가 지금보다 늘어나는 경우만 돌려준다. 최대 3개.
 * 예: ["예약 조건을 빼면 5곳이 나와요", "룸·예약 조건을 모두 빼면 9곳이 나와요"]
 */
export function relaxationHints(
  restaurants: readonly Restaurant[],
  conditions: FilterConditions,
): string[] {
  const current = filterCandidates(restaurants, conditions).length;
  const variants: { label: string; conditions: FilterConditions }[] = [];

  if (conditions.needReservation) {
    variants.push({ label: "예약 조건을 빼면", conditions: { ...conditions, needReservation: false } });
  }
  if (conditions.needRoom) {
    variants.push({ label: "룸 조건을 빼면", conditions: { ...conditions, needRoom: false } });
  }
  if (conditions.needReservation && conditions.needRoom) {
    variants.push({
      label: "룸·예약 조건을 모두 빼면",
      conditions: { ...conditions, needRoom: false, needReservation: false },
    });
  }
  if (resolveMaxWalkMinutes(conditions) < MAX_WALK_MINUTES) {
    variants.push({
      label: `도보 거리를 ${MAX_WALK_MINUTES}분까지 넓히면`,
      conditions: { ...conditions, maxWalkMinutes: MAX_WALK_MINUTES },
    });
  }

  return variants
    .map((v) => ({ label: v.label, count: filterCandidates(restaurants, v.conditions).length }))
    .filter((v) => v.count > current)
    .slice(0, 3)
    .map((v) => `${v.label} ${v.count}곳이 나와요`);
}
