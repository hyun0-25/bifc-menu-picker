"use client";

// Design Ref: §5.1 ②~④·§5.3·§5.4 — 추천 영역 (브라우저에서 동작)
// 구성(PLAN 작업 15~20): 목적 선택 + 조건 입력 폼 + 입력 검사 + 제출 + 안내·오류 띠 + 결과 카드.
import { useId, useState, type ChangeEvent, type FormEvent } from "react";
import NoticeBanner from "@/components/NoticeBanner";
import AnnouncementPanel from "@/components/AnnouncementPanel";
import ResultCard from "@/components/ResultCard";
import { validateFormValues, type FormValues } from "@/lib/schema";
import {
  CUISINES,
  DEFAULT_WALK_MINUTES,
  INPUT_LIMITS,
  type Cuisine,
  type ErrorResponse,
  type Purpose,
  type RecommendRequest,
  type RecommendResponse,
} from "@/lib/types";

/** 서버가 AI 재요청까지 마치는 데 걸릴 수 있는 시간보다 조금 길게 기다린다 (AI 1회 최대 20초 × 2) */
const CLIENT_TIMEOUT_MS = 45_000;

type SubmitResult =
  | { kind: "ok"; data: RecommendResponse }
  | { kind: "invalid"; fields: Record<string, string> }
  | { kind: "error"; message: string };

/** 추천 요청을 서버에 보내고, 응답을 화면에서 쓰기 쉬운 모양으로 바꾼다 */
async function requestRecommendation(request: RecommendRequest): Promise<SubmitResult> {
  let res: Response;
  try {
    res = await fetch("/api/recommend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      return { kind: "error", message: "추천이 늦어지고 있어요. 잠시 후 다시 시도해 주세요." };
    }
    return { kind: "error", message: "서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요." };
  }

  try {
    if (res.ok) return { kind: "ok", data: (await res.json()) as RecommendResponse };
    const { error } = (await res.json()) as ErrorResponse;
    if (error.code === "INVALID_INPUT" && error.fields) return { kind: "invalid", fields: error.fields };
    return { kind: "error", message: error.message };
  } catch {
    return { kind: "error", message: "추천을 받지 못했어요. 잠시 후 다시 시도해 주세요." };
  }
}

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
  extra: "",
};

/** 입력 칸 순서 (검사 실패 시 첫 번째로 틀린 칸에 커서를 옮길 때 쓴다) */
const NUMBER_FIELDS = ["people", "budget", "maxWalkMinutes"] as const;
type NumberField = (typeof NUMBER_FIELDS)[number];
/** 검사 실패 시 커서를 옮길 칸의 순서 (추가 조건 칸은 맨 뒤) */
const FOCUS_ORDER = [...NUMBER_FIELDS, "extra"] as const;

const inputBase =
  "h-11 w-full rounded-lg border bg-white px-3 text-base text-zinc-900 placeholder:text-zinc-400 focus:outline-none dark:bg-zinc-900 dark:text-zinc-50";
const inputOk =
  "border-zinc-300 focus:border-zinc-900 dark:border-zinc-700 dark:focus:border-zinc-300";
const inputError = "border-red-500 focus:border-red-600 dark:border-red-400";

export default function RecommendForm() {
  const [form, setForm] = useState<FormValues>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  /** 마지막으로 받은 추천 결과 */
  const [response, setResponse] = useState<RecommendResponse | null>(null);
  /** 결과를 받을 때 보낸 목적·인원 (공지문 만들기에 쓴다) */
  const [submitted, setSubmitted] = useState<{ purpose: Purpose; people: number; extra?: string } | null>(null);
  /** 공지문을 만드는 중인 가게 id */
  const [noticeFor, setNoticeFor] = useState<string | null>(null);
  /** 서버·AI 오류 문구 */
  const [requestError, setRequestError] = useState<string | null>(null);
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

  /** 칸별 안내를 보여 주고 첫 번째로 틀린 칸에 커서를 옮긴다 (화면 읽기 프로그램도 안내를 바로 읽게) */
  const showFieldErrors = (fields: Record<string, string>) => {
    setErrors(fields);
    const first = FOCUS_ORDER.find((field) => field in fields);
    if (first) document.getElementById(`${id}-${first}`)?.focus();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;

    const checked = validateFormValues(form);
    if (!checked.ok) {
      showFieldErrors(checked.fields);
      return;
    }

    setErrors({});
    setRequestError(null);
    setLoading(true);
    const result = await requestRecommendation(checked.request);
    setLoading(false);

    if (result.kind === "ok") {
      setResponse(result.data);
      // 공지문은 "이번에 받은 결과"의 목적·인원 기준으로 만든다 (그 뒤에 폼을 고쳐도 결과와 어긋나지 않게)
      setSubmitted({
        purpose: checked.request.purpose,
        people: checked.request.people,
        extra: checked.request.extra,
      });
      setNoticeFor(null);
    } else if (result.kind === "invalid") showFieldErrors(result.fields);
    else setRequestError(result.message);
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
                  className={`h-10 rounded-full border px-4 text-sm transition-colors ${
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

        {/* 추가 조건(자연어): 필터가 아니라 AI가 메뉴 이름을 보고 우선해서 고르는 참고 기준 */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-extra`} className="text-sm font-medium">
            추가로 원하는 점 <span className="font-normal text-zinc-500">(선택)</span>
          </label>
          <input
            id={`${id}-extra`}
            type="text"
            maxLength={INPUT_LIMITS.extra.max + 20}
            autoComplete="off"
            placeholder="예: MZ가 좋아할 만한, 느끼하지 않은, 매콤한"
            value={form.extra}
            onChange={(e) => update("extra", e.target.value)}
            aria-invalid={"extra" in errors}
            aria-describedby={`${id}-extra-hint${"extra" in errors ? ` ${id}-extra-error` : ""}`}
            className={`${inputBase} ${"extra" in errors ? inputError : inputOk}`}
          />
          <p id={`${id}-extra-hint`} className="flex justify-between gap-3 text-xs text-zinc-500 dark:text-zinc-400">
            <span>
              가게의 메뉴 이름을 보고 AI가 참고만 해요. 이름·연락처 같은 개인정보는 적지 마세요.
            </span>
            <span className="shrink-0" aria-hidden="true">
              {form.extra.length}/{INPUT_LIMITS.extra.max}
            </span>
          </p>
          {fieldError("extra")}
        </div>

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
              <label className="flex min-h-11 cursor-pointer items-center gap-2 text-base">
                <input
                  type="checkbox"
                  checked={form.needRoom}
                  onChange={(e) => update("needRoom", e.target.checked)}
                  className="size-5 accent-zinc-900 dark:accent-zinc-100"
                />
                룸(단체석) 필요
              </label>
              <label className="flex min-h-11 cursor-pointer items-center gap-2 text-base">
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
          disabled={loading}
          aria-busy={loading}
          className="flex h-12 items-center justify-center gap-2 rounded-xl bg-zinc-900 text-base font-semibold text-white transition-colors hover:bg-zinc-700 disabled:cursor-wait disabled:bg-zinc-500 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300 dark:disabled:bg-zinc-400"
        >
          {loading && (
            <span
              aria-hidden="true"
              className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
            />
          )}
          {loading ? "추천 받는 중…" : "추천 받기"}
        </button>
      </form>

      {/* 안내·오류 띠 (Design §5.1 ⑤): 화면 읽기 프로그램이 결과·오류를 바로 읽도록 알림 영역에 둔다 */}
      <div aria-live="polite" className="flex flex-col gap-3">
        {requestError && (
          <NoticeBanner variant="error" title={requestError}>
            조건은 그대로 두었어요. 잠시 뒤 다시 “추천 받기”를 눌러 주세요.
          </NoticeBanner>
        )}
        {!loading && !requestError && response && response.recommendations.length === 0 && (
          <NoticeBanner variant="info" title={response.notice ?? "조건에 맞는 곳이 없어요."}>
            {response.suggestions?.length
              ? `${response.suggestions.join(", ")}.`
              : "인원·예산·도보 거리를 조금 넓히거나 룸·예약 조건을 빼 보세요."}
          </NoticeBanner>
        )}
        {!loading && !requestError && response && response.recommendations.length > 0 && (
          <>
            {response.notice && (
              <NoticeBanner variant="info" title={response.notice}>
                조건에 맞는 곳이 {response.recommendations.length}곳이라 그만큼만 보여 드려요.
                {response.suggestions?.length ? ` ${response.suggestions.join(", ")}.` : ""}
              </NoticeBanner>
            )}
            <p className="sr-only">추천 {response.recommendations.length}곳을 골랐어요</p>
          </>
        )}
      </div>

      {/* 결과 카드: 오류가 나면 이전 결과를 숨겨 지금 조건의 결과로 오해하지 않게 한다 */}
      {!requestError && response && response.recommendations.length > 0 && (
        <section
          aria-label="추천 결과"
          aria-busy={loading}
          className={`flex flex-col gap-3 transition-opacity ${loading ? "opacity-50" : ""}`}
        >
          {response.recommendations.map((r, index) => (
            <ResultCard
              key={r.id}
              rank={index + 1}
              restaurant={r}
              onMakeNotice={submitted?.purpose === "dinner" ? () => setNoticeFor(r.id) : undefined}
              extraWish={submitted?.extra}
            />
          ))}
        </section>
      )}

      {/* 회식 공지문 (nice): 팀 회식 결과에서 카드의 버튼을 눌렀을 때만 */}
      {!requestError && submitted && noticeFor && (
        (() => {
          const target = response?.recommendations.find((r) => r.id === noticeFor);
          return target ? (
            <AnnouncementPanel
              key={target.id}
              restaurant={target}
              people={submitted.people}
              onClose={() => setNoticeFor(null)}
            />
          ) : null;
        })()
      )}
    </section>
  );
}
