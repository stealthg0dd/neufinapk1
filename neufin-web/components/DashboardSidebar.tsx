"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  PieChart,
  BookOpen,
  FileText,
  CreditCard,
  Bot,
  LogOut,
  Code2,
  Shield,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { apiGet } from "@/lib/api-client";
import type { User } from "@supabase/supabase-js";
import { useUser } from "@/lib/store";

type NavItem = { href: string; label: string; icon: LucideIcon };

const NAV_OVERVIEW: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/portfolio", label: "Portfolio", icon: PieChart },
  { href: "/dashboard/swarm", label: "Swarm IC", icon: Bot },
];

const NAV_INSIGHTS: NavItem[] = [
  { href: "/dashboard/research", label: "Research", icon: BookOpen },
  { href: "/dashboard/quant", label: "Quant", icon: Code2 },
  { href: "/dashboard/reports", label: "Reports", icon: FileText },
];

const NAV_ACCOUNT: NavItem[] = [
  { href: "/dashboard/billing", label: "Billing", icon: CreditCard },
];

function isActivePath(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  if (pathname === href) return true;
  return pathname.startsWith(`${href}/`);
}

type PortfolioListRow = { dna_score?: number | null };

type SubscriptionStatus = {
  plan?: string;
  subscription_tier?: string;
  status?: string;
  subscription_status?: string;
  trial_days_remaining?: number;
  days_remaining?: number;
  trial_ends_at?: string;
  is_admin?: boolean;
  role?: string;
};

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActivePath(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={[
        "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-200 ease-out",
        active
          ? "bg-[#E0F7FA] font-semibold text-primary"
          : "text-[#334155] hover:bg-[#F8FAFC] hover:text-[#0F172A] active:scale-[0.99]",
      ].join(" ")}
    >
      <Icon
        className="h-[15px] w-[15px] shrink-0 opacity-90"
        strokeWidth={1.5}
        aria-hidden
      />
      {item.label}
    </Link>
  );
}

function NavSection({
  label,
  items,
  pathname,
}: {
  label: string;
  items: NavItem[];
  pathname: string;
}) {
  return (
    <div className="mt-2">
      <p className="text-label px-3 pb-1.5 pt-4">{label}</p>
      <div className="flex flex-col gap-0.5 px-2">
        {items.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} />
        ))}
      </div>
    </div>
  );
}

export default function DashboardSidebar({
  user,
  embedded = false,
}: {
  user: User;
  embedded?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAdmin: isAdminFromHook } = useUser();
  const [subscription, setSubscription] = useState<SubscriptionStatus>({});
  const [sidebarDnaScore, setSidebarDnaScore] = useState<number | null>(null);

  const initials = useMemo(() => {
    const email = user?.email || "NF";
    return email.slice(0, 2).toUpperCase();
  }, [user?.email]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiGet<SubscriptionStatus>(
          "/api/subscription/status",
        );
        if (!cancelled) setSubscription(res ?? {});
      } catch {
        if (!cancelled) setSubscription({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const raw = await apiGet<
          PortfolioListRow[] | { portfolios?: PortfolioListRow[] }
        >("/api/portfolio/list");
        const ports = Array.isArray(raw) ? raw : (raw?.portfolios ?? []);
        const s = ports[0]?.dna_score;
        if (!cancelled) {
          setSidebarDnaScore(
            typeof s === "number" && !Number.isNaN(s) ? s : null,
          );
        }
      } catch {
        if (!cancelled) setSidebarDnaScore(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  const plan = (subscription.plan ?? subscription.subscription_tier ?? "free")
    .toString()
    .toLowerCase();
  const daysRemaining =
    subscription.trial_days_remaining ?? subscription.days_remaining ?? null;
  const trialEndsAt = subscription.trial_ends_at
    ? new Date(subscription.trial_ends_at)
    : null;
  const isActivePaid = plan === "advisor" || plan === "enterprise";
  const isExpired =
    !isActivePaid && daysRemaining !== null && daysRemaining <= 0;

  const isAdminNav =
    isAdminFromHook ||
    subscription.is_admin === true ||
    (subscription.role ?? "").toLowerCase() === "admin";

  const planBadgeText = (() => {
    const tierLabel = (
      subscription.plan ??
      subscription.subscription_tier ??
      "free"
    ).toString();
    const statusLabel = isAdminNav
      ? "Admin"
      : (
          subscription.status ??
          subscription.subscription_status ??
          "active"
        ).toString();
    if (isAdminNav) {
      return `${tierLabel} · ${statusLabel}`;
    }
    if (isActivePaid) {
      const dayText =
        daysRemaining !== null ? `${daysRemaining} days remaining` : "active";
      return `Advisor · ${dayText}`;
    }
    if (isExpired) return "Free · Trial expired";
    if (trialEndsAt && !Number.isNaN(trialEndsAt.getTime())) {
      const pretty = trialEndsAt.toLocaleDateString("en-SG", {
        month: "short",
        day: "numeric",
      });
      return `Free · Trial ends ${pretty}`;
    }
    if (daysRemaining !== null) return `Free · ${daysRemaining} days remaining`;
    return `${tierLabel} · ${statusLabel}`;
  })();

  const planBadgeClass = (() => {
    if (isExpired) return "border border-red-200 bg-red-50 text-red-800";
    if (isActivePaid)
      return "border border-emerald-200 bg-emerald-50 text-emerald-900";
    if (daysRemaining !== null && daysRemaining < 3)
      return "border border-amber-200 bg-amber-50 text-amber-900";
    return "border border-slate-200 bg-slate-50 text-slate-700";
  })();

  const rootClass = embedded
    ? "flex h-full min-h-0 w-full flex-col bg-white"
    : "flex h-full w-[220px] shrink-0 flex-col border-r border-[#E5E7EB] bg-white";

  return (
    <aside
      className={rootClass}
      aria-label={embedded ? undefined : "Main navigation"}
    >
      {!embedded && (
        <div className="flex h-[72px] shrink-0 items-center border-b border-[#F1F5F9] bg-gradient-to-r from-white to-[#F8FAFC] px-5">
          <Image
            src="/logo.png"
            alt="NeuFin"
            width={160}
            height={40}
            className="h-11 w-auto shrink-0 object-contain object-left"
            priority
          />
        </div>
      )}

      {sidebarDnaScore != null && (
        <div className="mx-3 mb-2 mt-4 rounded-xl border border-[#1EB8CC]/20 bg-gradient-to-br from-[#E0F7FA] to-[#F0FDF4] p-3">
          <p className="mb-1 text-xs font-bold uppercase tracking-widest text-[#1EB8CC]">
            Portfolio Health
          </p>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[22px] font-bold tabular-nums tracking-tight text-[#0F172A]">
              {sidebarDnaScore}
            </span>
            <span className="badge badge-success shrink-0 text-xs">Active</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#E2E8F0]">
            <div
              className="h-1.5 min-w-[4px] rounded-full bg-[#1EB8CC] transition-all duration-500"
              style={{
                width: `${Math.min(100, Math.max(0, Number(sidebarDnaScore)))}%`,
              }}
            />
          </div>
        </div>
      )}

      <nav className="flex flex-1 flex-col overflow-y-auto pb-3 pt-1">
        <NavSection label="Overview" items={NAV_OVERVIEW} pathname={pathname} />
        <NavSection label="Insights" items={NAV_INSIGHTS} pathname={pathname} />
        <NavSection label="Account" items={NAV_ACCOUNT} pathname={pathname} />

        {isAdminNav && (
          <div className="mt-2">
            <p className="text-label px-3 pb-1.5 pt-4">Admin</p>
            <div className="flex flex-col gap-0.5 px-2">
              <NavLink
                item={{
                  href: "/dashboard/admin",
                  label: "Admin Panel",
                  icon: Shield,
                }}
                pathname={pathname}
              />
            </div>
          </div>
        )}

        {isActivePaid && (
          <>
            <div className="mx-4 my-4 border-t border-[#F1F5F9]" />
            <div className="mt-0">
              <p className="text-label px-3 pb-1.5 pt-2">Developer</p>
              <div className="flex flex-col gap-0.5 px-2">
                <Link
                  href="/developer"
                  className={[
                    "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActivePath(pathname, "/developer")
                      ? "bg-[#E0F7FA] font-semibold text-primary"
                      : "text-[#334155] hover:bg-[#F8FAFC] hover:text-[#0F172A]",
                  ].join(" ")}
                >
                  <Code2
                    className="h-[15px] w-[15px] shrink-0"
                    strokeWidth={1.5}
                    aria-hidden
                  />
                  <span className="flex items-center gap-2">
                    Developer
                    <span className="rounded-full border border-primary/30 bg-primary-light px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-primary-dark">
                      beta
                    </span>
                  </span>
                </Link>
              </div>
            </div>
          </>
        )}
      </nav>

      <div className="border-t border-[#F1F5F9] px-4 py-3">
        <div
          className={`mb-3 rounded-md px-2.5 py-1.5 text-sm font-medium ${planBadgeClass}`}
        >
          {planBadgeText}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-100 font-mono text-xs font-semibold text-slate-700">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm leading-snug text-[#64748B]">
              {user?.email ?? "—"}
            </p>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            className="shrink-0 rounded-md p-1.5 text-[#6B7280] hover:bg-slate-100 hover:text-slate-900"
            aria-label="Sign out"
          >
            <LogOut className="h-[14px] w-[14px]" strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </aside>
  );
}
