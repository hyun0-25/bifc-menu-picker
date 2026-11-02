"use client";

// Design Ref: §5.1 ②~④·§5.3·§5.4 — 추천 영역 (브라우저에서 동작)
// 지금 단계(PLAN 작업 17): 목적 선택 + 조건 입력 폼 + 입력 검사. 제출과 결과 표시(작업 18~19)는 이어서 붙인다.
import { useId, useState, type ChangeEvent, type FormEvent } from "react";
import { validateFormValues, type FormValues } from "@/lib/schema";
import { CUISINES, DEFAULT_WALK_MINUTES, INPUT_LIMITS, type Cuisine, type Purpose } from "@/lib/types";

const PURPOSES: { value: Purpose; label: string; hint: string }[] = [
  { value: "lunch", label: "점심 약속", hint: "동료·손님과 가볍게 먹을 곳을 찾아요" },
  { value: "dinner", label: "팀 회식", hint: "여럿이 함께 갈 회식 장소를 찾아요" },
];

const EMPTY_FORM: FormValues = {
  purpose: "lunch",
  people: "",
  budget: "",
  cuisines: [],
  maxWalkMinutes: "",
  needRoom: false,
  needReservation: false,
};

/** 입력 칸 순서 (검사 실패 시 첫 번째로 틀린 칸에 커서를 옮길 때 쓴다) */
const NUMBER_FIELDS = ["people", "budget", "maxWalkMinutes"] as const;
type NumberField = (typeof NUMBER_FIELDS)[number];

const inputBase =
  "h-11 w-full rounded-lg border bg-white px-3 text-base text-zinc-900 placeholder:text-zinc-400 focus:outline-none dark:bg-zinc-900 dark:text-zinc-50";
const inputOk =
  "border-zinc-300 focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-300";
const inputError = "border-red-500 focus:border-red-600 dark:border-red-400";

export default function RecommendForm() {
  const [form, setForm] = useState<FormValues>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const id = useId();
  const current = PURPOSES.find((p) => p.value === form.purpose)!;
  const { people, budget, maxWalkMinutes } = INPUT_LIMITS;

  /** 칸 값을 바꾸면 그 칸의 안내는 지운다 (다시 제출할 때 새로 검사) */
  const update = <K extends keyof FormValues>(key: K, value: FormValues[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!(key in prev) && !("form" in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      delete next.form;
      return next;
    });
  };

  const choosePurpose = (next: Purpose) => {
    update("purpose", next);
    // 룸·예약은 팀 회식에서만 묻는다. 점심으로 바꾸면 체크를 지워 다른 목적의 값이 남지 않게 한다.
    if (next === "lunch") setForm((prev) => ({ ...prev, needRoom: false, needReservation: false }));
  };

  const toggleCuisine = (cuisine: Cuisine) =>
    update(
      "cuisines",
      form.cuisines.includes(cuisine)
        ? form.cuisines.filter((c) => c !== cuisine)
        : [...form.cuisines, cuisine],
    );

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = validateFormValues(form);
    if (!result.ok) {
      setErrors(result.fields);
      // 첫 번째로 틀린 칸에 커서를 옮겨, 화면 읽기 프로그램도 안내를 바로 읽게 한다
      const first = NUMBER_FIELDS.find((field) => field in result.fields);
      if (first) document.getElementById(`${id}-${first}`)?.focus();
      return;
    }
    setErrors({});
    // 서버 호출(작업 18)을 여기에 붙인다: result.request를 POST /api/recommend로 보낸다.
  };

  /** 숫자 칸 공통 속성: 틀렸으면 빨간 테두리 + 안내 문구 연결 */
  const numberFieldProps = (field: NumberField, extraClass: string) => ({
    id: `${id}-${field}`,
    type: "number",
    inputMode: "numeric" as const,
    value: form[field],
    onChange: (e: ChangeEvent<HTMLInputElement>) => update(field, e.target.value),
    "aria-invalid": field in errors,
    "aria-describedby": field in errors ? `${id}-${field}-error` : undefined,
    className: `${inputBase} ${field in errors ? inputError : inputOk} ${extraClass}`,
  });

  const fieldError = (field: string) =>
    errors[field] ? (
      <p id={`${id}-${field}-error`} className="text-sm text-red-600 dark:text-red-400">
        {errors[field]}
      </p>
    ) : null;

  return (
    <section aria-label="추천 조건" className="flex flex-col gap-3">
      <div
        role="group"
        aria-label="목적"
        className="grid grid-cols-2 gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800"
      >
        {PURPOSES.map((p) => {
          const selected = p.value === form.purpose;
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
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-people`} className="text-sm font-medium">
              인원
            </label>
            <div className="relative">
              <input
                {...numberFieldProps("people", "pr-9")}
                min={people.min}
                max={people.max}
                step={1}
                placeholder={form.purpose === "lunch" ? "예: 4" : "예: 10"}
              />
              <span aria-hidden="true" className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-zinc-500">
                명
              </span>
            </div>
            {fieldError("people")}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-budget`} className="text-sm font-medium">
              1인 예산
            </label>
            <div className="relative">
              <input
                {...numberFieldProps("budget", "pr-9")}
                min={budget.min}
                max={budget.max}
                step={1000}
                placeholder={form.purpose === "lunch" ? "예: 15000" : "예: 30000"}
              />
              <span aria-hidden="true" className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-zinc-500">
                원
              </span>
            </div>
            {fieldError("budget")}
          </div>
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
          {fieldError("cuisines")}
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 flex flex-col gap-1.5 sm:col-span-1">
            <label htmlFor={`${id}-maxWalkMinutes`} className="text-sm font-medium">
              도보 거리{" "}
              <span className="font-normal text-zinc-500">
                (비우면 {DEFAULT_WALK_MINUTES[form.purpose]}분 이내)
              </span>
            </label>
            <div className="relative">
              <input
                {...numberFieldProps("maxWalkMinutes", "pr-16")}
                min={maxWalkMinutes.min}
                max={maxWalkMinutes.max}
                step={1}
                placeholder={`기본 ${DEFAULT_WALK_MINUTES[form.purpose]}`}
              />
              <span aria-hidden="true" className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-zinc-500">
                분 이내
              </span>
            </div>
            {fieldError("maxWalkMinutes")}
          </div>
        </div>

        {form.purpose === "dinner" && (
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

        {fieldError("form")}
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
