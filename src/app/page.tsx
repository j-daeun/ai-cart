import {
  HydrationBoundary,
  QueryClient,
  dehydrate,
} from "@tanstack/react-query";
import { Suspense } from "react";
import { fetchProductsPage } from "@/lib/products/queries";
import ProductListContainer from "@/components/product-list/ProductListContainer";

export const dynamic = "force-dynamic"; // 항상 서버에서 최신 데이터 렌더링

export default async function HomePage() {
  // 매 요청마다 새 QueryClient — SSR 간 캐시 공유 방지
  const queryClient = new QueryClient();

  // 첫 페이지(20개) 미리 조회 → HydrationBoundary로 클라이언트에 전달 (FR-012, SC-003)
  // catch: DB 미연결 환경에서도 페이지가 렌더링되도록 graceful fallback
  try {
    await queryClient.prefetchInfiniteQuery({
      queryKey: ["products"],
      queryFn: ({ pageParam }) =>
        fetchProductsPage((pageParam as number | null) ?? null, 20),
      initialPageParam: null as number | null,
      getNextPageParam: (lastPage) =>
        (lastPage as Awaited<ReturnType<typeof fetchProductsPage>>).nextCursor,
      pages: 1,
    });
  } catch {
    // SSR 프리페치 실패 시 클라이언트가 직접 로딩 — SC-003(SSR HTML)은 DB가 연결된 환경에서 검증
  }

  return (
    <Suspense
      fallback={
        <div className="p-4 text-sm text-gray-500">목록 불러오는 중…</div>
      }
    >
      <HydrationBoundary state={dehydrate(queryClient)}>
        <ProductListContainer />
      </HydrationBoundary>
    </Suspense>
  );
}
