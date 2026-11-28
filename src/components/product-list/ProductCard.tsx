import Image from "next/image";
import Link from "next/link";
import type { ProductListItem } from "@/types/product";

interface Props {
  item: ProductListItem;
  /** 가상화 인덱스 — 클릭 시 sessionStorage 저장에 사용 */
  index: number;
  onCardClick: (index: number) => void;
}

/** 상품 목록 카드 — S6 AI 쇼핑 어시스턴트 대화 화면에서도 재사용됨 */
export default function ProductCard({ item, index, onCardClick }: Props) {
  const { id, name, price, thumbnailUrl, isSoldOut } = item;

  const formattedPrice = price.toLocaleString("ko-KR");
  const ariaLabel = `${name} ${formattedPrice}원${isSoldOut ? " 품절" : ""}`;

  // <li> 래퍼는 ProductList.tsx의 가상화 wrapper(<li>)가 담당 — 이중 중첩 방지
  return (
    <Link
      href={`/products/${id}`}
      aria-label={ariaLabel}
      data-testid="product-card"
      data-index={index}
      onClick={() => onCardClick(index)}
      className="flex gap-3 p-3"
    >
      <div className="relative w-20 h-20 shrink-0 bg-gray-100 rounded overflow-hidden">
        {thumbnailUrl ? (
          <Image
            src={thumbnailUrl}
            alt={name}
            fill
            sizes="80px"
            className="object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gray-200" aria-hidden="true" />
        )}
        {isSoldOut && (
          <div
            // bg-black/50: opacity-60 전체적용 대신 이미지 오버레이만 어둡게 — WCAG AA 텍스트 대비 유지
            className="absolute inset-0 flex items-center justify-center bg-black/50"
            aria-hidden="true"
          >
            <span className="text-white text-xs font-semibold">품절</span>
          </div>
        )}
      </div>
      <div className="flex flex-col justify-center min-w-0">
        {/* text-gray-600(#4B5563): white 배경 대비 6.33:1 — WCAG AA 충족. opacity-60은 ~4.07:1로 미달 */}
        <p className={`text-sm font-medium truncate ${isSoldOut ? "text-gray-600" : ""}`}>{name}</p>
        <p className={`text-sm ${isSoldOut ? "text-gray-600" : "text-gray-800"}`}>{formattedPrice}원</p>
      </div>
    </Link>
  );
}
