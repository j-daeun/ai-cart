/**
 * SkipNav — "본문으로 건너뛰기" 접근성 링크
 * 평소에는 화면 밖(sr-only)에 위치하다가 포커스 시 화면에 표시됨 (FR-024)
 */
export default function SkipNav() {
  return (
    <a
      href="#main-content"
      className={[
        // 기본: 화면 밖으로 숨김
        "absolute -top-full left-0 z-50",
        "px-4 py-2 bg-white text-black font-medium underline",
        // 포커스 시: 화면 위에 표시
        "focus:top-0",
      ].join(" ")}
    >
      본문으로 건너뛰기
    </a>
  );
}
