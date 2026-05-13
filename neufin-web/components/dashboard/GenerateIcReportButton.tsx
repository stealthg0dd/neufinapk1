"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";
import { apiFetch, apiGet, apiPost } from "@/lib/api-client";
import { stripeSuccessUrlReports } from "@/lib/stripe-checkout-urls";
import {
  getStoredReportTheme,
  getStoredReportMode,
  type ReportTheme,
} from "@/components/dashboard/ReportThemeModal";
import {
  hasFullAccess,
  type SubscriptionAccessInput,
} from "@/lib/subscription-access";

type Props = {
  portfolioId: string | null | undefined;
  className?: string;
  children?: React.ReactNode;
};

export function GenerateIcReportButton({
  portfolioId,
  className,
  children,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [showThemeModal, setShowThemeModal] = useState(false);

  const run = async (theme?: ReportTheme) => {
    if (!portfolioId) {
      toast.error(
        "No portfolio linked to this analysis. Run a portfolio analysis first.",
      );
      return;
    }

    const resolvedTheme = theme ?? getStoredReportTheme();

    try {
      setLoading(true);
      const statusRes = await apiGet<SubscriptionAccessInput>(
        "/api/subscription/status",
      );
      if (hasFullAccess(statusRes)) {
        const res = await apiFetch("/api/reports/generate", {
          method: "POST",
          body: JSON.stringify({
            portfolio_id: portfolioId,
            advisor_name: "NeuFin",
            theme: resolvedTheme,
            report_mode: getStoredReportMode(),
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          const detail =
            typeof (err as { detail?: unknown }).detail === "string"
              ? (err as { detail: string }).detail
              : "Report generation failed";
          throw new Error(detail);
        }
        const data = (await res.json()) as {
          pdf_url?: string;
          pdf_base64?: string;
          filename?: string;
          checkout_url?: string;
        };
        if (data.checkout_url) {
          window.location.href = data.checkout_url;
          return;
        }
        if (data.pdf_url) {
          window.open(data.pdf_url, "_blank");
          toast.success("Report ready");
        } else if (data.pdf_base64) {
          const bytes = Uint8Array.from(atob(data.pdf_base64), (c) =>
            c.charCodeAt(0),
          );
          const blob = new Blob([bytes], { type: "application/pdf" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = data.filename || "neufin-report.pdf";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          toast.success("Report ready");
        } else {
          toast.error("Report URL unavailable. Try again.");
        }
      } else {
        const origin =
          typeof window !== "undefined" ? window.location.origin : "";
        const { checkout_url } = await apiPost<{ checkout_url: string }>(
          "/api/reports/checkout",
          {
            plan: "single",
            portfolio_id: portfolioId,
            success_url: stripeSuccessUrlReports(origin),
            cancel_url: `${origin}/dashboard/reports`,
          },
        );
        window.location.href = checkout_url;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Report unavailable.";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void run()}
        disabled={loading || !portfolioId}
        className={
          className ??
          "text-xs text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-50"
        }
      >
        {loading ? (
          <span className="inline-flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Generating…
          </span>
        ) : (
          (children ?? "Generate Report")
        )}
      </button>
    </>
  );
}
