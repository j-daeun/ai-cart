import { fetchProductDetail } from "@/lib/products/queries";
import ProductDetailInteractive from "@/components/product-detail/ProductDetailInteractive";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ProductDetailPage({ params }: Props) {
  const { id } = await params;
  const product = await fetchProductDetail(id);

  return (
    // position:absolute inset:0: <main position:relative> 높이를 채우고 body 오버플로 방지.
    // overflow-y-auto: 긴 상세 콘텐츠(이미지 등)는 이 래퍼 안에서 스크롤.
    <div className="absolute inset-0 overflow-x-hidden overflow-y-auto">
      {/* 대표 이미지 (FR-001·FR-019) */}
      {product.thumbnailUrl && (
        <img
          src={product.thumbnailUrl}
          alt={product.name}
          className="w-full h-auto"
        />
      )}

      <div className="p-4">
        {/* 상품명 (FR-001) */}
        <h1 className="text-lg font-bold mb-2">{product.name}</h1>

        {/* 가격 (FR-001) */}
        <p className="text-xl font-semibold mb-4">
          {product.price.toLocaleString("ko-KR")}원
        </p>

        {/* 목록으로 링크 (US5) */}
        <a href="/" className="text-blue-600 underline text-sm">
          목록으로
        </a>
      </div>

      {/* 옵션 선택 + 구매·장바구니 버튼 (US2·US4) — Client Component */}
      <ProductDetailInteractive
        optionGroups={product.optionGroups}
        stocks={product.stocks}
      />

      {/* 긴 상세 이미지 — detailImageUrl이 없으면 렌더링 안 함 (FR-002) */}
      {product.detailImageUrl && (
        <img
          src={product.detailImageUrl}
          alt={`${product.name} 상세 이미지`}
          className="w-full h-auto"
        />
      )}
    </div>
  );
}
