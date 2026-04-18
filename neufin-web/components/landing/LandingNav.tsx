"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { Menu, X } from "lucide-react";

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
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-border/40 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex h-16 items-center justify-between gap-3">
          <Link
            href="/"
            className="flex min-w-0 flex-none items-center gap-3"
            onClick={() => setOpen(false)}
          >
            <Image
              src="/logo.png"
              alt="NeuFin"
              width={160}
              height={40}
              className="h-12 w-auto"
              priority
            />
          </Link>

          <div className="hidden flex-1 items-center justify-center gap-8 md:flex">
            {LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {label}
              </Link>
            ))}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/login"
              className="hidden rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
            >
              Sign In
            </Link>
            <Link
              href="/upload"
              className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-all hover:bg-primary/90 sm:px-4"
            >
              Start Free
            </Link>
            <button
              type="button"
              aria-expanded={open}
              aria-label={open ? "Close menu" : "Open menu"}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/60 text-foreground md:hidden"
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
              className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {label}
            </Link>
          ))}
          <Link
            href="/login"
            className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
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
