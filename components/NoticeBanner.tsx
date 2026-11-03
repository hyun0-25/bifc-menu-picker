// Design Ref: §5.1 ⑤·§5.3 — 안내·오류 띠: 결과 카드 위에 눈에 띄게 보여 준다
// info: 후보 부족 등 조건을 바꿔 보라는 안내 / error: 서버·AI 오류로 추천을 받지 못함

type Props = {
  variant: "info" | "error";
  /** 띠 제목 (굵게) */
  title: string;
  /** 덧붙이는 설명 (선택) */
  children?: React.ReactNode;
};

const STYLES = {
  info: {
    box: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-100",
    icon: "!",
    iconBox: "bg-amber-500 text-white dark:bg-amber-400 dark:text-amber-950",
  },
  error: {
    box: "border-red-300 bg-red-50 text-red-900 dark:border-red-700/60 dark:bg-red-950/40 dark:text-red-100",
    icon: "×",
    iconBox: "bg-red-600 text-white dark:bg-red-400 dark:text-red-950",
  },
} as const;

export default function NoticeBanner({ variant, title, children }: Props) {
  const style = STYLES[variant];
  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      className={`flex items-start gap-3 rounded-2xl border px-4 py-3 shadow-[0_8px_22px_rgba(20,50,90,.18)] backdrop-blur-md ${style.box}`}
    >
      <span
        aria-hidden="true"
        className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${style.iconBox}`}
      >
        {style.icon}
      </span>
      <div className="flex flex-col gap-0.5">
        <p className="font-semibold">{title}</p>
        {children && <p className="text-sm opacity-90">{children}</p>}
      </div>
    </div>
  );
}
