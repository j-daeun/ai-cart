import type { Metadata } from "next";
import "./globals.css";

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
      <body>{children}</body>
    </html>
  );
}
