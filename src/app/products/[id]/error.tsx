"use client";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ProductError({ reset }: ErrorProps) {
  return (
    <div className="p-4">
      <p className="mb-4">상품 정보를 불러오지 못했습니다</p>
      <button
        onClick={reset}
        className="px-4 py-2 bg-blue-600 text-white rounded"
      >
        다시 시도
      </button>
    </div>
  );
}
