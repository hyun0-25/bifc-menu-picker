import type { Metadata } from "next";
import { Grandstander, Inter, Jua } from "next/font/google";
import "./globals.css";

// 본문: Inter(영문·숫자). 한글은 각 기기의 기본 한글 글꼴
const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
// 제목: 둥글고 통통 튀는 글꼴. 영문은 Grandstander, 한글은 Jua (둘 다 빌드할 때 내려받아 같은 서버에서 제공)
const grandstander = Grandstander({ variable: "--font-grandstander", subsets: ["latin"], weight: "900" });
const jua = Jua({ variable: "--font-jua", subsets: ["latin"], weight: "400" });

export const metadata: Metadata = {
  title: "오늘 뭐 먹지 @BIFC",
  description: "조건만 넣으면 BIFC 주변에서 갈 만한 식당 3곳을 골라 드려요.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${inter.variable} ${grandstander.variable} ${jua.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
