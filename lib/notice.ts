// PRD nice ① — 회식 공지 문구 만들기 (PLAN 작업 25)
// 날짜·장소·인원으로 단체방에 붙여 넣을 공지문을 만든다. 200자 이내, 참석자 이름은 넣지 않는다.
// AI를 쓰지 않고 정해진 틀에 값을 채우므로 길이와 내용이 항상 보장된다.
import type { Restaurant } from "./types";

/** 공지문 최대 글자 수 — PRD nice */
export const MAX_NOTICE_LENGTH = 200;

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

/** "2026-11-14" → "11월 14일(토)". 형식이 맞지 않거나 없는 날짜면 undefined */
export function formatDate(value: string): string | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return undefined;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  const valid =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return valid ? `${month}월 ${day}일(${WEEKDAYS[date.getUTCDay()]})` : undefined;
}

type AnnouncementInput = {
  restaurant: Pick<Restaurant, "name" | "pricePerPerson">;
  /** 인원(명) — 숫자만 쓴다. 이름은 받지 않는다. */
  people: number;
  /** 날짜 칸 값 ("YYYY-MM-DD"). 비우면 "추후 공지" */
  date?: string;
};

/** 공지문을 만든다. 200자를 넘으면 가게 이름을 줄여서(…) 항상 200자 이내로 맞춘다. */
export function buildAnnouncement({ restaurant, people, date }: AnnouncementInput): string {
  const when = (date && formatDate(date)) || "추후 공지";
  const build = (name: string) =>
    [
      "[팀 회식 안내]",
      `일시: ${when}`,
      `장소: ${name}`,
      `인원: ${people}명`,
      `1인 예상 비용: ${restaurant.pricePerPerson.toLocaleString("ko-KR")}원`,
      "예약은 담당자가 가게에 직접 전화로 진행합니다.",
      "참석 여부를 답글로 알려 주세요.",
    ].join("\n");

  const name = restaurant.name.trim();
  const text = build(name);
  if (text.length <= MAX_NOTICE_LENGTH) return text;

  const over = text.length - MAX_NOTICE_LENGTH + 1; // 줄임표(…) 한 글자 자리
  return build(`${name.slice(0, Math.max(1, name.length - over))}…`);
}
