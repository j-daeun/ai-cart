// S2 스텁 — 상품 상세 화면. 실제 구현은 S2(002-product-detail)에서 한다.
// SC-002 뒤로가기 E2E에 필요한 최소 페이지.
interface Props {
  params: Promise<{ id: string }>;
}

export default async function ProductDetailPage({ params }: Props) {
  const { id } = await params;
  return (
    <div className="p-4">
      <h1 className="text-lg font-bold mb-4">상품 {id}</h1>
      <a href="/" className="text-blue-600 underline">
        목록으로
      </a>
    </div>
  );
}
