"use client";

// Design Ref: §5.1 ②~④·§5.3 — 추천 영역 (브라우저에서 동작)
// 지금 단계(PLAN 작업 16): 목적 선택 + 조건 입력 폼. 입력 검사(작업 17)·제출과 결과 표시(작업 18~19)는 이어서 붙인다.
import { useId, useState, type FormEvent } from "react";
import { CUISINES, DEFAULT_WALK_MINUTES, INPUT_LIMITS, type Cuisine, type Purpose } from "@/lib/types";

const PURPOSES: { value: Purpose; label: string; hint: string }[] = [
  { value: "lunch", label: "점심 약속", hint: "동료·손님과 가볍게 먹을 곳을 찾아요" },
  { value: "dinner", label: "팀 회식", hint: "여럿이 함께 갈 회식 장소를 찾아요" },
];

/** 입력 칸 값. 숫자 칸은 비워 둘 수 있도록 글자로 보관한다. */
type FormState = {
  people: string;
  budget: string;
  cuisines: Cuisine[];
  maxWalkMinutes: string;
  needRoom: boolean;
  needReservation: boolean;
};

const EMPTY_FORM: FormState = {
  people: "",
  budget: "",
  cuisines: [],
  maxWalkMinutes: "",
  needRoom: false,
  needReservation: false,
};

const inputClass =
  "h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-base text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-900 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:border-zinc-300";

export default function RecommendForm() {
  const [purpose, setPurpose] = useState<Purpose>("lunch");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const id = useId();
  const current = PURPOSES.find((p) => p.value === purpose)!;
  const { people, budget, maxWalkMinutes } = INPUT_LIMITS;

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const choosePurpose = (next: Purpose) => {
    setPurpose(next);
    // 룸·예약은 팀 회식에서만 묻는다. 점심으로 바꾸면 체크를 지워 다른 목적의 값이 남지 않게 한다.
    if (next === "lunch") setForm((prev) => ({ ...prev, needRoom: false, needReservation: false }));
  };

  const toggleCuisine = (cuisine: Cuisine) =>
    setForm((prev) => ({
      ...prev,
      cuisines: prev.cuisines.includes(cuisine)
        ? prev.cuisines.filter((c) => c !== cuisine)
        : [...prev.cuisines, cuisine],
    }));

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // 입력 검사(작업 17)와 서버 호출(작업 18)을 여기에 붙인다.
  };

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
              onClick={() => choosePurpose(p.value)}
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

      <form onSubmit={handleSubmit} noValidate className="mt-2 flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-3">
          <label htmlFor={`${id}-people`} className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">인원</span>
            <div className="relative">
              <input
                id={`${id}-people`}
                type="number"
                inputMode="numeric"
                min={people.min}
                max={people.max}
                step={1}
                placeholder={purpose === "lunch" ? "예: 4" : "예: 10"}
                value={form.people}
                onChange={(e) => update("people", e.target.value)}
                className={`${inputClass} pr-9`}
              />
              <span aria-hidden="true" className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-zinc-500">
                명
              </span>
            </div>
          </label>

          <label htmlFor={`${id}-budget`} className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">1인 예산</span>
            <div className="relative">
              <input
                id={`${id}-budget`}
                type="number"
                inputMode="numeric"
                min={budget.min}
                max={budget.max}
                step={1000}
                placeholder={purpose === "lunch" ? "예: 15000" : "예: 30000"}
                value={form.budget}
                onChange={(e) => update("budget", e.target.value)}
                className={`${inputClass} pr-9`}
              />
              <span aria-hidden="true" className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-zinc-500">
                원
              </span>
            </div>
          </label>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-medium">
            메뉴 취향{" "}
            <span className="font-normal text-zinc-500">
              (여러 개 선택 가능, 안 고르면 상관없음)
            </span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {CUISINES.map((cuisine) => {
              const selected = form.cuisines.includes(cuisine);
              return (
                <button
                  key={cuisine}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleCuisine(cuisine)}
                  className={`h-9 rounded-full border px-4 text-sm transition-colors ${
                    selected
                      ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                      : "border-zinc-300 text-zinc-700 hover:border-zinc-500 dark:border-zinc-700 dark:text-zinc-300"
                  }`}
                >
                  {cuisine}
                </button>
              );
            })}
          </div>
        </fieldset>

        <label htmlFor={`${id}-walk`} className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">
            도보 거리{" "}
            <span className="font-normal text-zinc-500">
              (비우면 {DEFAULT_WALK_MINUTES[purpose]}분 이내)
            </span>
          </span>
          <div className="relative w-1/2 pr-1.5">
            <input
              id={`${id}-walk`}
              type="number"
              inputMode="numeric"
              min={maxWalkMinutes.min}
              max={maxWalkMinutes.max}
              step={1}
              placeholder={`기본 ${DEFAULT_WALK_MINUTES[purpose]}`}
              value={form.maxWalkMinutes}
              onChange={(e) => update("maxWalkMinutes", e.target.value)}
              className={`${inputClass} pr-16`}
            />
            <span aria-hidden="true" className="pointer-events-none absolute top-1/2 right-4.5 -translate-y-1/2 text-sm text-zinc-500">
              분 이내
            </span>
          </div>
        </label>

        {purpose === "dinner" && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-sm font-medium">회식 조건</legend>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <label className="flex items-center gap-2 text-base">
                <input
                  type="checkbox"
                  checked={form.needRoom}
                  onChange={(e) => update("needRoom", e.target.checked)}
                  className="size-5 accent-zinc-900 dark:accent-zinc-100"
                />
                룸(단체석) 필요
              </label>
              <label className="flex items-center gap-2 text-base">
                <input
                  type="checkbox"
                  checked={form.needReservation}
                  onChange={(e) => update("needReservation", e.target.checked)}
                  className="size-5 accent-zinc-900 dark:accent-zinc-100"
                />
                예약 필요
              </label>
            </div>
          </fieldset>
        )}

        <button
          type="submit"
          className="h-12 rounded-xl bg-zinc-900 text-base font-semibold text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          추천 받기
        </button>
      </form>
    </section>
  );
}
