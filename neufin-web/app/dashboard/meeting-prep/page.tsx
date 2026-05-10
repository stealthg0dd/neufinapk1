"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, ChevronDown, ChevronUp } from "lucide-react";
import useSWR from "swr";
import { useAuth } from "@/lib/auth-context";
import { getSubscription, type SubscriptionInfo } from "@/lib/api";
import { apiFetch, apiGet } from "@/lib/api-client";
import { canAccessAdvisorProduct } from "@/lib/advisor-access";
import { isAdvisorModeEnabled } from "@/lib/featureFlags";

type ClientRow = { id: string; display_name?: string | null };

type ClientsResponse = { clients: ClientRow[] };

type BriefResp = {
  meeting_id?: string;
  draft_communication_id?: string;
  client_id?: string;
  meeting_date?: string;
  generated_at?: string;
  section_a?: Record<string, unknown>;
  section_b?: { flags?: Array<{ title: string; explanation: string }> };
  section_c?: { talking_points?: string[] };
  section_d?: {
    actions?: Array<{
      id?: string;
      title?: string;
      share_count?: string;
      timeline?: string;
      rationale?: string;
    }>;
  };
  section_e?: Record<string, unknown>;
  section_f?: { subject?: string; body?: string };
};

export default function MeetingPrepPage() {
  const { token, loading: authLoading } = useAuth();
  const [sub, setSub] = useState<SubscriptionInfo | null>(null);
  const [clientId, setClientId] = useState("");
  const [meetingDate, setMeetingDate] = useState("");
  const [notes, setNotes] = useState("");
  const [brief, setBrief] = useState<BriefResp | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const advisorMode = isAdvisorModeEnabled();
  const entitled = canAccessAdvisorProduct(sub);

  useEffect(() => {
    if (!token) {
      setSub(null);
      return;
    }
    void getSubscription(token)
      .then(setSub)
      .catch(() => setSub(null));
  }, [token]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search);
    const c = q.get("client");
    const d = q.get("meeting_date");
    if (c) setClientId(c);
    if (d) setMeetingDate(d.slice(0, 10));
  }, []);

  const { data: clientList } = useSWR(
    advisorMode && entitled && token ? "/api/advisor/clients" : null,
    (url: string) => apiGet<ClientsResponse>(url),
  );
  const clients = useMemo(
    () =>
      (clientList?.clients ?? []).map((c) => ({
        id: c.id,
        label: c.display_name ?? `Client ${c.id.slice(0, 8)}`,
      })),
    [clientList],
  );

  const showConfigure = useMemo(() => {
    if (brief) return false;
    return !clientId || !meetingDate;
  }, [brief, clientId, meetingDate]);

  const onGenerate = useCallback(async () => {
    if (!clientId.trim() || !meetingDate.trim()) {
      setError("Select a client and meeting date.");
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const res = await apiFetch("/api/advisor/meeting-prep", {
        method: "POST",
        body: JSON.stringify({
          client_id: clientId.trim(),
          meeting_date: meetingDate.trim(),
          notes: notes.trim() || null,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        const d = j.detail;
        const msg =
          typeof d === "string"
            ? d
            : Array.isArray(d)
              ? d.map((x: { msg?: string }) => x.msg).join(", ")
              : "Generation failed";
        throw new Error(msg);
      }
      const data = (await res.json()) as BriefResp;
      setBrief(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not generate prep.");
    } finally {
      setGenerating(false);
    }
  }, [clientId, meetingDate, notes]);

  const patchMeeting = async (body: Record<string, unknown>) => {
    if (!brief?.meeting_id) return;
    const res = await apiFetch(
      `/api/advisor/meeting-prep/${encodeURIComponent(brief.meeting_id)}`,
      { method: "PATCH", body: JSON.stringify(body) },
    );
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(typeof j.detail === "string" ? j.detail : "Update failed");
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-2 text-muted2">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading…
      </div>
    );
  }

  if (!advisorMode || !entitled) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <h1 className="text-xl font-semibold text-navy">Meeting prep</h1>
        <p className="mt-2 text-sm text-muted2">
          Advisor access and advisor mode are required for this workspace.
        </p>
        <Link href="/pricing" className="mt-4 inline-block text-sm text-primary">
          View plans →
        </Link>
      </div>
    );
  }

  const sa = brief?.section_a as
    | {
        dna_score?: { old?: number | null; new?: number | null; delta?: number | null };
        churn_risk?: { old?: string; new?: string };
        new_bias_flags_since_last_review?: string[];
        largest_position_changes?: Array<{
          symbol?: string;
          delta_pct?: number;
          current_pct?: number;
        }>;
        regime?: { label?: string; confidence?: number };
      }
    | undefined;

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 pb-20 pt-8 md:px-6">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Link href="/dashboard/morning-brief" className="text-muted2 hover:text-primary-dark">
          ← Morning brief
        </Link>
        <span className="text-border">|</span>
        <Link href="/advisor/clients" className="text-muted2 hover:text-primary-dark">
          Client book
        </Link>
      </div>

      <header>
        <p className="text-label">Advisor</p>
        <h1 className="text-2xl font-bold text-navy">Meeting prep agent</h1>
        <p className="mt-1 text-sm text-muted2">
          One-page brief before each client meeting — metrics only to the model; no raw
          portfolio rows.
        </p>
      </header>

      {showConfigure && (
        <section className="rounded-2xl border border-border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-navy">Step 1 · Configure</h2>
          <div className="mt-4 space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-navy">Client</label>
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="input-base w-full text-sm"
              >
                <option value="">Select client…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-navy">
                Meeting date
              </label>
              <input
                type="date"
                value={meetingDate}
                onChange={(e) => setMeetingDate(e.target.value)}
                className="input-base w-full text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-navy">
                Optional context / notes
              </label>
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Topics the client raised, constraints, or meeting goals…"
                className="input-base w-full resize-none text-sm"
              />
            </div>
            {error && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </p>
            )}
            <button
              type="button"
              disabled={generating}
              onClick={() => void onGenerate()}
              className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
            >
              {generating ? "Generating…" : "Generate Prep Brief →"}
            </button>
          </div>
        </section>
      )}

      {!showConfigure && !brief && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void onGenerate()}
            disabled={generating}
            className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-dark disabled:opacity-50"
          >
            {generating ? (
              <>
                <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                Generating…
              </>
            ) : (
              "Generate Prep Brief →"
            )}
          </button>
        </div>
      )}

      {brief && (
        <div id="meeting-prep-print" className="space-y-8 print:text-black">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-navy">Step 2 · Prep brief</h2>
            <div className="flex items-center gap-3">
              <p className="text-xs text-muted2">
                {brief.generated_at
                  ? new Date(brief.generated_at).toLocaleString()
                  : ""}
              </p>
              <button
                type="button"
                className="text-xs font-medium text-primary hover:underline"
                onClick={() => {
                  setBrief(null);
                  setError(null);
                }}
              >
                Change inputs
              </button>
            </div>
          </div>

          <section className="rounded-xl border border-border bg-white p-5">
            <h3 className="text-sm font-bold uppercase tracking-wide text-primary">
              Section A · What changed since last review
            </h3>
            <ul className="mt-3 list-inside list-disc space-y-2 text-sm text-readable">
              <li>
                DNA score:{" "}
                <span className="font-mono tabular-nums">
                  {sa?.dna_score?.old ?? "—"} → {sa?.dna_score?.new ?? "—"}
                </span>
                {sa?.dna_score?.delta != null && (
                  <span className="text-muted2">
                    {" "}
                    (Δ {sa.dna_score.delta > 0 ? "+" : ""}
                    {sa.dna_score.delta})
                  </span>
                )}
              </li>
              <li>
                Churn risk: {sa?.churn_risk?.old ?? "—"} → {sa?.churn_risk?.new ?? "—"}
              </li>
              <li>
                New bias flags:{" "}
                {(sa?.new_bias_flags_since_last_review ?? []).length
                  ? (sa?.new_bias_flags_since_last_review ?? []).join(", ")
                  : "None flagged vs prior snapshot."}
              </li>
              <li>
                Largest weight moves (pts):{" "}
                {(sa?.largest_position_changes ?? []).length
                  ? (sa?.largest_position_changes ?? [])
                      .map(
                        (p) =>
                          `${p.symbol} ${p.delta_pct != null && p.delta_pct > 0 ? "+" : ""}${p.delta_pct ?? ""}% (now ${p.current_pct ?? "—"}%)`,
                      )
                      .join(" · ")
                  : "Insufficient snapshot history for delta view."}
              </li>
              <li>
                Regime: {String(sa?.regime?.label ?? "—")}
                {sa?.regime?.confidence != null ? (
                  <>
                    {" "}
                    · confidence{" "}
                    {`${Math.round(
                      Number(sa.regime.confidence) <= 1
                        ? Number(sa.regime.confidence) * 100
                        : Number(sa.regime.confidence),
                    )}%`}
                  </>
                ) : null}
              </li>
            </ul>
          </section>

          <section className="rounded-xl border border-border bg-white p-5">
            <h3 className="text-sm font-bold uppercase tracking-wide text-primary">
              Section B · Key risks to discuss
            </h3>
            <ul className="mt-3 space-y-3 text-sm">
              {(brief.section_b?.flags ?? []).map((f, i) => (
                <li key={i} className="rounded-lg bg-surface-2 px-3 py-2">
                  <p className="font-semibold text-navy">{f.title}</p>
                  <p className="mt-1 text-muted2">{f.explanation}</p>
                </li>
              ))}
              {(brief.section_b?.flags ?? []).length === 0 && (
                <li className="text-muted2">No additional narrative flags generated.</li>
              )}
            </ul>
          </section>

          <section className="rounded-xl border border-border bg-white p-5">
            <h3 className="text-sm font-bold uppercase tracking-wide text-primary">
              Section C · Suggested talking points
            </h3>
            <ul className="mt-3 list-inside list-decimal space-y-2 text-sm text-readable">
              {(brief.section_c?.talking_points ?? []).map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </section>

          <section className="rounded-xl border border-border bg-white p-5">
            <h3 className="text-sm font-bold uppercase tracking-wide text-primary">
              Section D · Recommended actions
            </h3>
            <ol className="mt-3 list-inside list-decimal space-y-3 text-sm">
              {(brief.section_d?.actions ?? []).map((a, i) => (
                <li key={i}>
                  <span className="font-medium text-navy">{a.title}</span>
                  <span className="text-muted2">
                    {" "}
                    · {a.share_count} · {a.timeline}
                  </span>
                  {a.rationale ? (
                    <p className="mt-1 text-muted2">{a.rationale}</p>
                  ) : null}
                </li>
              ))}
            </ol>
          </section>

          <section className="rounded-xl border border-border bg-white p-5">
            <h3 className="text-sm font-bold uppercase tracking-wide text-primary">
              Section E · Compliance note
            </h3>
            <ul className="mt-3 space-y-2 text-sm text-readable">
              <li>{String(brief.section_e?.risk_tier_change ?? "—")}</li>
              <li>{String(brief.section_e?.suitability_line ?? "—")}</li>
              <li>Current IC Readiness: {String(brief.section_e?.ic_readiness ?? "—")}</li>
            </ul>
          </section>

          <section className="rounded-xl border border-border bg-white p-5">
            <button
              type="button"
              onClick={() => setEmailOpen(!emailOpen)}
              className="flex w-full items-center justify-between text-left"
            >
              <h3 className="text-sm font-bold uppercase tracking-wide text-primary">
                Section F · Draft follow-up email
              </h3>
              {emailOpen ? (
                <ChevronUp className="h-4 w-4 shrink-0" />
              ) : (
                <ChevronDown className="h-4 w-4 shrink-0" />
              )}
            </button>
            {emailOpen && (
              <div className="mt-3 space-y-2 text-sm">
                <p className="font-medium text-navy">{brief.section_f?.subject}</p>
                <pre className="whitespace-pre-wrap rounded-lg bg-surface-2 p-3 font-sans text-readable">
                  {brief.section_f?.body}
                </pre>
                <p className="text-xs text-muted2">
                  Saved as draft on client record (id: {brief.draft_communication_id ?? "—"}
                  ).
                </p>
              </div>
            )}
          </section>

          <footer className="space-y-4 rounded-xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-950 print:border-gray-300 print:bg-white">
            <p>
              This is a draft brief for advisor review. Not for distribution without advisor
              approval.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium hover:bg-surface-2"
                onClick={() => window.print()}
              >
                Export PDF
              </button>
              <button
                type="button"
                className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium hover:bg-surface-2"
                onClick={() => {
                  void (async () => {
                    try {
                      await patchMeeting({ prep_status: "saved" });
                      setToast("Saved as draft on meeting record.");
                    } catch (e: unknown) {
                      setToast(e instanceof Error ? e.message : "Save failed");
                    }
                    setTimeout(() => setToast(null), 4000);
                  })();
                }}
              >
                Save as Draft
              </button>
              <button
                type="button"
                className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary-dark"
                onClick={() => {
                  void (async () => {
                    try {
                      await patchMeeting({ prep_status: "used" });
                      setToast("Marked as used.");
                    } catch (e: unknown) {
                      setToast(e instanceof Error ? e.message : "Update failed");
                    }
                    setTimeout(() => setToast(null), 4000);
                  })();
                }}
              >
                Mark as Used
              </button>
            </div>
          </footer>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-navy px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
