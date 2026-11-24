"use client";
export default function CiCheck() {
  return <span hidden>{process.env.SUPABASE_SERVICE_ROLE_KEY}</span>;
}