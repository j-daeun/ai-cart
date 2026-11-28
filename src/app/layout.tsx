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
           * 상품 상세 등 긴 콘텐츠는 <main>의 overflow-y-auto 로 스크롤.
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
             * overflow-y-auto: 상세 등 긴 페이지는 이 안에서 스크롤
             */}
            <main
              id="main-content"
              tabIndex={-1}
              className="outline-none flex-1 min-h-0 overflow-y-auto"
            >
              {children}
            </main>
          </div>
        </QueryProvider>
      </body>
    </html>
  );
}
