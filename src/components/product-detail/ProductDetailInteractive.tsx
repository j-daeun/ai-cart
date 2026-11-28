"use client";

import { useState } from "react";
import type { OptionGroup, StockEntry } from "@/types/product";

interface ProductDetailInteractiveProps {
  optionGroups: OptionGroup[];
  stocks: StockEntry[];
}

export default function ProductDetailInteractive({
  optionGroups,
  stocks,
}: ProductDetailInteractiveProps) {
  // 선택된 옵션 상태 — groupId → 선택된 valueId (FR-022: useState만 사용)
  const [selectedOptions, setSelectedOptions] = useState<
    Record<string, string>
  >({});

  // 파생 상태 계산 (data-model.md §클라이언트 상태)
  const isAllSelected = optionGroups.every((g) => g.id in selectedOptions);
  const isAllSoldOut = stocks.length > 0 && stocks.every((s) => s.quantity === 0);
  const isButtonEnabled =
    !isAllSoldOut && (optionGroups.length === 0 || isAllSelected);

  return (
    // autoComplete="off" — 브라우저의 bfcache 폼 복원 방지 (FR-022, spec.md Q3)
    <form autoComplete="off" className="p-4">
      {/* 옵션 그룹 목록 (FR-008·FR-009·FR-018) */}
      {optionGroups.map((group) => (
        // role="radiogroup": <fieldset>의 암묵적 role은 "group" — Playwright getByRole("radiogroup")이 찾으려면 명시 필요
        <fieldset key={group.id} className="mb-4" role="radiogroup">
          <legend className="font-semibold mb-2">{group.name}</legend>
          <div className="flex flex-wrap gap-2">
            {group.options.map((option) => (
              // relative: 내부 absolute input의 기준점
              <span key={option.id} className="relative">
                <input
                  type="radio"
                  id={`opt-${option.id}`}
                  name={`group-${group.id}`}
                  value={option.id}
                  disabled={option.isSoldOut}
                  checked={selectedOptions[group.id] === option.id}
                  onChange={() =>
                    setSelectedOptions((prev) => ({
                      ...prev,
                      [group.id]: option.id,
                    }))
                  }
                  // appearance-none + absolute 1px: sr-only의 clip:rect(0,0,0,0)은
                  // Playwright checkVisibility()를 false로 만들어 check()가 타임아웃됨.
                  // clip 없는 1px 절대위치 요소는 checkVisibility()=true → 정상 조작 가능.
                  className="absolute appearance-none w-px h-px top-0 left-0"
                />
                <label
                  htmlFor={`opt-${option.id}`}
                  className={[
                    "inline-block px-3 py-1 border rounded cursor-pointer select-none",
                    option.isSoldOut
                      ? "opacity-40 cursor-not-allowed line-through"
                      : "cursor-pointer",
                    selectedOptions[group.id] === option.id && !option.isSoldOut
                      ? "border-blue-600 bg-blue-50 font-semibold"
                      : "border-gray-300",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {option.value}
                  {option.isSoldOut && " 품절"}
                </label>
              </span>
            ))}
          </div>
        </fieldset>
      ))}

      {/* 전체 품절 안내 (FR-021) */}
      {isAllSoldOut && (
        <p className="text-red-600 mb-3 font-semibold">현재 품절된 상품입니다</p>
      )}

      {/* 구매·장바구니 버튼 (FR-010·FR-011·FR-012·FR-013·FR-014) */}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={!isButtonEnabled}
          aria-disabled={!isButtonEnabled}
          className={[
            "flex-1 py-3 rounded font-semibold",
            isButtonEnabled
              ? "bg-blue-600 text-white"
              : "bg-gray-200 text-gray-400 cursor-not-allowed",
          ].join(" ")}
        >
          구매하기
        </button>
        <button
          type="button"
          disabled={!isButtonEnabled}
          aria-disabled={!isButtonEnabled}
          className={[
            "flex-1 py-3 rounded font-semibold border",
            isButtonEnabled
              ? "border-blue-600 text-blue-600"
              : "border-gray-300 text-gray-400 cursor-not-allowed",
          ].join(" ")}
        >
          장바구니에 담기
        </button>
      </div>
    </form>
  );
}
