// 서버 키 노출 테스트 (test/key-leak)
// 기대 결과 : 보안 검사 단계 X
import CiCheck from "@/components/CiCheck";

// S1에서 상품 목록으로 교체 예정
export default function Home() {
  return (
    <>
      <p className="p-4 text-gray-500">상품 목록 준비 중 — S1에서 추가 예정</p>
      <CiCheck />
    </>
  );
}
