// Design Ref: §5.1 ⑥·§5.3 — 결과 카드: 가게 한 곳의 추천 이유와 목록 값
// 숫자는 모두 서버가 목록 파일 값으로 채운 것이다 (PRD must ② 규칙 3: 값을 바꾸거나 짐작하지 않음).
import { UNKNOWN, type Recommendation, type ReservationStatus } from "@/lib/types";

const RESERVATION_LABEL: Record<ReservationStatus, string> = {
  가능: "예약 가능",
  불가: "예약 불가",
  "정보 없음": "예약 정보 없음",
};

/** 카카오맵 장소 페이지 주소. 목록의 출처(source)가 카카오맵이면 그대로, 아니면 가게 이름 검색 주소 */
function mapUrl(r: Recommendation): string {
  if (r.source?.startsWith("https://place.map.kakao.com/")) return r.source;
  return `https://map.kakao.com/link/search/${encodeURIComponent(r.name)}`;
}

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
    ...(r.driveMinutes !== undefined ? [{ label: "차량", value: `약 ${r.driveMinutes}분` }] : []),
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
    <article className="glass-card enter flex flex-col gap-3 p-5"
      style={{ "--d": `${(rank - 1) * 0.12}s` } as React.CSSProperties}>
      <header className="flex items-start gap-2">
        <span
          aria-hidden="true"
          className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-[#5b875c] text-sm font-bold text-white"
        >
          {rank}
        </span>
        {/* 한글은 단어 단위로 줄을 바꾸되(break-keep), 띄어쓰기 없는 긴 이름은 화면을 넘지 않게 중간에서도 끊는다 */}
        <h3 className="min-w-0 flex-1 font-display text-xl leading-snug break-keep [overflow-wrap:anywhere]">
          <span className="sr-only">{rank}위 </span>
          <a
            href={mapUrl(r)}
            target="_blank"
            rel="noopener noreferrer"
            title="카카오맵에서 위치와 가게 정보 보기"
            className="underline decoration-zinc-300 underline-offset-4 hover:decoration-zinc-600 dark:decoration-zinc-600"
          >
            {r.name}
            <span className="sr-only"> (카카오맵에서 보기, 새 창)</span>
          </a>
        </h3>
        <span className="mt-0.5 shrink-0 rounded-full bg-[rgba(173,196,174,.45)] px-3 py-0.5 text-xs font-medium text-[#3f6b41]">
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

      <a
        href={mapUrl(r)}
        target="_blank"
        rel="noopener noreferrer"
        className="flex h-10 items-center justify-center rounded-full bg-[rgba(204,218,173,.55)] text-sm font-semibold text-[#3f6b41] transition-colors hover:bg-[rgba(204,218,173,.85)]"
      >
        📍 카카오맵에서 위치 보기
      </a>

      {extraWish && (
        <p className="rounded-xl bg-[rgba(173,196,174,.28)] px-3 py-2 text-sm break-keep text-zinc-700">
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
          className="h-11 rounded-full border border-[#5b875c]/50 text-sm font-semibold text-[#3f6b41] transition-colors hover:border-[#5b875c] hover:bg-white"
        >
          이 가게로 회식 공지문 만들기
        </button>
      )}
    </article>
  );
}
