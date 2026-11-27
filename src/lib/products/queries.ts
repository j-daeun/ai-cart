import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ProductListItem, ProductsPage } from "@/types/product";

/** Supabase에서 cursor 기반으로 상품 한 페이지를 조회합니다 (서버 전용) */
export async function fetchProductsPage(
  cursor: number | null,
  limit: number = 20
): Promise<ProductsPage> {
  const supabase = await createServerSupabaseClient();

  // products JOIN images, LEFT JOIN stocks — research.md §4 쿼리 패턴
  let query = supabase
    .from("products")
    .select(
      `id, name, price, sort_order,
       images!thumbnail_image_id(public_url),
       stocks(quantity)`
    )
    .order("sort_order", { ascending: true })
    .limit(limit);

  if (cursor !== null) {
    query = query.gt("sort_order", cursor);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error("Failed to fetch products");
  }

  const items: ProductListItem[] = (data ?? []).map((row) => {
    // Supabase JS SDK: 1:1 관계는 단일 객체, 1:N은 배열
    const imageRow = Array.isArray(row.images) ? row.images[0] : row.images;
    const stockRows = Array.isArray(row.stocks) ? row.stocks : [];

    const totalQty = stockRows.reduce(
      (sum: number, s: { quantity: number }) => sum + (s.quantity ?? 0),
      0
    );

    return {
      id: row.id as string,
      name: row.name as string,
      price: row.price as number,
      thumbnailUrl: (imageRow as { public_url: string } | null)?.public_url ?? "",
      isSoldOut: totalQty === 0,
      sortOrder: row.sort_order as number,
    };
  });

  const nextCursor =
    items.length === limit ? (items[items.length - 1]?.sortOrder ?? null) : null;

  return {
    items,
    nextCursor,
    hasMore: items.length === limit,
  };
}
