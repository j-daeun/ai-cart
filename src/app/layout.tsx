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
          {/*
           * height: 100dvh + flex-col: 헤더·콘텐츠를 뷰포트 안에 담아 body 스크롤 차단.
           * 헤더가 자연 높이를 차지하고 <main>이 나머지 공간을 채움.
           * 긴 콘텐츠의 스크롤은 개별 페이지의 position:absolute inset-0 래퍼가 담당.
           */}
          <div
            className="max-w-[480px] mx-auto flex flex-col"
            style={{ height: "100dvh" }}
          >
            <Header />
            {/*
             * tabIndex={-1}: skip nav의 Enter 후 focus() 타겟이 되기 위해 필요
             * outline-none: 프로그래매틱 포커스 시 시각적 테두리 억제 (스크린리더엔 무관)
             * flex-1 min-h-0: 헤더 아래 남은 공간을 채움 (min-h-0 필수 — flex 기본값 auto 방지)
             * relative: 자식 절대 위치 요소(ProductList, 상세 페이지)의 containing block
             * overflow-y-auto를 main에 두면 hash 링크 포커스 동작 불안정 →
             *   스크롤이 필요한 페이지는 개별적으로 position:absolute inset-0 래퍼를 사용
             */}
            <main
              id="main-content"
              tabIndex={-1}
              className="outline-none flex-1 min-h-0 relative"
            >
              {children}
            </main>
          </div>
        </QueryProvider>
      </body>
    </html>
  );
}
