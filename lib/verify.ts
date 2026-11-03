// Design Ref: §2.2 처리 9~11 — AI 답 검사와 추천 결과 마무리 (후보 대조·값 덮어쓰기·3곳 채우기·기본 문장·안내 문구)
// AI 호출 자체는 lib/ai.ts가 맡고, 이 파일은 AI 답을 받아 검사·보정만 한다 (서버 전용 코드에 의존하지 않음).
import {
  MAX_MATCHED_MENUS,
  UNKNOWN,
  type AiPick,
  type Cuisine,
  type FilterConditions,
  type Recommendation,
  type Restaurant,
} from "./types";

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
 * 인원이 "정보 없음"이면 숫자 대신 확인된 표시를 쓴다: "룸 있음" / "단체석 있음" (없으면 생략)
 */
export function defaultReason(restaurant: Restaurant, conditions: FilterConditions): string {
  const parts = [
    `1인 ${restaurant.pricePerPerson.toLocaleString("ko-KR")}원`,
    `도보 ${restaurant.walkMinutes}분`,
  ];
  if (conditions.needRoom) {
    parts.push(restaurant.roomCapacity === UNKNOWN ? "룸 있음" : `룸 ${restaurant.roomCapacity}명`);
  } else if (restaurant.maxCapacity !== UNKNOWN) {
    parts.push(`최대 ${restaurant.maxCapacity}명`);
  } else if (restaurant.groupSeating) {
    parts.push("단체석 있음");
  }
  return parts.join(", ");
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

/**
 * AI가 말한 "추가 조건의 근거 메뉴" 중, 그 가게의 menus에 실제로 적힌 이름만 남긴다 (최대 3개).
 * 목록에 없는 메뉴 이름은 지어낸 것으로 보고 버린다.
 */
export function validMatchedMenus(
  names: readonly string[] | undefined,
  restaurant: Pick<Restaurant, "menus">,
): string[] {
  const own = new Set(restaurant.menus ?? []);
  const unique = [...new Set((names ?? []).map((name) => name.trim()))];
  return unique.filter((name) => own.has(name)).slice(0, MAX_MATCHED_MENUS);
}

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
    const matched = validMatchedMenus(pick.matchedMenus, candidate);
    recommendations.push({
      ...candidate,
      reason: pick.reason.trim(),
      ...(matched.length > 0 && { matchedMenus: matched }),
    });
  }
  return { recommendations, problems };
}

// ── 이유 규칙 검사 (PLAN 작업 12, Design §3.4) ──────────────────────────

/** 추천 이유 최대 길이 (공백 포함 글자 수) — PRD must ② 규칙 1 */
export const MAX_REASON_LENGTH = 50;

/** 이유에 넣어야 하는 숫자 항목 최소 개수 — PRD must ② 규칙 2 */
export const MIN_REASON_NUMBERS = 2;

/**
 * 추천 이유가 이유 규칙을 지키는지 검사한다. 문제가 없으면 빈 배열.
 * 허용 표기: "1인 25,000원" / "도보 5분" / "최대 20명"·"룸 12명"·"10명"(입력 인원)
 * 이유에 나온 숫자는 모두 이 표기 안에 있어야 하고, 그 가게의 목록 값(또는 입력 인원)과 같아야 한다.
 */
export function checkReason(reason: string, restaurant: Restaurant, people: number): string[] {
  const problems: string[] = [];
  if (reason.length === 0) problems.push("이유가 비어 있습니다");
  if (reason.length > MAX_REASON_LENGTH) {
    problems.push(`이유가 ${MAX_REASON_LENGTH}자를 넘습니다 (${reason.length}자)`);
  }
  if (/[\r\n]/.test(reason)) problems.push("이유가 한 줄이 아닙니다");
  if (/\d\s?[만천]|[만천]\s?원|원대/.test(reason)) {
    problems.push("한글 숫자·어림 표현(예: 2만 원대)을 썼습니다");
  }

  let rest = reason;
  let count = 0;
  const take = (pattern: RegExp, check: (match: RegExpMatchArray) => string | null) => {
    for (const match of reason.matchAll(pattern)) {
      count += 1;
      const problem = check(match);
      if (problem) problems.push(problem);
      rest = rest.replace(match[0], " ");
    }
  };

  const price = restaurant.pricePerPerson.toLocaleString("ko-KR");
  take(/1인\s?([\d,]+)원/g, (m) =>
    m[1] === price ? null : `1인 가격이 목록 값과 다릅니다 (${m[1]}원, 목록 ${price}원)`,
  );
  take(/도보\s?(\d+)분/g, (m) =>
    Number(m[1]) === restaurant.walkMinutes
      ? null
      : `도보 시간이 목록 값과 다릅니다 (${m[1]}분, 목록 ${restaurant.walkMinutes}분)`,
  );
  take(/(최대|룸)?\s?(\d+)명/g, (m) => {
    const n = Number(m[2]);
    if (m[1] === "최대") return n === restaurant.maxCapacity ? null : `최대 인원이 목록 값과 다릅니다 (${n}명)`;
    if (m[1] === "룸") return n === restaurant.roomCapacity ? null : `룸 인원이 목록 값과 다릅니다 (${n}명)`;
    return [people, restaurant.maxCapacity, restaurant.roomCapacity].includes(n)
      ? null
      : `인원 숫자가 목록 값·입력 인원과 다릅니다 (${n}명)`;
  });

  if (count < MIN_REASON_NUMBERS) {
    problems.push(`숫자 항목이 ${MIN_REASON_NUMBERS}개 이상 필요합니다 (${count}개)`);
  }
  if (/\d/.test(rest.replace(/1인/g, " "))) {
    problems.push("정해진 표기(1인 N원·도보 N분·N명) 밖의 숫자가 있습니다");
  }
  return problems;
}

/** 같은 메뉴가 2곳을 넘으면 AI가 매긴 순서상 뒤의 것을 뺀다 (Design §2.2 처리 9) */
export function limitSameCuisine(recommendations: readonly Recommendation[]): CheckedPicks {
  const kept: Recommendation[] = [];
  const problems: string[] = [];
  const count = new Map<Cuisine, number>();
  for (const r of recommendations) {
    const n = count.get(r.cuisine) ?? 0;
    if (n >= MAX_SAME_CUISINE) {
      problems.push(`같은 메뉴(${r.cuisine})를 ${MAX_SAME_CUISINE}곳보다 많이 골랐습니다: ${r.id}`);
      continue;
    }
    count.set(r.cuisine, n + 1);
    kept.push(r);
  }
  return { recommendations: kept, problems };
}

// ── AI 답 검토 → 1회 다시 요청 → 보정 (PLAN 작업 12) ─────────────────────

/** AI에게 고르기를 요청하는 함수. feedback이 있으면 이전 답의 문제를 함께 보낸다. */
export type AskAi = (feedback?: string) => Promise<AiPick[]>;

type Review = CheckedPicks & {
  /** 이유 규칙을 어긴 가게 id (보정 때 기본 문장으로 바꾼다) */
  badReasonIds: Set<string>;
};

/** AI 답 하나를 모든 규칙으로 검토한다 (고치지는 않고 문제만 모은다) */
function review(
  picks: readonly AiPick[],
  candidates: readonly Restaurant[],
  conditions: FilterConditions,
): Review {
  const checked = checkAiPicks(picks, candidates);
  const limited = limitSameCuisine(checked.recommendations);
  const problems = [...checked.problems, ...limited.problems];
  const badReasonIds = new Set<string>();

  for (const r of limited.recommendations) {
    const reasonProblems = checkReason(r.reason, r, conditions.people);
    if (reasonProblems.length > 0) {
      badReasonIds.add(r.id);
      problems.push(`${r.id}의 이유 "${r.reason}": ${reasonProblems.join(", ")}`);
    }
  }

  const expected = Math.min(RECOMMEND_COUNT, candidates.length);
  if (limited.recommendations.length < expected) {
    problems.push(`${expected}곳을 골라야 하는데 규칙에 맞는 가게가 ${limited.recommendations.length}곳뿐입니다`);
  }
  return { recommendations: limited.recommendations, problems, badReasonIds };
}

export type PickResult = {
  /** 최종 추천 (후보가 3곳 이상이면 메뉴 규칙이 허락하는 한 정확히 3곳) */
  recommendations: Recommendation[];
  /** 다시 요청했는지 */
  retried: boolean;
  /** 최종 답에 남아 있던 문제 (코드가 보정함). 서버 기록용 */
  problems: string[];
};

/**
 * AI 답을 받아 검토하고, 문제가 있으면 1회 다시 요청한 뒤, 남은 문제는 코드로 보정한다.
 * - 이유 규칙 위반 → 기본 문장으로 교체
 * - 같은 메뉴 3곳 → 뒤의 것 제외
 * - 모자란 자리 → 후보에서 가까운 순으로 채움 (메뉴 규칙 지킴)
 * 첫 요청이 실패하면 오류를 그대로 던진다. 다시 요청이 실패하면 첫 답을 보정해서 쓴다.
 * 후보가 0곳이면 호출하지 않는다 (호출하는 쪽에서 먼저 막는다).
 */
export async function pickWithRetry(
  ask: AskAi,
  candidates: readonly Restaurant[],
  conditions: FilterConditions,
): Promise<PickResult> {
  let result = review(await ask(), candidates, conditions);
  let retried = false;

  if (result.problems.length > 0) {
    retried = true;
    const feedback = result.problems.map((p) => `- ${p}`).join("\n");
    try {
      result = review(await ask(feedback), candidates, conditions);
    } catch {
      // 다시 요청이 실패하면 첫 답을 보정해서 쓴다
    }
  }

  const fixed = result.recommendations.map((r) =>
    result.badReasonIds.has(r.id) ? { ...r, reason: defaultReason(r, conditions) } : r,
  );
  return {
    recommendations: fillRecommendations(fixed, candidates, conditions),
    retried,
    problems: result.problems,
  };
}
