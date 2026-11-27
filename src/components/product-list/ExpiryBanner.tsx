interface Props {
  onDismiss: () => void;
}

/**
 * 캐시 만료로 위치 복원이 불가능할 때 목록 상단에 표시하는 안내 배너 — FR-010, US2 Scenario 5
 * role="status": 급하지 않은 상태 안내 (role="alert" 아님)
 */
export default function ExpiryBanner({ onDismiss }: Props) {
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="expiry-banner"
      className="flex items-center justify-between gap-2 px-4 py-2 bg-amber-50 border-b border-amber-200 text-sm"
    >
      <p className="text-amber-800">시간이 지나 목록을 새로 불러왔어요</p>
      <button
        type="button"
        aria-label="안내 닫기"
        onClick={onDismiss}
        className="shrink-0 px-2 py-1 rounded text-amber-700 hover:bg-amber-100 active:bg-amber-200"
      >
        닫기
      </button>
    </div>
  );
}
