"use client";

import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { LogOut, Code2, Shield } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { apiGet } from "@/lib/api-client";
import type { User } from "@supabase/supabase-js";
import { useUser } from "@/lib/store";
import {
  SIDEBAR_NAV,
  isNavActive,
  type ProductNavItem,
} from "@/lib/product-navigation";

function isActivePath(pathname: string, href: string): boolean {
  return isNavActive(pathname, href);
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

function NavLink({ item, pathname }: { item: ProductNavItem; pathname: string }) {
  const active = isActivePath(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={[
        "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-200 ease-out",
        active
          ? "bg-primary-light font-semibold text-primary"
          : "text-slate2 hover:bg-surface-2 hover:text-foreground active:scale-[0.99]",
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
  items: ProductNavItem[];
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
    : "flex h-full w-[220px] shrink-0 flex-col border-r border-border bg-white";

  return (
    <aside
      className={rootClass}
      aria-label={embedded ? undefined : "Main navigation"}
    >
      {!embedded && (
        <div className="flex h-[72px] shrink-0 items-center border-b border-border bg-gradient-to-r from-white to-surface-2 px-5">
          <BrandLogo variant="app-sidebar" href="/dashboard" />
        </div>
      )}

      {sidebarDnaScore != null && (
        <div className="mx-3 mb-2 mt-4 rounded-xl border border-primary/25 bg-gradient-to-br from-primary-light to-emerald-50/90 p-3">
          <p className="mb-1 text-xs font-bold uppercase tracking-widest text-primary">
            Portfolio Health
          </p>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[22px] font-bold tabular-nums tracking-tight text-foreground">
              {sidebarDnaScore}
            </span>
            <span className="badge badge-success shrink-0 text-xs">Active</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border">
            <div
              className="h-1.5 min-w-[4px] rounded-full bg-primary transition-all duration-500"
              style={{
                width: `${Math.min(100, Math.max(0, Number(sidebarDnaScore)))}%`,
              }}
            />
          </div>
        </div>
      )}

      <nav className="flex flex-1 flex-col overflow-y-auto pb-3 pt-1">
        <NavSection label="Overview" items={[...SIDEBAR_NAV.overview]} pathname={pathname} />
        <NavSection label="Insights" items={[...SIDEBAR_NAV.insights]} pathname={pathname} />
        <NavSection label="Account" items={[...SIDEBAR_NAV.account]} pathname={pathname} />

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
            <div className="mx-4 my-4 border-t border-border" />
            <div className="mt-0">
              <p className="text-label px-3 pb-1.5 pt-2">Developer</p>
              <div className="flex flex-col gap-0.5 px-2">
                <Link
                  href="/developer"
                  className={[
                    "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActivePath(pathname, "/developer")
                      ? "bg-primary-light font-semibold text-primary"
                      : "text-slate2 hover:bg-surface-2 hover:text-foreground",
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

      <div className="border-t border-border px-4 py-3">
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
            <p className="truncate text-sm leading-snug text-readable">
              {user?.email ?? "—"}
            </p>
          </div>
          <button
            type="button"
            onClick={onSignOut}
            className="shrink-0 rounded-md p-1.5 text-readable hover:bg-surface-2 hover:text-foreground"
            aria-label="Sign out"
          >
            <LogOut className="h-[14px] w-[14px]" strokeWidth={1.5} />
          </button>
        </div>
      </div>
    </aside>
  );
}
