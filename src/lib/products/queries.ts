import { notFound } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type {
  ProductListItem,
  ProductsPage,
  ProductDetail,
  OptionGroup,
  OptionValue,
  StockEntry,
} from "@/types/product";

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

/** Supabase에서 상품 단건 + 옵션·재고를 조회합니다 (서버 전용) */
export async function fetchProductDetail(productId: string): Promise<ProductDetail> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from("products")
    .select(
      `
      id,
      name,
      price,
      thumbnail:images!thumbnail_image_id(public_url),
      detail:images!detail_image_id(public_url),
      option_groups(
        id,
        name,
        display_order,
        option_values(
          id,
          value,
          display_order
        )
      ),
      stocks(
        option_value_ids,
        quantity
      )
    `
    )
    .eq("id", productId)
    .single();

  // PGRST116 = no row found with .single(). 그 외 error는 500으로 처리.
  if (error) {
    if ((error as { code?: string }).code === "PGRST116") {
      notFound();
    }
    throw new Error(error.message);
  }

  if (!data) {
    notFound();
  }

  // stocks: 타입 안전하게 추출
  const stockRows = (
    Array.isArray(data.stocks) ? data.stocks : []
  ) as { option_value_ids: string[]; quantity: number }[];

  const stocks: StockEntry[] = stockRows.map((s) => ({
    optionValueIds: s.option_value_ids ?? [],
    quantity: s.quantity,
  }));

  // OptionValue.isSoldOut: 해당 valueId가 포함된 모든 stocks 행의 quantity 합계 === 0
  function isOptionValueSoldOut(valueId: string): boolean {
    const related = stockRows.filter((s) =>
      (s.option_value_ids ?? []).includes(valueId)
    );
    if (related.length === 0) return false;
    return related.every((s) => s.quantity === 0);
  }

  // option_groups: display_order 오름차순, option_values: display_order 오름차순
  const rawGroups = (
    Array.isArray(data.option_groups) ? data.option_groups : []
  ) as {
    id: string;
    name: string;
    display_order: number;
    option_values: { id: string; value: string; display_order: number }[];
  }[];

  const optionGroups: OptionGroup[] = rawGroups
    .slice()
    .sort((a, b) => a.display_order - b.display_order)
    .map((group) => {
      const sortedValues: OptionValue[] = (group.option_values ?? [])
        .slice()
        .sort((a, b) => a.display_order - b.display_order)
        .map((v) => ({
          id: v.id,
          value: v.value,
          displayOrder: v.display_order,
          isSoldOut: isOptionValueSoldOut(v.id),
        }));

      return {
        id: group.id,
        name: group.name,
        displayOrder: group.display_order,
        options: sortedValues,
      };
    });

  // thumbnail: 1:1 관계 — Supabase SDK는 단일 객체 반환
  const thumbnailRow = Array.isArray(data.thumbnail)
    ? data.thumbnail[0]
    : data.thumbnail;
  const detailRow = Array.isArray(data.detail) ? data.detail[0] : data.detail;

  return {
    id: data.id as string,
    name: data.name as string,
    price: data.price as number,
    thumbnailUrl: (thumbnailRow as { public_url: string } | null)?.public_url ?? "",
    detailImageUrl:
      (detailRow as { public_url: string } | null)?.public_url ?? null,
    optionGroups,
    stocks,
  };
}
