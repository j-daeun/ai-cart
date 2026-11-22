import type { Metadata } from "next";
import "./globals.css";
import SkipNav from "@/components/layout/SkipNav";
import Header from "@/components/layout/Header";

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
        <SkipNav />
        <div className="max-w-[480px] mx-auto">
          <Header />
          <main id="main-content">{children}</main>
        </div>
      </body>
    </html>
  );
}
