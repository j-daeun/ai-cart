interface Props {
  onRetry: () => void;
}

/** 다음 페이지 로딩 실패 시 인라인 오류 + 재시도 버튼 — FR-005 */
export default function ErrorRetry({ onRetry }: Props) {
  return (
    <div
      role="alert"
      data-testid="error-retry"
      className="py-4 px-3 flex flex-col items-center gap-2 text-sm"
    >
      <p className="text-red-600">상품을 불러오지 못했습니다.</p>
      {/* 포커스 강제 이동 없음 (FR-005 MUST NOT) — 버튼은 키보드로 접근 가능한 기본 요소 */}
      <button
        type="button"
        onClick={onRetry}
        className="px-4 py-1.5 rounded border border-gray-400 text-gray-700 hover:bg-gray-100 active:bg-gray-200"
      >
        다시 시도
      </button>
    </div>
  );
}
