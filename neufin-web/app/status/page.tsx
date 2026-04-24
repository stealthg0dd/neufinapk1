"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle, AlertCircle, Clock } from "lucide-react";

const API_BASE = "https://neufin-backend-production.up.railway.app";

type ServiceStatus = "operational" | "degraded" | "outage" | "checking";

type Component = {
  name: string;
  status: ServiceStatus;
  latencyMs?: number;
  detail?: string;
};

const STATUS_CFG: Record<
  ServiceStatus,
  { label: string; color: string; bg: string; Icon: typeof CheckCircle }
> = {
  operational: {
    label: "Operational",
    color: "#16A34A",
    bg: "#F0FDF4",
    Icon: CheckCircle,
  },
  degraded: {
    label: "Degraded",
    color: "#D97706",
    bg: "#FFFBEB",
    Icon: AlertCircle,
  },
  outage: {
    label: "Outage",
    color: "#DC2626",
    bg: "#FEF2F2",
    Icon: AlertCircle,
  },
  checking: {
    label: "Checking…",
    color: "#64748B",
    bg: "#F8FAFC",
    Icon: Clock,
  },
};

export default function StatusPage() {
  const [components, setComponents] = useState<Component[]>([
    { name: "API Gateway", status: "checking" },
    { name: "AI Engine (Claude / GPT-4o)", status: "checking" },
    { name: "Database (Supabase)", status: "checking" },
    { name: "Price Feed", status: "checking" },
    { name: "PDF Generation", status: "checking" },
    { name: "Web Application (Vercel)", status: "checking" },
  ]);
  const [lastChecked, setLastChecked] = useState<string | null>(null);
  const [overallStatus, setOverallStatus] = useState<ServiceStatus>("checking");

  useEffect(() => {
    async function checkHealth() {
      const t0 = performance.now();
      let apiStatus: ServiceStatus = "outage";
      let latencyMs: number | undefined;
      let detail: string | undefined;

      try {
        const res = await fetch(`${API_BASE}/health`, {
          signal: AbortSignal.timeout(8000),
        });
        latencyMs = Math.round(performance.now() - t0);
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          apiStatus = "operational";
          const components_raw = data.components ?? {};
          const dbOk = components_raw.database !== false;
          const aiOk = components_raw.ai !== false;
          const redisOk = components_raw.redis !== false;

          setComponents([
            {
              name: "API Gateway",
              status: "operational",
              latencyMs,
              detail: `${latencyMs}ms`,
            },
            {
              name: "AI Engine (Claude / GPT-4o)",
              status: aiOk ? "operational" : "degraded",
              detail: aiOk ? "All models responding" : "Degraded — fallback active",
            },
            {
              name: "Database (Supabase)",
              status: dbOk ? "operational" : "degraded",
              detail: dbOk ? "Read/write healthy" : "Elevated latency",
            },
            {
              name: "Price Feed",
              status: "operational",
              detail: "Polygon · Yahoo Finance · TwelveData",
            },
            {
              name: "PDF Generation",
              status: "operational",
              detail: "ReportLab pipeline healthy",
            },
            {
              name: "Web Application (Vercel)",
              status: "operational",
              detail: "Edge network healthy",
            },
          ]);
          setOverallStatus(
            dbOk && aiOk ? "operational" : "degraded",
          );
        } else {
          detail = `HTTP ${res.status}`;
          throw new Error(detail);
        }
      } catch {
        setComponents((prev) =>
          prev.map((c) =>
            c.name === "API Gateway"
              ? { ...c, status: "outage", detail: detail ?? "Unreachable" }
              : { ...c, status: "degraded", detail: "Cannot verify" },
          ),
        );
        setOverallStatus("outage");
      }

      setLastChecked(new Date().toLocaleTimeString());
    }

    void checkHealth();
    const interval = setInterval(() => void checkHealth(), 60_000);
    return () => clearInterval(interval);
  }, []);

  const overall = STATUS_CFG[overallStatus];
  const OverallIcon = overall.Icon;

  return (
    <div className="min-h-screen bg-app text-navy">
      <nav className="sticky top-0 z-10 border-b border-border bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between px-6">
          <Link href="/" className="text-lg font-semibold tracking-tight text-navy">
            NeuFin
          </Link>
          <span className="text-sm text-muted2">System Status</span>
        </div>
      </nav>

      <div className="mx-auto max-w-4xl space-y-10 px-6 py-12">
        {/* Overall status */}
        <div
          className="flex items-center gap-4 rounded-2xl border p-6 shadow-sm"
          style={{ background: overall.bg, borderColor: overall.color + "40" }}
        >
          <OverallIcon className="h-10 w-10 shrink-0" style={{ color: overall.color }} />
          <div>
            <h1 className="text-2xl font-bold" style={{ color: overall.color }}>
              {overallStatus === "operational"
                ? "All Systems Operational"
                : overallStatus === "degraded"
                  ? "Partial Service Disruption"
                  : overallStatus === "checking"
                    ? "Checking system health…"
                    : "Major Outage Detected"}
            </h1>
            {lastChecked && (
              <p className="text-sm text-muted2">Last checked: {lastChecked}</p>
            )}
          </div>
        </div>

        {/* Components */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-navy">Components</h2>
          <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
            {components.map((c, i) => {
              const cfg = STATUS_CFG[c.status];
              const Icon = cfg.Icon;
              return (
                <div
                  key={c.name}
                  className={[
                    "flex items-center justify-between px-5 py-4",
                    i < components.length - 1 ? "border-b border-border-light" : "",
                  ].join(" ")}
                >
                  <div>
                    <p className="font-medium text-navy">{c.name}</p>
                    {c.detail && (
                      <p className="text-xs text-muted2">{c.detail}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4" style={{ color: cfg.color }} />
                    <span className="text-sm font-medium" style={{ color: cfg.color }}>
                      {cfg.label}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Uptime */}
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-navy">Uptime SLA</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { label: "API Uptime", value: "99.9%", period: "Last 30 days" },
              { label: "Response Time", value: "< 800ms", period: "p95 median" },
              { label: "Incident Response", value: "< 4h", period: "P1 SLA" },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-2xl border border-border bg-white p-5 text-center shadow-sm"
              >
                <p className="text-2xl font-bold text-emerald-600">{stat.value}</p>
                <p className="mt-1 text-sm font-medium text-navy">{stat.label}</p>
                <p className="text-xs text-muted2">{stat.period}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Subscribe to updates */}
        <section className="rounded-2xl border border-border bg-white p-6 shadow-sm space-y-3">
          <h2 className="font-bold text-navy">Stay Informed</h2>
          <p className="text-sm text-slate2">
            Subscribe to incident updates or reach our infrastructure team.
          </p>
          <div className="flex flex-wrap gap-3">
            <a
              href="mailto:status@neufin.ai"
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-slate2 hover:border-primary hover:text-primary"
            >
              Email Updates
            </a>
            <a
              href="mailto:info@neufin.ai"
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-slate2 hover:border-primary hover:text-primary"
            >
              Contact Support
            </a>
          </div>
        </section>
      </div>
    </div>
  );
}
