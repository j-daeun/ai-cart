"use client";

import { useEffect, useRef, useCallback } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { ProductsPage, ProductListItem } from "@/types/product";
import ProductCard from "./ProductCard";
import EndOfListBanner from "./EndOfListBanner";
import ErrorRetry from "./ErrorRetry";

// 카드 높이 추정값 — research.md §2 "estimateSize: 240px". 실제 측정 후 조정 가능
const ESTIMATE_CARD_HEIGHT = 104; // 실제 카드: 80px 이미지 + 패딩 ≈ 104px

async function fetchPage(pageParam: number | null): Promise<ProductsPage> {
  const url = pageParam
    ? `/api/products?cursor=${pageParam}`
    : "/api/products";
  const res = await fetch(url);
  if (!res.ok) throw new Error("Failed to fetch products");
  return res.json() as Promise<ProductsPage>;
}

interface Props {
  /** 초기 스크롤 복원 오프셋 — ProductListContainer가 주입 */
  initialScrollTop?: number;
  /** 초기 스크롤 복원 아이템 인덱스 (포커스 대상) */
  initialFocusIndex?: number;
  /** 카드 클릭 시 sessionStorage 저장 콜백 */
  onCardClick?: (index: number, scrollTop: number) => void;
}

export default function ProductList({
  initialScrollTop,
  initialFocusIndex,
  onCardClick,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const restoredRef = useRef(false);
  // 중복 fetchNextPage 방지용 ref — 빠른 연속 스크롤 중 stale closure 문제 해결
  const isFetchingRef = useRef(false);

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isError,
    refetch,
  } = useInfiniteQuery<ProductsPage, Error>({
    queryKey: ["products"],
    queryFn: ({ pageParam }) => fetchPage((pageParam as number | null) ?? null),
    initialPageParam: null as number | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    // 오류 즉시 표시 — 재시도 없음 (사용자가 "다시 시도" 버튼으로 수동 재시도)
    retry: 0,
  });

  const allItems: ProductListItem[] = data?.pages.flatMap((p) => p.items) ?? [];

  const virtualizer = useVirtualizer({
    count: allItems.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => ESTIMATE_CARD_HEIGHT,
    overscan: 2, // 뷰포트 위아래 각 2개 추가 렌더링 — SC-001 여유분
  });

  const virtualItems = virtualizer.getVirtualItems();

  // isFetchingNextPage가 바뀔 때마다 ref 동기화
  useEffect(() => {
    isFetchingRef.current = isFetchingNextPage;
  }, [isFetchingNextPage]);

  // 초기 스크롤 복원 — initialScrollTop이 있으면 한 번만 실행
  useEffect(() => {
    if (
      initialScrollTop !== undefined &&
      !restoredRef.current &&
      allItems.length > 0
    ) {
      restoredRef.current = true;
      virtualizer.scrollToOffset(initialScrollTop, { align: "start" });
    }
  }, [initialScrollTop, allItems.length, virtualizer]);

  // 복원 후 포커스 이동 — FR-013, US2 Scenario 4
  useEffect(() => {
    if (initialFocusIndex !== undefined && restoredRef.current) {
      const selector = `[data-testid="product-card"][data-index="${initialFocusIndex}"]`;
      const el = document.querySelector<HTMLAnchorElement>(selector);
      if (el) {
        setTimeout(() => el.focus(), 50);
      }
    }
  }, [initialFocusIndex]);

  // IntersectionObserver — 목록 하단 접근 시 fetchNextPage()
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0]?.isIntersecting &&
          hasNextPage &&
          !isFetchingRef.current // ref 기반 — stale closure 방지
        ) {
          isFetchingRef.current = true; // 즉시 잠금 (React re-render 전에도 적용)
          void fetchNextPage();
        }
      },
      { root: containerRef.current, rootMargin: "200px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, fetchNextPage]);

  const handleCardClick = useCallback(
    (index: number) => {
      const scrollTop = containerRef.current?.scrollTop ?? 0;
      onCardClick?.(index, scrollTop);
    },
    [onCardClick]
  );

  const totalHeight = virtualizer.getTotalSize();

  return (
    <div
      ref={containerRef}
      style={{ height: "100%", overflowY: "auto" }}
      aria-label="상품 목록"
    >
      {/* 접근성: 로딩 상태 — FR-015 */}
      {isFetchingNextPage && (
        <div
          aria-live="polite"
          aria-label="상품 불러오는 중"
          className="sr-only"
        >
          상품 불러오는 중
        </div>
      )}

      {/* role="list"인 <ul> 아래 <li>를 직접 두어 접근성 listitem 규칙 충족 */}
      <ul style={{ height: totalHeight, position: "relative", listStyle: "none", margin: 0, padding: 0 }}>
        {virtualItems.map((virtualItem) => {
          const item = allItems[virtualItem.index];
          if (!item) return null;

          return (
            // <li>를 절대 위치 wrapper로 사용 — measureElement ref로 실제 높이 측정
            <li
              key={virtualItem.key}
              style={{
                position: "absolute",
                top: virtualItem.start,
                width: "100%",
              }}
              ref={virtualizer.measureElement}
              data-index={virtualItem.index}
            >
              <ProductCard
                item={item}
                index={virtualItem.index}
                onCardClick={handleCardClick}
              />
            </li>
          );
        })}
      </ul>

      {/* 로딩 중 — FR-004 */}
      {isFetchingNextPage && (
        <div className="py-4 flex justify-center" aria-hidden="true">
          <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
        </div>
      )}

      {/* 오류 — FR-005 */}
      {isError && !isFetchingNextPage && (
        <ErrorRetry onRetry={() => void refetch()} />
      )}

      {/* 목록 끝 — FR-003 */}
      {!hasNextPage && !isFetchingNextPage && !isError && allItems.length > 0 && (
        <EndOfListBanner />
      )}

      {/* sentinel: IntersectionObserver 타겟 */}
      <div ref={sentinelRef} style={{ height: 1 }} aria-hidden="true" />
    </div>
  );
}
