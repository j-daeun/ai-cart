/** API 응답의 상품 한 개 단위 — 카드 렌더링 최소 타입. S6에서 재사용됨 */
export type ProductListItem = {
  id: string; // products.id (UUID)
  name: string; // products.name
  price: number; // products.price (원 단위 정수)
  thumbnailUrl: string; // images.public_url (thumbnail 타입)
  isSoldOut: boolean; // SUM(stocks.quantity) = 0
  sortOrder: number; // products.sort_order — 커서로 사용
};

/** GET /api/products 단일 페이지 응답 */
export type ProductsPage = {
  items: ProductListItem[];
  nextCursor: number | null; // 다음 요청 cursor. null이면 마지막 페이지
  hasMore: boolean; // items.length === limit 이면 true
};

/** sessionStorage 에 저장되는 스크롤 위치 상태 */
export type ProductListState = {
  savedAt: number; // Date.now() — 저장 시각 (ms)
  itemIndex: number; // 클릭된 카드의 가상화 인덱스 (0-based)
  scrollTop: number; // virtualizer.scrollOffset (px)
};
