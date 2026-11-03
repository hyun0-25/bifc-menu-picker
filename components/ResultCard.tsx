// Design Ref: §5.1 ⑥·§5.3 — 결과 카드: 가게 한 곳의 추천 이유와 목록 값
// 숫자는 모두 서버가 목록 파일 값으로 채운 것이다 (PRD must ② 규칙 3: 값을 바꾸거나 짐작하지 않음).
import { UNKNOWN, type Recommendation, type ReservationStatus } from "@/lib/types";

const RESERVATION_LABEL: Record<ReservationStatus, string> = {
  가능: "예약 가능",
  불가: "예약 불가",
  "정보 없음": "예약 정보 없음",
};

type Props = {
  /** 추천 순위 (1부터) */
  rank: number;
  restaurant: Recommendation;
  /** 팀 회식 결과에서만 넘긴다. 있으면 "회식 공지문 만들기" 버튼을 보여 준다 */
  onMakeNotice?: () => void;
  /** 이번에 입력한 추가 조건. 있으면 "취향 근거"(맞다고 본 메뉴)를 보여 준다 */
  extraWish?: string;
};

export default function ResultCard({ rank, restaurant: r, onMakeNotice, extraWish }: Props) {
  const details = [
    { label: "1인 가격", value: `${r.pricePerPerson.toLocaleString("ko-KR")}원` },
    { label: "도보", value: `${r.walkMinutes}분` },
    { label: "최대 인원", value: r.maxCapacity === UNKNOWN ? UNKNOWN : `${r.maxCapacity}명` },
    { label: "단체석", value: r.groupSeating ? "있음" : "표시 없음" },
    {
      label: "룸",
      value:
        r.hasRoom === UNKNOWN
          ? UNKNOWN
          : !r.hasRoom
            ? "없음"
            : r.roomCapacity === UNKNOWN
              ? "있음 (인원 정보 없음)"
              : `${r.roomCapacity}명`,
    },
    { label: "예약", value: RESERVATION_LABEL[r.reservation] },
  ];

  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <header className="flex items-start gap-2">
        <span
          aria-hidden="true"
          className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-xs font-bold text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          {rank}
        </span>
        {/* 한글은 단어 단위로 줄을 바꾸되(break-keep), 띄어쓰기 없는 긴 이름은 화면을 넘지 않게 중간에서도 끊는다 */}
        <h3 className="min-w-0 flex-1 text-lg leading-snug font-bold break-keep [overflow-wrap:anywhere]">
          <span className="sr-only">{rank}위 </span>
          {r.name}
        </h3>
        <span className="mt-0.5 shrink-0 rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          {r.cuisine}
        </span>
      </header>

      <p className="font-semibold break-keep text-zinc-900 [overflow-wrap:anywhere] dark:text-zinc-50">{r.reason}</p>

      <dl className="grid grid-cols-3 gap-x-3 gap-y-2 text-sm">
        {details.map((d) => (
          <div key={d.label} className="flex flex-col">
            <dt className="text-xs text-zinc-500 dark:text-zinc-400">{d.label}</dt>
            <dd className="font-medium break-keep text-zinc-800 dark:text-zinc-200">{d.value}</dd>
          </div>
        ))}
      </dl>

      {extraWish && (
        <p className="rounded-lg bg-zinc-100 px-3 py-2 text-sm break-keep text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          <span className="font-semibold">AI가 본 취향 근거(참고) ·</span>{" "}
          {r.matchedMenus && r.matchedMenus.length > 0
            ? `${r.matchedMenus.join(", ")} 메뉴가 있어요`
            : "추가 조건과 직접 맞는 메뉴 정보는 없어요"}
        </p>
      )}

      {onMakeNotice && (
        <button
          type="button"
          onClick={onMakeNotice}
          className="h-11 rounded-lg border border-zinc-300 text-sm font-semibold text-zinc-800 transition-colors hover:border-zinc-500 dark:border-zinc-700 dark:text-zinc-200"
        >
          이 가게로 회식 공지문 만들기
        </button>
      )}
    </article>
  );
}
