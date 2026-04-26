"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

export default function SignOutButton() {
  const router = useRouter();
  const [pending, start] = useTransition();

  function handleSignOut() {
    start(async () => {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.replace("/login");
      router.refresh();
    });
  }

  return (
    <button
      onClick={handleSignOut}
      disabled={pending}
      className="w-full text-left text-xs text-slate-500 hover:text-slate-800 disabled:opacity-50"
    >
      {pending ? "Đang đăng xuất..." : "Đăng xuất"}
    </button>
  );
}
