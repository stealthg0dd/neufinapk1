import { redirect } from "next/navigation";

/** Legacy /auth URLs redirect to /login (same query string). OAuth callback stays at /auth/callback. */
export default async function LegacyAuthRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") qs.set(k, v);
    else if (Array.isArray(v) && v[0]) qs.set(k, v[0]);
  }
  const s = qs.toString();
  redirect(s ? `/login?${s}` : "/login");
}
