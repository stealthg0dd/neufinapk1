"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { BrandLogo } from "@/components/BrandLogo";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { getSubscriptionStatus } from "@/lib/api";
import {
  APP_HEADER_PRIMARY_NAV,
  isNavActive,
} from "@/lib/product-navigation";

function TrialBadge({
  status,
  daysRemaining,
}: {
  status: "trial" | "active" | "expired";
  daysRemaining?: number;
}) {
  if (status === "active") return null;
  if (status === "expired") {
    return (
      <Link
        href="/upgrade"
        className="rounded border border-red-200 bg-red-50 px-2 py-0.5 text-sm font-semibold text-red-800 transition-colors hover:bg-red-100"
      >
        Expired
      </Link>
    );
  }
  if (daysRemaining !== undefined && daysRemaining <= 7) {
    return (
      <Link
        href="/upgrade"
        className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-sm font-semibold text-amber-900 transition-colors hover:bg-amber-100"
      >
        {daysRemaining}d trial
      </Link>
    );
  }
  return (
    <span className="rounded border border-border bg-surface-2 px-2 py-0.5 text-sm font-semibold text-slate2">
      Trial
    </span>
  );
}

export default function AppHeader() {
  const { user, token, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState<
    "trial" | "active" | "expired"
  >("trial");
  const [daysRemaining, setDaysRemaining] = useState<number | undefined>(
    undefined,
  );
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!token) return;
    getSubscriptionStatus(token)
      .then((data) => {
        setSubscriptionStatus(data.status);
        setDaysRemaining(data.days_remaining);
      })
      .catch(() => {
        /* non-critical */
      });
  }, [token]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [menuOpen]);

  const initials = user?.user_metadata?.full_name
    ? user.user_metadata.full_name
        .split(" ")
        .map((n: string) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : (user?.email?.[0]?.toUpperCase() ?? "?");

  const displayName = user?.user_metadata?.full_name || user?.email || "";

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex h-16 max-w-screen-xl items-center justify-between gap-4 px-4">
        <BrandLogo variant="app-header" href="/dashboard" />

        <nav
          className="hidden items-center gap-1 md:flex"
          aria-label="Product areas"
        >
          {APP_HEADER_PRIMARY_NAV.map(({ label, href }) => {
            const active = isNavActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-primary-light text-primary-dark"
                    : "text-slate2 hover:bg-surface-2 hover:text-navy"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-3">
          <TrialBadge
            status={subscriptionStatus}
            daysRemaining={daysRemaining}
          />

          {user ? (
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-2"
              >
                {user.user_metadata?.avatar_url ? (
                  <Image
                    src={user.user_metadata.avatar_url}
                    alt="avatar"
                    width={28}
                    height={28}
                    className="rounded-full border border-border"
                  />
                ) : (
                  <div className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-primary-light text-sm font-semibold text-primary-dark">
                    {initials}
                  </div>
                )}
                <span className="hidden max-w-[140px] truncate text-sm text-slate2 sm:block">
                  {displayName}
                </span>
                <svg
                  className={`h-3 w-3 text-muted2 transition-transform ${menuOpen ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-xl border border-border bg-white py-1 shadow-lg">
                  <div className="border-b border-border-light px-3 py-2">
                    <p className="truncate text-sm text-muted2">{user.email}</p>
                  </div>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm text-slate2 transition-colors hover:bg-surface-2 hover:text-navy"
                    onClick={() => {
                      setMenuOpen(false);
                      router.push("/dashboard/settings");
                    }}
                  >
                    Account Settings
                  </button>
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left text-sm text-slate2 transition-colors hover:bg-surface-2 hover:text-navy"
                    onClick={() => {
                      setMenuOpen(false);
                      router.push("/dashboard/billing");
                    }}
                  >
                    Subscription
                  </button>
                  <div className="mt-1 border-t border-border-light pt-1">
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm text-danger2 transition-colors hover:bg-red-50"
                      onClick={async () => {
                        setMenuOpen(false);
                        await signOut();
                        router.push("/");
                      }}
                    >
                      Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <Link
              href="/login"
              className="rounded-lg border border-border px-3 py-1.5 text-sm text-slate2 transition-colors hover:border-primary hover:text-primary-dark"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
