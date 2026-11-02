// Design Ref: §2.2 처리 5 — 식당 목록 파일 읽기와 형식 검사
// 요청마다 파일을 새로 읽으므로, 관리자가 파일을 고치면 다음 추천부터 바로 반영된다.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { restaurantSchema } from "./schema";
import type { Restaurant } from "./types";

/** 목록 파일 위치 (프로젝트 폴더 기준) */
export const RESTAURANTS_FILE = join(process.cwd(), "data", "restaurants.json");

/** 목록 파일에 문제가 있을 때 던지는 오류. problems에 문제 목록이 한국어로 담긴다. */
export class RestaurantDataError extends Error {
  constructor(public readonly problems: string[]) {
    super(`식당 목록 파일에 문제가 ${problems.length}건 있습니다:\n- ${problems.join("\n- ")}`);
    this.name = "RestaurantDataError";
  }
}

export type ValidationResult =
  | { ok: true; restaurants: Restaurant[] }
  | { ok: false; problems: string[] };

/**
 * 목록 데이터를 검사한다. 문제를 하나만 찾고 멈추지 않고 모든 문제를 모아서 돌려준다.
 * 문제 문구 예: "3번째 가게(r03): 도보 시간은 15분 이하여야 합니다"
 */
export function validateRestaurants(data: unknown): ValidationResult {
  if (!Array.isArray(data)) {
    return { ok: false, problems: ["목록 파일은 [ ]로 감싼 배열이어야 합니다"] };
  }
  if (data.length === 0) {
    return { ok: false, problems: ["목록에 가게가 한 곳도 없습니다"] };
  }

  const problems: string[] = [];
  const restaurants: Restaurant[] = [];
  const seenIds = new Map<string, number>();

  data.forEach((item, index) => {
    const id =
      item && typeof item === "object" && typeof item.id === "string" ? item.id : "번호 없음";
    const label = `${index + 1}번째 가게(${id})`;
    const parsed = restaurantSchema.safeParse(item);

    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        problems.push(`${label}: ${issue.message}`);
      }
      return;
    }

    const firstIndex = seenIds.get(parsed.data.id);
    if (firstIndex !== undefined) {
      problems.push(`${label}: 고유 번호가 ${firstIndex + 1}번째 가게와 겹칩니다`);
      return;
    }
    seenIds.set(parsed.data.id, index);
    restaurants.push(parsed.data);
  });

  return problems.length > 0 ? { ok: false, problems } : { ok: true, restaurants };
}

/** 목록 파일을 읽고 검사해 식당 목록을 돌려준다. 문제가 있으면 RestaurantDataError를 던진다. */
export async function loadRestaurants(filePath: string = RESTAURANTS_FILE): Promise<Restaurant[]> {
  let text: string;
  try {
    text = await readFile(filePath, "utf8");
  } catch {
    throw new RestaurantDataError([`목록 파일을 찾지 못했습니다: ${filePath}`]);
  }

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new RestaurantDataError([
      "목록 파일의 JSON 문법이 틀렸습니다 (쉼표·따옴표·괄호를 확인)",
    ]);
  }

  const result = validateRestaurants(data);
  if (!result.ok) {
    throw new RestaurantDataError(result.problems);
  }
  return result.restaurants;
}
