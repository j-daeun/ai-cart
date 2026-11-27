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
            staleTime: CACHE_EXPIRY_MS, // 5분 이내 background refetch 없음
            gcTime: CACHE_EXPIRY_MS, // 5분 뒤 inactive query 메모리 해제
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
