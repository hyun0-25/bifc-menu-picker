// Design Ref: §5.1 — 화면 1개: 제목 + 추천 영역 (휴대폰 기준, PC에서는 가운데 정렬 폭 680px)
// 꾸밈: 맑은 오후 언덕 장면 위에 흰 제목과 반투명 패널을 올린다 (SceneBackdrop, globals.css)
import RecommendForm from "@/components/RecommendForm";
import SceneBackdrop from "@/components/SceneBackdrop";

/** 등장 애니메이션 지연(초)을 CSS 변수로 넘긴다 */
const delay = (seconds: number) => ({ "--d": `${seconds}s` }) as React.CSSProperties;

const SOFT_SHADOW = "[text-shadow:0_2px_12px_rgba(28,70,120,.6)]";

export default function Home() {
  return (
    <>
      <SceneBackdrop />
      {/* break-keep: 한글 문장을 글자 중간이 아니라 단어(띄어쓰기) 단위로 줄바꿈한다 */}
      <main className="relative z-10 mx-auto flex w-full max-w-[680px] flex-1 flex-col gap-6 px-4 pb-14 break-keep sm:pb-20">
        <header className="flex flex-col items-center gap-3 pt-10 text-center text-white sm:pt-14">
          <p
            className={`enter rounded-full bg-[rgba(173,196,174,.5)] px-4 py-1.5 text-sm font-medium backdrop-blur-md ${SOFT_SHADOW}`}
          >
            🌱 BIFC 직원을 위한 점심 · 회식 길잡이
          </p>
          <h1 className="font-display leading-[1.02] [text-shadow:0_4px_18px_rgba(28,70,120,.28)]">
            <span className="enter block text-[clamp(52px,13vw,104px)]" style={delay(0.15)}>
              오늘 뭐 먹지
            </span>
            <span className="enter block text-[clamp(52px,13vw,104px)]" style={delay(0.31)}>
              @BIFC
            </span>
          </h1>
          <p className={`enter text-base sm:text-lg ${SOFT_SHADOW}`} style={delay(0.5)}>
            조건만 넣으면 갈 만한 곳 3곳을 골라 드려요
          </p>
        </header>

        <div className="enter" style={delay(0.65)}>
          <RecommendForm />
        </div>

        <p className={`text-center text-xs text-white ${SOFT_SHADOW}`}>
          가게 정보는 카카오맵 공개 정보(2026-11-03 조사) 기준이에요. 가기 전에 영업 여부를 확인해 주세요.
        </p>
      </main>
    </>
  );
}
