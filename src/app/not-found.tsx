/**
 * 404 화면 — 공통 레이아웃(layout.tsx) 안에서 렌더링됨 (FR-025)
 * Next.js App Router: not-found.tsx는 자동으로 layout.tsx를 감쌈
 */
export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-6xl font-bold text-gray-200" aria-hidden="true">
        404
      </p>
      <h1 className="text-xl font-semibold text-gray-800">페이지를 찾을 수 없습니다</h1>
      <p className="text-gray-500">요청하신 주소가 존재하지 않습니다.</p>
      <a
        href="/"
        className="mt-2 px-4 py-2 rounded bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 transition-colors"
      >
        홈으로 돌아가기
      </a>
    </div>
  );
}
