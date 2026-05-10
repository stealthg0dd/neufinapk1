"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { analyzeDNA, type DNAAnalysisResponse } from "@/lib/api";
import { apiPost } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import {
  useNeufinAnalytics,
  perfTimer,
  captureSentrySlowOp,
} from "@/lib/analytics";

export type NormalizedPosition = {
  ticker: string;
  security_name: string;
  quantity: number;
  market_value_usd: number | null;
  currency: string;
  exchange: string;
  asset_class: string;
  confidence_score: number;
  source_text: string;
  warnings: string[];
};

type NormalizeResponse = {
  positions: NormalizedPosition[];
  warnings: string[];
  confidence: "HIGH" | "MEDIUM" | "LOW";
};

function buildCsvForDna(rows: NormalizedPosition[]): string {
  const header = "symbol,shares,cost_basis";
  const equity = rows.filter((r) => r.asset_class === "equity");
  const lines = equity.map((r) => {
    const sym = String(r.ticker).replace(/,/g, "").trim();
    const q = Number.isFinite(r.quantity) ? r.quantity : 0;
    return `${sym},${q},`;
  });
  return [header, ...lines].join("\n");
}

export function RawInputClient() {
  const router = useRouter();
  const { token } = useAuth();
  const { capture } = useNeufinAnalytics();
  const [step, setStep] = useState<1 | 2>(1);
  const [rawText, setRawText] = useState("");
  const [marketCode, setMarketCode] = useState<"US" | "VN">("US");
  const [parseLoading, setParseLoading] = useState(false);
  const [analyzeLoading, setAnalyzeLoading] = useState(false);
  const [error, setError] = useState("");
  const [topWarnings, setTopWarnings] = useState<string[]>([]);
  const [confidence, setConfidence] = useState<string | null>(null);
  const [positions, setPositions] = useState<NormalizedPosition[]>([]);

  const equityCount = useMemo(
    () => positions.filter((p) => p.asset_class === "equity").length,
    [positions],
  );

  const onParse = async () => {
    setError("");
    setParseLoading(true);
    setTopWarnings([]);
    try {
      const data = await apiPost<NormalizeResponse>("/api/portfolio/normalize", {
        raw_text: rawText,
        market_code: marketCode,
      });
      setPositions(data.positions ?? []);
      setTopWarnings(data.warnings ?? []);
      setConfidence(data.confidence ?? null);
      setStep(2);
      capture("raw_portfolio_parsed", {
        count: (data.positions ?? []).length,
        confidence: data.confidence,
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Parse failed.");
    } finally {
      setParseLoading(false);
    }
  };

  const updateRow = (index: number, patch: Partial<NormalizedPosition>) => {
    setPositions((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  };

  const removeRow = (index: number) => {
    setPositions((prev) => prev.filter((_, i) => i !== index));
  };

  const addRow = () => {
    setPositions((prev) => [
      ...prev,
      {
        ticker: "",
        security_name: "",
        quantity: 0,
        market_value_usd: null,
        currency: "USD",
        exchange: "NASDAQ",
        asset_class: "equity",
        confidence_score: 1,
        source_text: "",
        warnings: ["Manually added row — verify symbol and quantity."],
      },
    ]);
  };

  const onAnalyze = async () => {
    setError("");
    const csv = buildCsvForDna(positions);
    if (!csv.includes("\n")) {
      setError("Add at least one equity row with a ticker and quantity.");
      return;
    }
    setAnalyzeLoading(true);
    perfTimer.start("dna_score");
    try {
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const file = new File([blob], "parsed-portfolio.csv", {
        type: "text/csv",
      });
      const result: DNAAnalysisResponse = await analyzeDNA(file, token);
      const durationMs = perfTimer.end("dna_score");
      localStorage.setItem("dnaResult", JSON.stringify(result));
      capture("raw_portfolio_to_dna", { tickers: equityCount });
      captureSentrySlowOp("dna_score", durationMs);
      router.push("/results");
    } catch (e: unknown) {
      perfTimer.end("dna_score");
      setError(e instanceof Error ? e.message : "Analysis failed.");
    } finally {
      setAnalyzeLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <p className="mt-1 text-sm text-slate2">
          Paste exports or handwritten lines. We parse locally on the server
          (deterministic), then you review before the same DNA analysis as{" "}
          <Link href="/upload?method=upload" className="text-primary hover:underline">
            CSV upload
          </Link>
          .
        </p>
      </div>

      {step === 1 ? (
        <div className="space-y-4 rounded-xl border border-border bg-white p-5 shadow-sm">
          <label className="block text-sm font-medium text-navy">
            Market context
          </label>
          <select
            value={marketCode}
            onChange={(e) => setMarketCode(e.target.value as "US" | "VN")}
            className="w-full max-w-xs rounded-lg border border-border bg-white px-3 py-2 text-sm text-navy"
          >
            <option value="US">US (default)</option>
            <option value="VN">Vietnam / SEA tickers (.VN)</option>
          </select>

          <label className="mt-2 block text-sm font-medium text-navy">
            Paste portfolio text
          </label>
          <textarea
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            rows={12}
            placeholder={`Examples:\nAAPL 25 shares\n25 shares of MSFT\nMSFT,10,3200\nVCI.VN\t500\t12000000\ncash USD 20000`}
            className="w-full rounded-lg border border-border bg-white px-3 py-2 font-mono text-sm text-navy placeholder:text-muted2"
          />

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={() => void onParse()}
            disabled={parseLoading || !rawText.trim()}
            className="btn-primary w-full max-w-md py-3 text-sm font-semibold disabled:opacity-50"
          >
            {parseLoading ? "Parsing…" : "Parse my portfolio"}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm text-slate2">
              Parser confidence:{" "}
              <span className="font-semibold text-navy">{confidence ?? "—"}</span>
              {equityCount < positions.length ? (
                <span className="ml-2 text-amber-700">
                  (Cash rows are not sent to DNA — equities only.)
                </span>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => setStep(1)}
              className="text-sm font-medium text-primary hover:underline"
            >
              ← Edit paste
            </button>
          </div>

          {topWarnings.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <p className="font-semibold">Warnings</p>
              <ul className="mt-1 list-disc pl-5">
                {topWarnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="overflow-x-auto rounded-xl border border-border bg-white shadow-sm">
            <table className="min-w-full divide-y divide-border text-left text-sm">
              <thead className="bg-surface-2 text-xs uppercase tracking-wide text-slate2">
                <tr>
                  <th className="px-3 py-2">Symbol</th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Qty</th>
                  <th className="px-3 py-2">Value (USD)</th>
                  <th className="px-3 py-2">Ccy</th>
                  <th className="px-3 py-2">Exch</th>
                  <th className="px-3 py-2">Conf</th>
                  <th className="px-3 py-2">Warnings</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-navy">
                {positions.map((row, i) => (
                  <tr key={`row-${i}`}>
                    <td className="px-3 py-2">
                      <input
                        className="w-24 rounded border border-border px-2 py-1 text-sm"
                        value={row.ticker}
                        onChange={(e) =>
                          updateRow(i, { ticker: e.target.value.toUpperCase() })
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        className="min-w-[8rem] rounded border border-border px-2 py-1 text-sm"
                        value={row.security_name}
                        onChange={(e) =>
                          updateRow(i, { security_name: e.target.value })
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        step="any"
                        className="w-24 rounded border border-border px-2 py-1 text-sm"
                        value={Number.isFinite(row.quantity) ? row.quantity : ""}
                        onChange={(e) =>
                          updateRow(i, {
                            quantity: parseFloat(e.target.value) || 0,
                          })
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        step="any"
                        className="w-28 rounded border border-border px-2 py-1 text-sm"
                        value={
                          row.market_value_usd == null
                            ? ""
                            : row.market_value_usd
                        }
                        onChange={(e) =>
                          updateRow(i, {
                            market_value_usd:
                              e.target.value === ""
                                ? null
                                : parseFloat(e.target.value),
                          })
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        className="w-14 rounded border border-border px-2 py-1 text-sm"
                        value={row.currency}
                        onChange={(e) =>
                          updateRow(i, { currency: e.target.value.toUpperCase() })
                        }
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        className="w-24 rounded border border-border px-2 py-1 text-sm"
                        value={row.exchange}
                        onChange={(e) => updateRow(i, { exchange: e.target.value })}
                      />
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {(row.confidence_score * 100).toFixed(0)}%
                    </td>
                    <td className="max-w-[10rem] px-3 py-2 text-xs text-slate2">
                      {(row.warnings ?? []).join("; ") || "—"}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() => removeRow(i)}
                        className="text-xs font-medium text-red-600 hover:underline"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            onClick={addRow}
            className="text-sm font-medium text-primary hover:underline"
          >
            + Add row
          </button>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void onAnalyze()}
              disabled={
                analyzeLoading || equityCount === 0 || positions.length === 0
              }
              className="btn-primary px-6 py-3 text-sm font-semibold disabled:opacity-50"
            >
              {analyzeLoading ? "Analyzing…" : "Proceed to analysis"}
            </button>
            <Link
              href="/upload?method=upload"
              className="btn-secondary inline-flex items-center px-6 py-3 text-sm"
            >
              Upload hub
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
