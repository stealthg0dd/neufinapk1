"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import type { MarketRegime, ResearchNote } from "@/lib/api";
import { GraphicPlaceholder } from "@/components/GraphicPlaceholder";
import NeuFinLogo from "@/components/landing/NeuFinLogo";
import { PopularPlanBadge } from "@/components/ui/PopularPlanBadge";
import { DemoEntryLinks } from "@/components/onboarding/DemoEntryLinks";
import { HeroTrustStrip } from "@/components/landing/HeroTrustStrip";
import { ConversionHierarchyBar } from "@/components/landing/ConversionHierarchyBar";
import { SampleOutputsGallery } from "@/components/landing/SampleOutputsGallery";
import { ObjectionsFAQ } from "@/components/landing/ObjectionsFAQ";

const SwarmHeroTerminal = dynamic(
  () => import("@/components/landing/SwarmHeroTerminal"),
  {
    loading: () => (
      <div
        className="h-[min(420px,52vh)] w-full max-w-lg animate-pulse rounded-2xl bg-slate-100"
        aria-hidden
      />
    ),
  },
);

const LandingSwarmChatDock = dynamic(
  () => import("@/components/landing/LandingSwarmChatDock"),
  { ssr: false, loading: () => null },
);

const SWARM_AGENTS = [
  {
    id: "MR",
    name: "Macro Intelligence",
    color: "#0EA5E9",
    desc: "Classifies market regime from FRED CPI, VIX, PMI, and yield curve — every decision is regime-aware.",
    status: "Risk-Off · 82% confidence",
  },
  {
    id: "PS",
    name: "Portfolio Strategist",
    color: "#8B5CF6",
    desc: "Converts macro signals into an actionable positioning thesis for your exact holdings.",
    status: "Defensive rotation recommended",
  },
  {
    id: "QA",
    name: "Quantitative Analysis",
    color: "#1EB8CC",
    desc: "Pearson correlation clusters, weighted beta, HHI concentration, Sharpe ratio — pure mathematics.",
    status: "Sharpe 1.24 · Beta 0.82",
  },
  {
    id: "TO",
    name: "Tax Optimisation",
    color: "#22C55E",
    desc: "Per-position CGT liability and tax-loss harvesting before year-end to protect after-tax alpha.",
    status: "CGT exposure: $4,200",
  },
  {
    id: "RR",
    name: "Risk Sentinel",
    color: "#EF4444",
    desc: "Independent second opinion on tail risk, concentration, and drawdown — not influenced by other agents.",
    status: "Risk: HIGH · Tech cluster 67%",
  },
  {
    id: "AD",
    name: "Alpha Discovery",
    color: "#F5A623",
    desc: "Live regime-aware scan for sector rotations and momentum signals missing from your portfolio.",
    status: "2 opportunities identified",
  },
  {
    id: "IC",
    name: "IC Synthesis",
    color: "#0F172A",
    desc: "Aggregates all agents into one audit-quality Investment Committee memo, white-labeled and PDF-ready.",
    status: "Briefing ready → PDF",
  },
] as const;

const FREE_FEATURES = [
  "3 DNA analyses",
  "Basic behavioral report",
  "CSV upload",
] as const;
const ADVISOR_FEATURES = [
  "Unlimited portfolio analyses",
  "White-label PDF briefs",
  "Multi-client workspace",
  "API access (3 endpoints)",
] as const;
const ENTERPRISE_FEATURES = [
  "Everything in Advisor",
  "Platform embed and SLA",
  "Dedicated integration support",
  "Revenue-share options",
] as const;

const JURISDICTIONS = [
  {
    name: "European Union",
    entity: "Neufin OÜ — Estonia",
    status: "active" as const,
    detail: "GDPR-compliant processing, EU data residency options.",
  },
  {
    name: "United States",
    entity: "Neufin Inc.",
    status: "active" as const,
    detail: "SOC 2 Type II in progress; state privacy frameworks supported.",
  },
  {
    name: "Singapore",
    entity: "MAS-aligned workflows",
    status: "launching" as const,
    detail: "IC memos and audit trails mapped to advisor conduct expectations.",
  },
  {
    name: "UAE · Malaysia",
    entity: "Regional expansion",
    status: "launching" as const,
    detail: "Jurisdiction-specific disclosures on roadmap.",
  },
] as const;

function CountUp({ end, suffix = "" }: { end: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const started = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || started.current) return;
        started.current = true;
        let start = 0;
        const steps = 40;
        const step = end / steps;
        timerRef.current = setInterval(() => {
          start += step;
          if (start >= end) {
            setCount(end);
            if (timerRef.current) clearInterval(timerRef.current);
            timerRef.current = null;
          } else {
            setCount(Math.floor(start));
          }
        }, 30);
      },
      { threshold: 0.15 },
    );
    obs.observe(el);
    return () => {
      obs.disconnect();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [end]);

  return (
    <span ref={ref} className="tabular-nums">
      {count}
      {suffix}
    </span>
  );
}

function formatRegimeName(regime: string) {
  const map: Record<string, string> = {
    risk_on: "Risk-on",
    risk_off: "Risk-off",
    stagflation: "Stagflation",
    recovery: "Recovery",
    recession_risk: "Recession risk",
  };
  return map[regime] ?? regime.replace(/_/g, " ");
}

function normalizeRegime(regime: MarketRegime | null) {
  const r = regime as
    | (MarketRegime & { current?: Partial<MarketRegime> })
    | null;
  const slug = (r?.current?.regime ?? r?.regime ?? "").toString().trim();
  const raw = r?.current?.confidence ?? r?.confidence;
  let confidence: number | null = null;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const x = raw > 1 ? raw / 100 : raw;
    confidence = Math.max(0, Math.min(1, x));
  }
  return { slug, confidence };
}

export default function HomeLandingPage({
  regime,
  researchTeaser,
}: {
  regime: MarketRegime | null;
  researchTeaser: ResearchNote[];
}) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 20);
    fn();
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  const { slug: regimeSlug, confidence: regimeConf } = normalizeRegime(regime);
  const confPct = regimeConf !== null ? Math.round(regimeConf * 100) : null;
  const regimeLabel = regimeSlug ? formatRegimeName(regimeSlug) : null;
  const teaser = researchTeaser
    .filter((n): n is ResearchNote => Boolean(n?.id))
    .slice(0, 2);

  const navLinks = [
    { label: "Features", href: "/features" },
    { label: "Research", href: "/research" },
    { label: "Pricing", href: "/pricing" },
    { label: "Partners", href: "/partners" },
    { label: "API", href: "/developer" },
  ] as const;

  return (
    <div className="flex min-h-screen flex-col bg-white text-slate2">
      <nav
        className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
          scrolled
            ? "border-b border-lp-border bg-white shadow-sm"
            : "border-b border-transparent bg-white/85 backdrop-blur-md"
        }`}
      >
        <div className="mx-auto flex min-h-[4rem] max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 md:min-h-[4.25rem]">
          <Link
            href="/"
            className="flex flex-shrink-0 flex-none items-center py-1"
          >
            <NeuFinLogo variant="header" priority />
          </Link>
          <div className="hidden items-center gap-8 md:flex">
            {navLinks.map(({ label, href }) => (
              <Link
                key={label}
                href={href}
                className="text-sm font-medium text-foreground/80 transition-colors hover:text-primary"
              >
                {label}
              </Link>
            ))}
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/login"
              className="hidden text-sm font-medium text-foreground/80 transition-colors hover:text-foreground md:block"
            >
              Sign In
            </Link>
            <Link href="/upload" className="lp-btn-nav-cta whitespace-nowrap">
              Start Free
            </Link>
          </div>
        </div>
      </nav>

      <main className="flex-1">
        {/* Hero */}
        <section className="relative flex min-h-screen items-center overflow-hidden bg-white pt-16">
          <div
            className="landing-animated-grid pointer-events-none absolute inset-0 z-0 opacity-[0.32]"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute right-1/4 top-1/4 z-0 h-[600px] w-[600px] rounded-full bg-[#1EB8CC]/5 blur-3xl"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute bottom-1/4 left-1/4 z-0 h-[400px] w-[400px] rounded-full bg-[#8B5CF6]/4 blur-3xl"
            aria-hidden
          />

          <div className="relative z-10 mx-auto max-w-7xl px-6 py-24">
            <div className="grid grid-cols-1 items-center gap-16 lg:grid-cols-2">
              <div className="min-w-0 max-w-3xl">
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                  className="mb-8 inline-flex items-center gap-2.5 rounded-full border border-primary/30 bg-lp-accent-soft px-4 py-2"
                >
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
                  </span>
                  <span className="text-xs font-bold uppercase tracking-widest text-primary">
                    Live · Portfolio Intelligence
                  </span>
                </motion.div>

                <motion.h1
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.1 }}
                  className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white leading-[1.1]"
                >
                  <span className="text-xs font-semibold tracking-widest text-teal-400 uppercase mb-3 block">
                    The Behavioral Finance Intelligence Layer for Serious Wealth Professionals
                  </span>
                  7 AI agents.
                  <br />
                  One portfolio.
                  <br />
                  <span className="text-primary">60 seconds.</span>
                </motion.h1>

                <motion.p
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.16 }}
                  className="mb-4 text-[clamp(16px,2vw,18px)] font-normal text-gray-400"
                >
                  IC-grade analysis. 47 behavioral biases. White-labeled output.
                  MAS · MiFID II · GDPR aligned.
                </motion.p>

                <motion.p
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.2 }}
                  className="text-base sm:text-lg text-gray-300 max-w-2xl leading-relaxed mt-4"
                >
                  Upload your portfolio. Our 7-agent AI swarm delivers a
                  complete Investment Committee briefing — behavioral biases,
                  regime analysis, tax recommendations, alpha signals, and a
                  white-labeled IC memo.
                </motion.p>

                <HeroTrustStrip />

                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.3 }}
                  className="mb-14 flex flex-wrap gap-4"
                >
                  <Link href="/upload" className="group lp-btn-primary shadow-[0_4px_24px_rgba(30,184,204,0.35)] hover:shadow-[0_6px_32px_rgba(30,184,204,0.45)]">
                    Analyze My Portfolio Free
                    <svg
                      className="h-4 w-4 transition-transform group-hover:translate-x-1"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                      aria-hidden
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M13 7l5 5m0 0l-5 5m5-5H6"
                      />
                    </svg>
                  </Link>
                  <Link href="#demo" className="lp-btn-secondary">
                    Watch 60-second demo
                  </Link>
                </motion.div>

                <ConversionHierarchyBar />

                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.5, delay: 0.45 }}
                  className="flex flex-wrap items-center gap-6 text-sm text-lp-muted"
                >
                  {[
                    "14-day free trial",
                    "No credit card required",
                    "MAS · GDPR · MiFID II aligned",
                    "SOC 2 in progress",
                  ].map((t, i) => (
                    <span key={i} className="flex items-center gap-2">
                      <svg
                        className="h-3.5 w-3.5 flex-shrink-0 text-[#22C55E]"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                        aria-hidden
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                      {t}
                    </span>
                  ))}
                </motion.div>
              </div>

              <div className="relative hidden min-w-0 flex-col gap-6 lg:flex">
                {/* Swarm terminal — original hero right column (dark live demo) */}
                <div className="relative w-full max-w-lg">
                  <div
                    className="pointer-events-none absolute -left-24 top-1/2 z-0 h-56 w-56 -translate-y-1/2 rounded-full bg-[#1EB8CC]/12 blur-3xl"
                    aria-hidden
                  />
                  <div
                    className="pointer-events-none absolute -inset-4 -z-10 scale-95 rounded-3xl bg-[#1EB8CC]/15 blur-3xl"
                    aria-hidden
                  />
                  <SwarmHeroTerminal />
                  <div className="hero-float-badge absolute -bottom-3 -left-3 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#DCFCE7]/90">
                        <svg
                          className="h-4 w-4 text-[#16A34A]"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                          aria-hidden
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-foreground">
                          IC Briefing Ready
                        </p>
                        <p className="text-xs text-slate2">
                          Generated in 58 seconds
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="hero-float-badge absolute -right-3 -top-3 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-[#F5A623]" />
                      <p className="text-xs font-semibold text-foreground">
                        Regime: Risk-Off
                      </p>
                      <span className="badge badge-warning text-xs">82%</span>
                    </div>
                  </div>
                </div>
                {/* Product still — dashboard mockup */}
                <div className="relative overflow-hidden rounded-2xl border border-[#1EB8CC]/20 shadow-xl shadow-[#1EB8CC]/10">
                  <GraphicPlaceholder
                    src="/graphics/hero-dashboard-mockup.png"
                    alt="NeuFin dashboard preview"
                    width={1200}
                    height={640}
                    className="h-auto w-full"
                    label="Dashboard preview — add hero-dashboard-mockup.png under public/graphics/"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Metrics */}
        <section className="relative overflow-hidden border-y border-lp-border bg-lp-elevated py-12 md:py-14">
          <div
            className="landing-animated-grid pointer-events-none absolute inset-0 opacity-[0.22]"
            aria-hidden
          />
          <div className="relative z-10 mx-auto max-w-7xl px-6">
            <div className="grid grid-cols-2 gap-8 lg:grid-cols-4">
              {(
                [
                  { value: 60, suffix: "s", label: "IC briefing delivered" },
                  { value: 7, suffix: "", label: "Specialized AI agents" },
                  { value: 47, suffix: "", label: "Behavioral biases tracked" },
                  { value: 100, suffix: "%", label: "White-labeled output" },
                ] as const
              ).map((s, i) => (
                <motion.div
                  key={s.label}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: i * 0.08 }}
                  className="text-center"
                >
                  <div className="mb-2 text-[44px] font-bold leading-none tracking-tight text-foreground">
                    <CountUp end={s.value} suffix={s.suffix} />
                  </div>
                  <div className="text-[14px] font-medium text-lp-muted">
                    {s.label}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <SampleOutputsGallery />

        {/* Seven agents */}
        <section className="relative bg-white py-24 md:py-28" id="demo">
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute inset-0 flex items-center justify-center px-4 py-8">
              <div className="relative h-[min(72vh,820px)] w-full max-w-6xl opacity-[0.15]">
                <GraphicPlaceholder
                  src="/graphics/ai-agents-visualization.png"
                  alt=""
                  fill
                  sizes="(max-width: 1024px) 100vw, 72rem"
                  objectFit="contain"
                  className="object-contain"
                  label="Agent visualization — Add ai-agents-visualization.png to public/graphics/"
                />
              </div>
            </div>
          </div>
          <div
            className="pointer-events-none absolute left-[6%] top-[28%] z-0 h-44 w-44 rounded-full bg-[#1EB8CC]/10 blur-3xl"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute bottom-[18%] right-[8%] z-0 h-40 w-40 rounded-full bg-[#1EB8CC]/8 blur-3xl"
            aria-hidden
          />
          <div className="relative z-10 mx-auto max-w-7xl px-6">
            <div className="mb-16 text-center">
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                className="mb-4 text-xs font-bold uppercase tracking-[0.15em] text-primary"
              >
                Agentic AI System
              </motion.p>
              <motion.h2
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.08 }}
                className="mb-4 font-bold leading-tight tracking-tight text-foreground"
                style={{ fontSize: "clamp(28px, 3.5vw, 44px)" }}
              >
                Seven specialists. One Investment Committee.
              </motion.h2>
              <motion.p
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.12 }}
                className="mx-auto max-w-2xl text-[17px] leading-relaxed text-slate2"
              >
                Most platforms give you data. NeuFin gives you a complete IC —
                seven agents running simultaneously the moment you upload your
                portfolio.
              </motion.p>
            </div>

            <DemoEntryLinks />

            <div className="mb-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {SWARM_AGENTS.slice(0, 4).map((a, i) => (
                <motion.div
                  key={a.id}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.45, delay: i * 0.07 }}
                  whileHover={{ y: -4, transition: { duration: 0.2 } }}
                  className="relative cursor-default overflow-hidden rounded-2xl border border-lp-border bg-lp-card p-6 shadow-sm transition-shadow duration-300 hover:shadow-[0_8px_32px_rgba(0,0,0,0.08)]"
                >
                  <div
                    className="pointer-events-none absolute -right-6 -top-8 h-28 w-28 rounded-full bg-primary/7 blur-2xl"
                    aria-hidden
                  />
                  <div
                    className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl text-sm font-black tracking-wide text-white"
                    style={{ background: a.color }}
                  >
                    {a.id}
                  </div>
                  <h3 className="mb-2 text-[15px] font-semibold leading-snug text-foreground">
                    {a.name}
                  </h3>
                  <p className="mb-5 text-sm leading-[1.65] text-lp-muted">
                    {a.desc}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#22C55E]" />
                    <span className="text-sm font-semibold text-[#16A34A]">
                      {a.status}
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>
            <div className="mx-auto grid max-w-3xl grid-cols-1 gap-5 sm:grid-cols-3">
              {SWARM_AGENTS.slice(4).map((a, i) => (
                <motion.div
                  key={a.id}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.45, delay: (i + 4) * 0.07 }}
                  whileHover={{ y: -4, transition: { duration: 0.2 } }}
                  className="relative cursor-default overflow-hidden rounded-2xl border border-lp-border bg-lp-card p-6 shadow-sm transition-shadow duration-300 hover:shadow-[0_8px_32px_rgba(0,0,0,0.08)]"
                >
                  <div
                    className="pointer-events-none absolute -right-6 -top-8 h-28 w-28 rounded-full bg-primary/7 blur-2xl"
                    aria-hidden
                  />
                  <div
                    className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl text-sm font-black text-white"
                    style={{ background: a.color }}
                  >
                    {a.id}
                  </div>
                  <h3 className="mb-2 text-[15px] font-semibold text-foreground">
                    {a.name}
                  </h3>
                  <p className="mb-5 text-sm leading-[1.65] text-lp-muted">
                    {a.desc}
                  </p>
                  <div className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#22C55E]" />
                    <span className="text-sm font-semibold text-[#16A34A]">
                      {a.status}
                    </span>
                  </div>
                </motion.div>
              ))}
            </div>

            <div className="mt-16 text-center">
              <Link href="/upload" className="lp-btn-dark-fill gap-3">
                Upload Portfolio — It&apos;s Free
                <span className="font-bold text-primary">→</span>
              </Link>
              <p className="mt-3 text-sm text-lp-muted">
                No account required · Results in 60 seconds
              </p>
            </div>
          </div>
        </section>

        {/* Value proposition */}
        <section className="relative overflow-hidden bg-lp-elevated py-24 md:py-28">
          <div
            className="pointer-events-none absolute -left-16 top-24 h-64 w-64 rounded-full bg-[#1EB8CC]/8 blur-3xl"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute bottom-16 right-0 h-52 w-52 rounded-full bg-[#1EB8CC]/6 blur-3xl"
            aria-hidden
          />
          <div className="relative z-10 mx-auto max-w-7xl px-6">
            <div className="grid grid-cols-1 items-center gap-16 lg:grid-cols-2 lg:gap-20">
              <motion.div
                initial={{ opacity: 0, x: -24 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.55 }}
                className="relative"
              >
                <div
                  className="pointer-events-none absolute -right-4 top-1/2 h-48 w-48 -translate-y-1/2 rounded-full bg-[#1EB8CC]/8 blur-3xl"
                  aria-hidden
                />
                <p className="mb-4 text-xs font-bold uppercase tracking-[0.15em] text-primary">
                  For Advisors
                </p>
                <h2
                  className="mb-6 font-bold leading-tight tracking-tight text-foreground"
                  style={{ fontSize: "clamp(24px, 2.8vw, 36px)" }}
                >
                  IC-grade client intelligence without the manual report grind.
                </h2>
                <div className="space-y-4">
                  {(
                    [
                      "IC-grade brief in 60 seconds, white-labeled with your branding",
                      "Behavioral bias detection with quantified dollar impact per position",
                      "Demonstrate IC-level analysis that justifies your advisory fee",
                    ] as const
                  ).map((line, i) => (
                    <div
                      key={i}
                      className="relative flex gap-4 overflow-hidden rounded-xl border border-lp-border bg-lp-card p-5 shadow-sm"
                    >
                      <div
                        className="pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full bg-primary/7 blur-2xl"
                        aria-hidden
                      />
                      <div className="relative mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[#22C55E]">
                        <svg
                          className="h-3.5 w-3.5 text-white"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                          aria-hidden
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </div>
                      <p className="relative text-[15px] font-medium leading-relaxed text-foreground">
                        {line}
                      </p>
                    </div>
                  ))}
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: 24 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.55, delay: 0.1 }}
                className="relative"
              >
                <div
                  className="pointer-events-none absolute -left-8 top-1/3 h-44 w-44 -translate-y-1/2 rounded-full bg-[#8B5CF6]/10 blur-3xl"
                  aria-hidden
                />
                <p className="mb-4 text-xs font-bold uppercase tracking-[0.15em] text-[#8B5CF6]">
                  For Platforms
                </p>
                <h2
                  className="mb-6 font-bold leading-tight tracking-tight text-foreground"
                  style={{ fontSize: "clamp(24px, 2.8vw, 36px)" }}
                >
                  Behavioral intelligence through your stack — without a
                  six-month build.
                </h2>
                <div className="space-y-4">
                  {(
                    [
                      "REST API integration in a single weekend — 3 endpoints",
                      "DNA score and 47 bias flags per portfolio, out of the box",
                      "Churn risk detected before clients panic-sell — automated",
                    ] as const
                  ).map((line, i) => (
                    <div
                      key={i}
                      className="relative flex gap-4 overflow-hidden rounded-xl border border-lp-border bg-lp-card p-5 shadow-sm"
                    >
                      <div
                        className="pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full bg-primary/7 blur-2xl"
                        aria-hidden
                      />
                      <div className="relative mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[#8B5CF6]">
                        <svg
                          className="h-3.5 w-3.5 text-white"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                          aria-hidden
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </div>
                      <p className="relative text-[15px] font-medium leading-relaxed text-foreground">
                        {line}
                      </p>
                    </div>
                  ))}
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        <ObjectionsFAQ />

        {/* Pricing — data and hrefs preserved */}
        <section className="bg-white py-24 md:py-28" id="pricing">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="mb-14 text-center md:mb-16">
              <h2
                className="mb-3 font-bold tracking-tight text-foreground md:mb-4"
                style={{ fontSize: "clamp(28px, 3vw, 42px)" }}
              >
                Simple, transparent pricing
              </h2>
              <p className="mx-auto max-w-2xl text-[17px] leading-relaxed text-slate2">
                Start free. Scale as your practice grows.
              </p>
            </div>

            <div className="mx-auto grid max-w-5xl grid-cols-1 items-stretch gap-6 md:grid-cols-3 md:gap-7">
              <div className="flex flex-col rounded-2xl border border-lp-border bg-lp-card p-7 shadow-sm sm:p-8">
                <div className="flex flex-1 flex-col">
                  <p className="mb-4 text-xs font-bold uppercase tracking-widest text-lp-muted">
                    Free
                  </p>
                  <div className="mb-2 flex flex-wrap items-baseline gap-x-1.5 gap-y-0">
                    <span className="text-[52px] font-bold leading-none tracking-tight text-foreground">
                      $0
                    </span>
                    <span className="text-base font-medium text-slate2">
                      /month
                    </span>
                  </div>
                  <p className="mb-8 text-sm font-medium text-lp-muted">
                    Start with the basics
                  </p>
                  <ul className="mb-6 flex-1 space-y-3">
                    {FREE_FEATURES.map((f) => (
                      <li
                        key={f}
                        className="flex gap-2 text-[14px] leading-snug text-slate2"
                      >
                        <Check
                          className="mt-0.5 h-[18px] w-[18px] shrink-0 text-positive"
                          strokeWidth={2.25}
                          aria-hidden
                        />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="mt-auto border-t border-lp-border/80 pt-6">
                  <Link href="/upload" className="lp-btn-pricing-outline">
                    Start Free
                  </Link>
                </div>
              </div>

              <div className="flex flex-col overflow-hidden rounded-2xl bg-shell shadow-[0_20px_60px_rgba(15,23,42,0.28)] ring-2 ring-primary/80">
                <PopularPlanBadge
                  variant="strip"
                  className="px-4 py-2.5 sm:py-3"
                />
                <div className="flex flex-1 flex-col px-7 pb-7 pt-6 sm:px-8 sm:pb-8 sm:pt-7">
                  <p className="mb-4 text-xs font-bold uppercase tracking-widest text-primary">
                    Advisor
                  </p>
                  <div className="mb-2 flex flex-wrap items-baseline gap-x-1.5 gap-y-0">
                    <span className="text-[52px] font-bold leading-none tracking-tight text-lp-on-dark">
                      $299
                    </span>
                    <span className="text-base font-medium text-lp-on-dark-muted">
                      /month
                    </span>
                  </div>
                  <p className="mb-8 text-sm font-medium leading-relaxed text-lp-on-dark-muted">
                    For professional advisors
                  </p>
                  <ul className="mb-6 flex-1 space-y-3">
                    {ADVISOR_FEATURES.map((f) => (
                      <li
                        key={f}
                        className="flex gap-2 text-[14px] leading-snug text-lp-on-dark-muted"
                      >
                        <Check
                          className="mt-0.5 h-[18px] w-[18px] shrink-0 text-primary"
                          strokeWidth={2.25}
                          aria-hidden
                        />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-auto border-t border-white/10 pt-6">
                    <Link href="/pricing" className="lp-btn-pricing-primary shadow-[0_4px_20px_rgba(30,184,204,0.35)] hover:shadow-[0_6px_28px_rgba(30,184,204,0.45)]">
                      Start 14-Day Free Trial
                    </Link>
                  </div>
                </div>
              </div>

              <div className="flex flex-col rounded-2xl border border-lp-border bg-lp-card p-7 shadow-sm sm:p-8">
                <div className="flex flex-1 flex-col">
                  <p className="mb-4 text-xs font-bold uppercase tracking-widest text-lp-muted">
                    Enterprise
                  </p>
                  <div className="mb-2 flex flex-wrap items-baseline gap-x-1.5 gap-y-0">
                    <span className="text-[52px] font-bold leading-none tracking-tight text-foreground">
                      $999
                    </span>
                    <span className="text-base font-medium text-slate2">
                      /month
                    </span>
                  </div>
                  <p className="mb-1 text-sm font-medium text-lp-muted">
                    For platforms and institutions
                  </p>
                  <p className="mb-8 text-sm font-semibold text-primary">
                    Custom pricing available
                  </p>
                  <ul className="mb-6 flex-1 space-y-3">
                    {ENTERPRISE_FEATURES.map((f) => (
                      <li
                        key={f}
                        className="flex gap-2 text-[14px] leading-snug text-slate2"
                      >
                        <Check
                          className="mt-0.5 h-[18px] w-[18px] shrink-0 text-positive"
                          strokeWidth={2.25}
                          aria-hidden
                        />
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="mt-auto border-t border-lp-border/80 pt-6">
                  <Link href="/contact-sales" className="lp-btn-pricing-dark">
                    Contact Sales
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Live market intelligence — regime + research teaser preserved */}
        <section className="bg-shell py-20 md:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="mb-12 text-center">
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.15em] text-primary">
                Live Market Intelligence
              </p>
              <h2 className="mb-2 text-[clamp(1.5rem,4vw,1.875rem)] font-bold text-lp-on-dark">
                Real-time regime monitoring
              </h2>
              <p className="text-[15px] text-lp-on-dark-muted">
                Our agents monitor 40+ macro signals continuously
              </p>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <div className="rounded-2xl border border-white/12 bg-white/[0.07] p-5 shadow-sm shadow-black/20 backdrop-blur-sm">
                <p className="text-sm font-semibold uppercase tracking-wide text-lp-on-dark-muted">
                  Current regime
                </p>
                {regimeLabel ? (
                  <>
                    <p className="mt-2 text-[20px] font-bold text-lp-on-dark">
                      {regimeLabel}
                    </p>
                    {confPct !== null ? (
                      <p className="mt-2 text-[14px] leading-relaxed text-lp-on-dark-muted">
                        Confidence · {confPct}%
                      </p>
                    ) : (
                      <p className="mt-2 text-[14px] leading-relaxed text-lp-on-dark-muted">
                        Confidence data loading from research desk.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="mt-2 text-[14px] leading-relaxed text-lp-on-dark-muted">
                    Regime feed connects when market data services are
                    available. Upload a portfolio for full swarm context.
                  </p>
                )}
              </div>

              <div className="rounded-2xl border border-white/12 bg-white/[0.07] p-5 shadow-sm shadow-black/20 backdrop-blur-sm">
                <p className="text-sm font-semibold uppercase tracking-wide text-lp-on-dark-muted">
                  Latest research
                </p>
                {teaser.length > 0 ? (
                  <ul className="mt-4 space-y-3">
                    {teaser.map((note) => (
                      <li key={note.id}>
                        <Link
                          href={`/research/${note.id}`}
                          className="text-[15px] font-medium text-lp-on-dark transition-colors hover:text-primary"
                        >
                          {note.title ?? "Research note"}
                          <span className="ml-2 text-lp-on-dark-muted">→</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-4 text-[14px] leading-relaxed text-lp-on-dark-muted">
                    <Link
                      href="/research"
                      className="font-semibold text-primary hover:underline"
                    >
                      Browse the research hub
                    </Link>{" "}
                    for regime and portfolio commentary.
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Regulatory */}
        <section className="bg-lp-elevated py-20 md:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6">
            <div className="mb-10 text-center md:mb-12">
              <h2 className="text-[clamp(22px,2.5vw,28px)] font-bold text-foreground">
                Regulatory footprint
              </h2>
              <p className="mt-2 max-w-2xl mx-auto text-[15px] leading-relaxed text-lp-muted">
                Entities and posture we disclose to partners and committees.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {JURISDICTIONS.map((j) => (
                <div
                  key={j.name}
                  className="rounded-xl border border-lp-border bg-lp-card p-5 shadow-sm"
                >
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <p className="text-[15px] font-semibold text-foreground">
                      {j.name}
                    </p>
                    <span
                      className={
                        j.status === "active"
                          ? "rounded-full bg-[#DCFCE7] px-2 py-0.5 text-xs font-semibold text-[#16A34A]"
                          : "rounded-full bg-[#FEF9C3] px-2 py-0.5 text-xs font-semibold text-[#854D0E]"
                      }
                    >
                      {j.status === "active" ? "Active" : "Launching"}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-slate2">
                    {j.entity}
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-lp-muted">
                    {j.detail}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-shell">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 md:py-16">
          <div className="mb-12 grid grid-cols-2 gap-10 sm:gap-12 lg:grid-cols-4">
            <div className="col-span-2 lg:col-span-1">
              <NeuFinLogo variant="footer-on-dark" className="mb-5" />
              <p className="mb-4 text-sm leading-[1.7] text-lp-on-dark-muted">
                Institutional-grade portfolio intelligence for advisors, IFAs,
                and wealth platforms. Built for the people who cannot afford to
                get it wrong.
              </p>
              <a
                href="mailto:info@neufin.ai"
                className="text-sm font-medium text-primary hover:underline"
              >
                info@neufin.ai
              </a>
            </div>

            {(
              [
                {
                  heading: "Product",
                  links: [
                    { l: "Features", href: "/features" },
                    { l: "Pricing", href: "/pricing" },
                    { l: "Partners", href: "/partners" },
                    { l: "Research", href: "/research" },
                    { l: "API Docs", href: "/developer" },
                    { l: "Samples", href: "/#samples" },
                    { l: "FAQ", href: "/#faq" },
                    { l: "Help & tutorials", href: "/help/tutorials" },
                  ],
                },
                {
                  heading: "Legal",
                  links: [
                    { l: "Privacy Policy", href: "/privacy" },
                    { l: "Terms of Service", href: "/terms-and-conditions" },
                    { l: "Contact Sales", href: "/contact-sales" },
                  ],
                },
                {
                  heading: "Entities",
                  links: [
                    { l: "Neufin OÜ — Estonia HQ", href: "#" },
                    { l: "Neufin Inc. — United States", href: "#" },
                    { l: "Singapore · UAE · Malaysia", href: "#" },
                  ],
                },
              ] as const
            ).map((col) => (
              <div key={col.heading}>
                <p className="mb-5 text-xs font-bold uppercase tracking-widest text-lp-on-dark-muted">
                  {col.heading}
                </p>
                <div className="space-y-3">
                  {col.links.map(({ l, href }) => (
                    <Link
                      key={l}
                      href={href}
                      className="block text-sm text-lp-on-dark-muted transition-colors hover:text-lp-on-dark"
                    >
                      {l}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col items-center justify-between gap-5 border-t border-white/10 pt-8 md:flex-row">
            <p className="text-xs text-lp-on-dark-muted">
              © 2026 Neufin OÜ. All rights reserved.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
              {[
                "MAS Aligned",
                "GDPR Compliant",
                "MiFID II Aware",
                "SOC 2 In Progress",
              ].map((b) => (
                <span
                  key={b}
                  className="rounded-full border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-lp-on-dark-muted"
                >
                  {b}
                </span>
              ))}
            </div>
          </div>
        </div>
      </footer>

      <LandingSwarmChatDock />
    </div>
  );
}
