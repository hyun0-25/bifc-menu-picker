"use client";

// Design Ref: §5.1 ②·§5.3 — 추천 영역 (브라우저에서 동작)
// 지금 단계(PLAN 작업 15): 목적 선택 탭. 조건 입력 폼(작업 16)·결과 표시(작업 19)는 이어서 이 부품에 붙인다.
import { useState } from "react";
import type { Purpose } from "@/lib/types";

const PURPOSES: { value: Purpose; label: string; hint: string }[] = [
  { value: "lunch", label: "점심 약속", hint: "동료·손님과 가볍게 먹을 곳을 찾아요" },
  { value: "dinner", label: "팀 회식", hint: "여럿이 함께 갈 회식 장소를 찾아요" },
];

export default function RecommendForm() {
  const [purpose, setPurpose] = useState<Purpose>("lunch");
  const current = PURPOSES.find((p) => p.value === purpose)!;

  return (
    <section aria-label="추천 조건" className="flex flex-col gap-3">
      <div
        role="group"
        aria-label="목적"
        className="grid grid-cols-2 gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800"
      >
        {PURPOSES.map((p) => {
          const selected = p.value === purpose;
          return (
            <button
              key={p.value}
              type="button"
              aria-pressed={selected}
              onClick={() => setPurpose(p.value)}
              className={`h-11 rounded-lg text-base font-semibold transition-colors ${
                selected
                  ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-950 dark:text-zinc-50"
                  : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{current.hint}</p>
    </section>
  );
}
