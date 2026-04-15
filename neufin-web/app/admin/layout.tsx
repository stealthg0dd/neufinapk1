import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import AdminShell from "./AdminShell";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const cookieStore = await cookies();
  const token = cookieStore.get("neufin-auth")?.value;
  if (!token) {
    redirect("/login?next=/admin");
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    redirect("/dashboard");
  }

  const sb = createClient(url, serviceKey);
  const {
    data: { user },
    error: authErr,
  } = await sb.auth.getUser(token);
  if (authErr || !user) {
    redirect("/login?next=/admin");
  }

  const { data: profile, error: profErr } = await sb
    .from("user_profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (profErr || profile?.is_admin !== true) {
    redirect("/dashboard");
  }

  return <AdminShell>{children}</AdminShell>;
}
