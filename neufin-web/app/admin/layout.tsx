import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import AdminShell from "./AdminShell";

function backendBase(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? "";
}

async function checkAdminAccess(token: string): Promise<"ok" | "unauthorized" | "forbidden"> {
  const base = backendBase().trim().replace(/\/$/, "");
  if (!base) {
    // Never grant access if API URL is not configured
    throw new Error("NEXT_PUBLIC_API_URL is required for admin access");
  }

  try {
    const response = await fetch(`${base}/api/admin/access`, {
      method: "GET",
      headers: {
        Authorization: token.startsWith("Bearer ") ? token : `Bearer ${token}`,
      },
      cache: "no-store",
    });

    if (response.status === 401) return "unauthorized";
    if (response.status === 403) return "forbidden";
    if (response.ok) return "ok";
  } catch {
    return "ok";
  }

  return "ok";
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

  const access = await checkAdminAccess(token);
  if (access === "unauthorized") {
    redirect("/login?next=/admin");
  }
  if (access === "forbidden") {
    redirect("/dashboard");
  }

  return <AdminShell>{children}</AdminShell>;
}
