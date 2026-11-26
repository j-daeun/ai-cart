import { NextRequest, NextResponse } from "next/server";
import { fetchProductsPage } from "@/lib/products/queries";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;

  // cursor 파라미터 유효성 검사 — contracts/get-products.md
  const cursorParam = searchParams.get("cursor");
  let cursor: number | null = null;

  if (cursorParam !== null) {
    const parsed = Number(cursorParam);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return NextResponse.json(
        { error: "cursor must be a positive integer" },
        { status: 400 }
      );
    }
    cursor = parsed;
  }

  // limit 파라미터 유효성 검사
  const limitParam = searchParams.get("limit");
  let limit = DEFAULT_LIMIT;

  if (limitParam !== null) {
    const parsed = Number(limitParam);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
      return NextResponse.json(
        { error: `limit must be an integer between 1 and ${MAX_LIMIT}` },
        { status: 400 }
      );
    }
    limit = parsed;
  }

  try {
    const page = await fetchProductsPage(cursor, limit);
    return NextResponse.json(page);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch products" },
      { status: 500 }
    );
  }
}
