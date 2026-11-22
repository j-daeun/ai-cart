/**
 * Playwright Global Setup — FR-009 2단계 초기화 (S3+ 활성화용)
 *
 * S0에서는 가변 테이블 없음 → 현재 아무것도 하지 않음.
 * S3+에서 cart 등 가변 테이블이 추가되면:
 *   1. 시드 데이터 존재 확인 (products 100k)
 *   2. 가변 테이블 비우기 (cart, cart_items 등 DELETE)
 * 활성화: playwright.config.ts의 globalSetup 주석 해제
 */
export default async function globalSetup(): Promise<void> {
  // placeholder — S3+에서 비우기 로직 추가
}
