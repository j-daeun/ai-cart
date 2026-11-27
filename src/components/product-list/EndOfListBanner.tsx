/** 모든 상품을 불러왔을 때 목록 하단에 표시 — FR-003 */
export default function EndOfListBanner() {
  return (
    <div
      role="status"
      data-testid="end-of-list"
      className="py-6 text-center text-sm text-gray-500"
    >
      상품을 모두 불러왔습니다
    </div>
  );
}
