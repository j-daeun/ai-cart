# Contract: GET /api/products

**작성**: 2026-11-27 | **Plan**: [plan.md](../plan.md)

---

## 엔드포인트

```
GET /api/products
```

## 요청 파라미터 (Query String)

| 파라미터 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | --- | --- | --- |
| cursor | number | 아니오 | 없음 (첫 페이지) | 마지막으로 받은 상품의 `sort_order`. 생략하면 첫 번째 페이지 |
| limit | number | 아니오 | 20 | 한 번에 받을 상품 수. 최대 100 |

## 응답

### 200 OK

```json
{
  "items": [
    {
      "id": "3f8e1c2a-...",
      "name": "라운드넥 티셔츠",
      "price": 15000,
      "thumbnailUrl": "https://...supabase.co/storage/v1/object/public/thumbnails/thumb-000.jpg",
      "isSoldOut": false,
      "sortOrder": 1
    }
  ],
  "nextCursor": 20,
  "hasMore": true
}
```

| 필드 | 타입 | 설명 |
| --- | --- | --- |
| items | ProductListItem[] | 이번 페이지 상품 목록 |
| nextCursor | number \| null | 다음 요청의 cursor 값. `null`이면 마지막 페이지 |
| hasMore | boolean | 다음 페이지 존재 여부 (`items.length === limit`) |

### 400 Bad Request

```json
{ "error": "cursor must be a positive integer" }
```

cursor 또는 limit 파라미터가 유효하지 않은 경우.

### 500 Internal Server Error

```json
{ "error": "Failed to fetch products" }
```

Supabase 조회 실패.

---

## 커서 사용 예

```
# 첫 페이지
GET /api/products

# 두 번째 페이지 (첫 페이지 마지막 아이템의 sortOrder = 20)
GET /api/products?cursor=20

# 세 번째 페이지
GET /api/products?cursor=40

# 마지막 페이지 도달 시 응답
{
  "items": [...],
  "nextCursor": null,
  "hasMore": false
}
```

## 클라이언트 사용 (TanStack Query)

```ts
useInfiniteQuery({
  queryKey: ['products'],
  queryFn: ({ pageParam }) =>
    fetch(`/api/products${pageParam ? `?cursor=${pageParam}` : ''}`).then(r => r.json()),
  initialPageParam: null,
  getNextPageParam: (lastPage) => lastPage.nextCursor,
})
```

## 중복 요청 방지

빠른 연속 스크롤 중 같은 cursor에 대한 중복 요청은 TanStack Query가 자동으로 중복 제거 (`useInfiniteQuery`의 `isFetchingNextPage` 플래그로 추가 호출 차단).
