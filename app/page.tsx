// Design Ref: §5.1 — 화면 1개: 제목 + 추천 영역 (휴대폰 기준, PC에서는 가운데 정렬 폭 640px)
import RecommendForm from "@/components/RecommendForm";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-[640px] flex-1 flex-col gap-6 px-4 py-8 sm:py-12">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">오늘 뭐 먹지 @BIFC</h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          조건만 넣으면 갈 만한 곳 3곳을 골라 드려요
        </p>
      </header>
      <RecommendForm />
    </main>
  );
}
