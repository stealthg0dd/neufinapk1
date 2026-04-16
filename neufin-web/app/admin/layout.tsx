import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import AdminShell from "./AdminShell";

function isTruthyAdmin(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    return ["true", "1", "yes", "t"].includes(value.trim().toLowerCase());
  }
  return false;
}

function adminEmailSet(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

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
    .select("is_admin, role")
    .eq("id", user.id)
    .single();

  const role = String(profile?.role ?? "").toLowerCase();
  const emailAllowed = adminEmailSet().has(String(user.email ?? "").toLowerCase());

  if (
    profErr ||
    (!isTruthyAdmin(profile?.is_admin) && role !== "admin" && !emailAllowed)
  ) {
    redirect("/dashboard");
  }

  return <AdminShell>{children}</AdminShell>;
}
