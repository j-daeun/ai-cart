"use client";

import { useEffect, useState, useCallback } from "react";
import type { ProductListState } from "@/types/product";
import ProductList from "./ProductList";
import ExpiryBanner from "./ExpiryBanner";

const SESSION_KEY = "productListState";
const CACHE_EXPIRY_MS = 300_000; // 5분 — data-model.md, plan.md 확정값

/**
 * sessionStorage에서 스크롤 위치를 읽고 ProductList에 주입합니다.
 * US2 스크롤 복원 · 만료 배너 로직 담당. (Server Component인 page.tsx와 분리)
 */
export default function ProductListContainer() {
  const [initialScrollTop, setInitialScrollTop] = useState<number | undefined>(
    undefined
  );
  const [initialFocusIndex, setInitialFocusIndex] = useState<
    number | undefined
  >(undefined);
  const [showExpiryBanner, setShowExpiryBanner] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return; // 새 탐색 → 처음부터

    let state: ProductListState;
    try {
      state = JSON.parse(raw) as ProductListState;
    } catch {
      sessionStorage.removeItem(SESSION_KEY);
      return;
    }

    // 한 번만 사용 — 복원 직후 제거
    sessionStorage.removeItem(SESSION_KEY);

    if (Date.now() - state.savedAt > CACHE_EXPIRY_MS) {
      // 만료: 배너 표시 + 처음부터 (FR-010)
      setShowExpiryBanner(true);
      return;
    }

    // 유효: 위치 복원 (FR-009, FR-010)
    setInitialScrollTop(state.scrollTop);
    setInitialFocusIndex(state.itemIndex);
  }, []);

  const handleCardClick = useCallback((index: number, scrollTop: number) => {
    const state: ProductListState = {
      savedAt: Date.now(),
      itemIndex: index,
      scrollTop,
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(state));
  }, []);

  if (!mounted) {
    // SSR: Hydration 불일치 방지 — sessionStorage는 클라이언트 전용
    return null;
  }

  return (
    <>
      {showExpiryBanner && (
        <ExpiryBanner onDismiss={() => setShowExpiryBanner(false)} />
      )}
      <ProductList
        initialScrollTop={initialScrollTop}
        initialFocusIndex={initialFocusIndex}
        onCardClick={handleCardClick}
      />
    </>
  );
}
