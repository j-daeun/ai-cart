import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * 서버 전용 Supabase 클라이언트 — 클라이언트 코드에서 import 금지 (FR-021)
 * service role key를 사용하므로 RLS를 우회함.
 * Server Component, Server Action, API Route에서만 사용하세요.
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component에서 호출된 경우 쿠키 쓰기 무시
          }
        },
      },
    }
  );
}
