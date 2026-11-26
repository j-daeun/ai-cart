import type { Metadata } from "next";
import "./globals.css";
import SkipNav from "@/components/layout/SkipNav";
import Header from "@/components/layout/Header";
import QueryProvider from "@/components/providers/QueryProvider";

export const metadata: Metadata = {
  title: "AI Cart",
  description: "AI에게 말하면 원하는 상품을 장바구니까지 담아주는 모바일 커머스",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      {/*
       * FR-023: 360px 기준 모바일 레이아웃.
       * min-w는 오히려 가로 스크롤을 유발하므로 제거.
       * 레이아웃이 뷰포트 폭에 맞게 자연스럽게 줄어듦.
       * max-w-[480px] mx-auto: 데스크톱에서 모바일 레이아웃 가운데 정렬
       */}
      <body>
        <QueryProvider>
          <SkipNav />
          <div className="max-w-[480px] mx-auto">
            <Header />
            {/*
             * tabIndex={-1}: skip nav의 Enter 후 focus() 타겟이 되기 위해 필요
             * outline-none: 프로그래매틱 포커스 시 시각적 테두리 억제 (스크린리더엔 무관)
             */}
            <main id="main-content" tabIndex={-1} className="outline-none">
              {children}
            </main>
          </div>
        </QueryProvider>
      </body>
    </html>
  );
}
