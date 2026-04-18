"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import NeuFinLogo from "@/components/landing/NeuFinLogo";

const LINKS = [
  { href: "/features", label: "Features" },
  { href: "/about", label: "About" },
  { href: "/research", label: "Research" },
  { href: "/pricing", label: "Pricing" },
  { href: "/partners", label: "Partners" },
  { href: "#api", label: "API" },
] as const;

export default function LandingNav() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/40 bg-background/90 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="flex min-h-[4rem] items-center justify-between gap-3 py-1 md:min-h-[4.25rem]">
          <Link
            href="/"
            className="flex min-w-0 flex-none items-center py-1"
            onClick={() => setOpen(false)}
          >
            <NeuFinLogo variant="nav" priority />
          </Link>

          <div className="hidden flex-1 items-center justify-center gap-8 md:flex">
            {LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="text-sm font-medium text-foreground/80 transition-colors hover:text-primary"
              >
                {label}
              </Link>
            ))}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/login"
              className="hidden rounded-lg px-3 py-2 text-sm font-medium text-foreground/80 transition-colors hover:text-foreground sm:inline-flex"
            >
              Sign In
            </Link>
            <Link
              href="/upload"
              className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition-all hover:bg-primary/90 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 sm:px-5"
            >
              Start Free
            </Link>
            <button
              type="button"
              aria-expanded={open}
              aria-label={open ? "Close menu" : "Open menu"}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/60 text-foreground transition-colors hover:border-primary/40 hover:text-primary md:hidden"
              onClick={() => setOpen((o) => !o)}
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* sm–md: always-visible compact link row (no tap required) */}
        <div className="hidden flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-border/30 py-2.5 sm:flex md:hidden">
          {LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="text-xs font-medium text-foreground/75 transition-colors hover:text-primary"
            >
              {label}
            </Link>
          ))}
          <Link
            href="/login"
            className="text-xs font-medium text-foreground/75 transition-colors hover:text-foreground"
          >
            Sign In
          </Link>
        </div>

        {open ? (
          <div className="border-t border-border/40 py-4 md:hidden">
            <div className="flex flex-col items-stretch gap-1">
              {LINKS.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className="rounded-lg px-3 py-2.5 text-center text-sm text-foreground hover:bg-surface-2"
                  onClick={() => setOpen(false)}
                >
                  {label}
                </Link>
              ))}
              <Link
                href="/login"
                className="rounded-lg px-3 py-2.5 text-center text-sm text-muted-foreground hover:bg-surface-2"
                onClick={() => setOpen(false)}
              >
                Sign In
              </Link>
            </div>
          </div>
        ) : null}
      </div>
    </nav>
  );
}
