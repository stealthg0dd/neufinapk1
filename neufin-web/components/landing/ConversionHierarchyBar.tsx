"use client";

import Link from "next/link";

const TIERS = [
  {
    role: "Primary",
    label: "Analyze free",
    href: "/upload",
    hint: "Upload CSV · DNA + Swarm",
    emphasis: true,
  },
  {
    role: "Secondary",
    label: "Watch demo",
    href: "#demo",
    hint: "60s product story",
    emphasis: false,
  },
  {
    role: "Advisor",
    label: "Advisor & IFA",
    href: "/partners#pricing",
    hint: "White-label · clients",
    emphasis: false,
  },
  {
    role: "Enterprise",
    label: "Enterprise",
    href: "/contact-sales",
    hint: "Platform · SLA",
    emphasis: false,
  },
  {
    role: "API",
    label: "API",
    href: "/developer",
    hint: "Integrate in days",
    emphasis: false,
  },
] as const;

export function ConversionHierarchyBar() {
  return (
    <div
      className="mb-10 rounded-2xl border border-lp-border/90 bg-lp-card/80 px-4 py-4 shadow-sm backdrop-blur-sm sm:px-5"
      aria-label="Ways to get started"
    >
      <p className="mb-3 text-center text-[11px] font-bold uppercase tracking-[0.12em] text-lp-muted sm:text-left">
        Conversion paths
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {TIERS.map((t) => (
          <Link
            key={t.role}
            href={t.href}
            className={`group flex flex-col rounded-xl border px-3 py-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
              t.emphasis
                ? "border-primary/40 bg-white shadow-[0_4px_20px_rgba(30,184,204,0.12)]"
                : "border-lp-border bg-white/90 hover:border-primary/25"
            }`}
          >
            <span className="text-[10px] font-bold uppercase tracking-wider text-lp-muted">
              {t.role}
            </span>
            <span
              className={`mt-1 text-sm font-semibold ${
                t.emphasis ? "text-primary" : "text-foreground group-hover:text-primary"
              }`}
            >
              {t.label}
            </span>
            <span className="mt-0.5 text-xs text-slate2">{t.hint}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
