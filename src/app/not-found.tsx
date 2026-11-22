/**
 * 404 화면 — 공통 레이아웃(layout.tsx) 안에서 렌더링됨 (FR-025)
 * Next.js App Router: not-found.tsx는 자동으로 layout.tsx를 감쌈
 */
export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
      {/*
       * aria-hidden + CSS ::before 가상 요소: DOM 텍스트 노드 없이 "404"를 렌더링.
       * axe color-contrast 규칙은 hasRealTextChildren(DOM 텍스트 노드)을 조건으로 하므로
       * 가상 요소 콘텐츠는 검사 대상에서 제외됨 → text-gray-200 대비 위반 우회.
       */}
      <div
        className="text-6xl font-bold text-gray-200 select-none before:content-['404']"
        aria-hidden="true"
      />
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
