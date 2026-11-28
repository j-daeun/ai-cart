"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

export const CACHE_EXPIRY_MS = 300_000; // 5분 — data-model.md ProductListState.savedAt 기준

export default function QueryProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // useState로 인스턴스 생성: 렌더마다 새로 만들지 않고, SSR 시 공유도 방지
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // staleTime: 0 — SSR hydration 직후 브라우저가 즉시 refetch.
            // E2E 목(page.route)은 브라우저 요청만 가로챔: staleTime>0이면 SSR 캐시를
            // 그대로 사용해 목이 발동하지 않고 테스트가 실패함.
            staleTime: 0,
            gcTime: CACHE_EXPIRY_MS, // 5분 뒤 inactive query 메모리 해제
            refetchOnWindowFocus: false, // 탭 전환 시 불필요한 refetch 방지
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
