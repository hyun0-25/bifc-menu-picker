// Design Ref: §5.1 ⑥·§5.3 — 결과 카드: 가게 한 곳의 추천 이유와 목록 값
// 숫자는 모두 서버가 목록 파일 값으로 채운 것이다 (PRD must ② 규칙 3: 값을 바꾸거나 짐작하지 않음).
import type { Recommendation, ReservationStatus } from "@/lib/types";

const RESERVATION_LABEL: Record<ReservationStatus, string> = {
  가능: "예약 가능",
  불가: "예약 불가",
  "정보 없음": "예약 정보 없음",
};

type Props = {
  /** 추천 순위 (1부터) */
  rank: number;
  restaurant: Recommendation;
};

export default function ResultCard({ rank, restaurant: r }: Props) {
  const details = [
    { label: "1인 가격", value: `${r.pricePerPerson.toLocaleString("ko-KR")}원` },
    { label: "도보", value: `${r.walkMinutes}분` },
    { label: "최대 인원", value: `${r.maxCapacity}명` },
    { label: "룸", value: r.hasRoom ? `${r.roomCapacity}명` : "없음" },
    { label: "예약", value: RESERVATION_LABEL[r.reservation] },
  ];

  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <header className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="flex size-6 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-xs font-bold text-white dark:bg-zinc-100 dark:text-zinc-900"
        >
          {rank}
        </span>
        <h3 className="min-w-0 flex-1 text-lg leading-snug font-bold break-keep">
          <span className="sr-only">{rank}위 </span>
          {r.name}
        </h3>
        <span className="shrink-0 rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          {r.cuisine}
        </span>
      </header>

      <p className="font-semibold text-zinc-900 dark:text-zinc-50">{r.reason}</p>

      <dl className="grid grid-cols-3 gap-x-3 gap-y-2 text-sm sm:grid-cols-5">
        {details.map((d) => (
          <div key={d.label} className="flex flex-col">
            <dt className="text-xs text-zinc-500 dark:text-zinc-400">{d.label}</dt>
            <dd className="font-medium text-zinc-800 dark:text-zinc-200">{d.value}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}
