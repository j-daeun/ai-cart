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

// ---- S2: 상품 상세 타입 ----

/** 상품 상세 화면 전체 데이터 (서버에서 조회, 클라이언트에 props로 전달) */
export type ProductDetail = {
  id: string;
  name: string;
  price: number; // 원 단위 정수
  thumbnailUrl: string; // 대표 이미지 URL
  detailImageUrl: string | null; // 긴 상세 이미지 URL. 없으면 null (FR-002)
  optionGroups: OptionGroup[]; // 없으면 빈 배열 (FR-012)
  stocks: StockEntry[];
};

/** 옵션 그룹 한 개. 예: 색상, 사이즈 */
export type OptionGroup = {
  id: string;
  name: string; // 예: "색상", "사이즈"
  displayOrder: number; // 화면 표시 순서 (오름차순)
  options: OptionValue[];
};

/** 옵션 그룹 내 개별 값. 예: "빨간색", "M" */
export type OptionValue = {
  id: string;
  value: string; // 예: "빨간색", "M"
  displayOrder: number;
  isSoldOut: boolean; // 이 값이 포함된 모든 stocks 조합의 quantity 합계 = 0 (FR-009·FR-020)
};

/** 옵션 조합별 재고. 옵션 없는 상품은 optionValueIds = [] */
export type StockEntry = {
  optionValueIds: string[]; // 비어있으면 옵션 없는 상품
  quantity: number;
};
