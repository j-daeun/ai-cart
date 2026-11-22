/**
 * Header — 공통 헤더
 * - 홈 링크 (FR-022, FR-024)
 * - 장바구니 버튼: S3 전까지 aria-disabled="true", 클릭 불가 (FR-022)
 */
export default function Header() {
  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white">
      {/* 홈 링크 — accessible name "AI Cart 홈" */}
      <a href="/" aria-label="AI Cart 홈" className="text-lg font-bold text-gray-900">
        AI Cart
      </a>

      {/* 장바구니 버튼 — S3에서 실제 동작 추가 예정 */}
      {/* aria-disabled="true": 스크린 리더에 비활성 상태 전달, 포커스는 유지 */}
      {/* onClick 없음: 클릭해도 아무 동작 없음 */}
      <button
        type="button"
        aria-label="장바구니"
        aria-disabled="true"
        className="p-2 opacity-50 cursor-default"
      >
        {/* 장바구니 아이콘 (SVG) */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="9" cy="21" r="1" />
          <circle cx="20" cy="21" r="1" />
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
        </svg>
      </button>
    </header>
  );
}
