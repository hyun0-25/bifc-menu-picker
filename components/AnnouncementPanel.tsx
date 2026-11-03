"use client";

// PRD nice ① — 회식 공지문 패널: 날짜를 고르면 단체방에 붙여 넣을 공지문을 보여 주고 복사하게 한다.
// 입력한 날짜와 공지문은 어디에도 저장하지 않는다 (화면을 닫으면 사라짐).
import { useId, useState } from "react";
import { buildAnnouncement, MAX_NOTICE_LENGTH } from "@/lib/notice";
import type { Recommendation } from "@/lib/types";

type Props = {
  restaurant: Recommendation;
  /** 입력했던 인원(명) */
  people: number;
  onClose: () => void;
};

export default function AnnouncementPanel({ restaurant, people, onClose }: Props) {
  const [date, setDate] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const id = useId();
  const text = buildAnnouncement({ restaurant, people, date });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("복사했어요. 단체방에 붙여 넣으세요.");
    } catch {
      // 클립보드를 쓸 수 없는 환경: 글을 선택해 두고 직접 복사하게 안내한다
      document.getElementById(`${id}-text`)?.focus();
      (document.getElementById(`${id}-text`) as HTMLTextAreaElement | null)?.select();
      setStatus("자동 복사가 안 돼요. 선택된 글을 길게 눌러(또는 Ctrl+C) 복사해 주세요.");
    }
  };

  return (
    <section
      aria-label="회식 공지문"
      className="glass flex flex-col gap-3 p-5"
    >
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-base font-bold">회식 공지문 · {restaurant.name}</h3>
        <button
          type="button"
          onClick={onClose}
          className="h-11 shrink-0 rounded-lg px-3 text-sm text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          닫기
        </button>
      </header>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-date`} className="text-sm font-medium">
          회식 날짜 <span className="font-normal text-zinc-500">(안 정했으면 비워 두세요)</span>
        </label>
        <input
          id={`${id}-date`}
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            setStatus(null);
          }}
          className="h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-base text-zinc-900 focus:border-zinc-900 focus:outline-none sm:w-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:border-zinc-300"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-text`} className="text-sm font-medium">
          공지문{" "}
          <span className="font-normal text-zinc-500">
            ({text.length}/{MAX_NOTICE_LENGTH}자)
          </span>
        </label>
        <textarea
          id={`${id}-text`}
          readOnly
          rows={9}
          value={text}
          className="field-sizing-content w-full resize-none rounded-lg border border-zinc-300 bg-white p-3 text-base leading-relaxed break-keep text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
        />
      </div>

      <button
        type="button"
        onClick={copy}
        className="h-12 rounded-full bg-[#5b875c] text-base font-semibold text-white shadow-[0_6px_18px_rgba(60,100,62,.3)] transition-all hover:-translate-y-0.5 hover:bg-[#4d7550]"
      >
        공지문 복사
      </button>
      <p aria-live="polite" className="min-h-5 text-sm text-zinc-600 dark:text-zinc-400">
        {status}
      </p>
    </section>
  );
}
